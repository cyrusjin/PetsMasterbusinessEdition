const crypto = require('crypto');
const db = require('../db');
const wechat = require('../wechat');
const identity = require('./identity');
const oaBindService = require('./oaBindService');
const oaWelcomeService = require('./oaWelcomeService');

const COLLECTION = 'oa_bind_tickets';
const SCENE_PREFIX = 'ob_';
const TTL_MS = 30 * 60 * 1000;

async function ensureCollection() {
  await db.ensureCollections([COLLECTION]);
}

function normalizeEventKey(eventKey) {
  let key = String(eventKey || '').trim();
  if (!key) return '';
  if (/^qrscene_/i.test(key)) {
    key = key.replace(/^qrscene_/i, '');
  }
  return key.trim();
}

function parseTicketIdFromEventKey(eventKey) {
  const key = normalizeEventKey(eventKey);
  if (!key.startsWith(SCENE_PREFIX)) return '';
  return key.slice(SCENE_PREFIX.length).trim();
}

/**
 * 为当前小程序用户创建临时关注绑定码（不依赖 UnionID）
 */
async function createBindQr(mpOpenid) {
  const openid = String(mpOpenid || '').trim();
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  await ensureCollection();
  const ticketId = crypto.randomBytes(8).toString('hex');
  const sceneStr = `${SCENE_PREFIX}${ticketId}`.slice(0, 64);
  const now = Date.now();
  const expireAt = now + TTL_MS;

  const qr = await wechat.createOaQrCode({
    sceneStr,
    expireSeconds: Math.floor(TTL_MS / 1000)
  });

  const user = await identity.findPrimaryUserByOpenid(openid);
  const storeId = user ? await oaWelcomeService.resolveStoreIdForUserDoc(user) : '';

  await db.insertOne(COLLECTION, {
    ticketId,
    sceneStr,
    mpOpenid: openid,
    storeId: storeId || '',
    createTime: now,
    expireAt,
    used: false
  });

  return {
    success: true,
    ticketId,
    sceneStr,
    storeId: storeId || '',
    showQrcodeUrl: qr.showQrcodeUrl,
    expireAt
  };
}

/**
 * 扫码/关注带参码时：把服务号 openid 绑到小程序用户
 */
async function consumeBindScene(eventKey, oaOpenid) {
  const ticketId = parseTicketIdFromEventKey(eventKey);
  if (!ticketId || !oaOpenid) return null;

  await ensureCollection();
  const rows = await db.findMany(COLLECTION, { ticketId }, { limit: 1 });
  const row = rows[0];
  if (!row || row.used) return null;
  if (row.expireAt && row.expireAt < Date.now()) return null;

  const user = await identity.findPrimaryUserByOpenid(row.mpOpenid);
  if (!user) return null;

  const updated = await oaBindService.bindOaOpenidToUser(
    user,
    oaOpenid,
    user.unionid || ''
  );

  await db.updateById(COLLECTION, row._id, {
    used: true,
    oaOpenid,
    usedAt: Date.now(),
    updateTime: Date.now()
  });

  return {
    bound: true,
    ticketId,
    userId: String((updated && updated._id) || user._id),
    mpOpenid: row.mpOpenid,
    storeId: String(row.storeId || '').trim() || (await oaWelcomeService.resolveStoreIdForUserDoc(updated || user))
  };
}

/**
 * 不依赖 UnionID：若用户曾扫过绑定码且 ticket 已记 oaOpenid，但 users.openids.oa 丢失，则自动补绑。
 */
async function repairOaBindFromTickets(mpOpenid) {
  const openid = String(mpOpenid || '').trim();
  if (!openid) return null;

  const user = await identity.findPrimaryUserByOpenid(openid);
  if (!user) return null;
  if (oaBindService.getOaOpenidFromUser(user)) return user;

  const candidates = new Set(identity.collectOpenids(user));
  candidates.add(openid);
  const mpOpenids = [...candidates].filter(Boolean);
  if (!mpOpenids.length) return user;

  await ensureCollection();
  const rows = await db.findMany(COLLECTION, {
    used: true,
    mpOpenid: { $in: mpOpenids },
    oaOpenid: { $exists: true, $nin: ['', null] }
  }, { limit: 1, sort: { usedAt: -1, updateTime: -1 } });

  const row = rows[0];
  const oaOpenid = row && String(row.oaOpenid || '').trim();
  if (!oaOpenid) return user;

  console.log('[oa] repair bind from ticket', {
    mpOpenid: openid,
    ticketId: row.ticketId,
    oaOpenid
  });
  return oaBindService.bindOaOpenidToUser(user, oaOpenid, user.unionid || '');
}

module.exports = {
  SCENE_PREFIX,
  createBindQr,
  consumeBindScene,
  parseTicketIdFromEventKey,
  repairOaBindFromTickets
};
