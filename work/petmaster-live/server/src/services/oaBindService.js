const db = require('../db');
const wechat = require('../wechat');
const identity = require('./identity');

const PENDING_COLLECTION = 'oa_pending_binds';

async function ensurePendingCollection() {
  await db.ensureCollections([PENDING_COLLECTION]);
}

async function savePendingBind({ oaOpenid, unionid }) {
  if (!oaOpenid) return null;
  await ensurePendingCollection();
  const existing = await db.findMany(PENDING_COLLECTION, { oaOpenid }, { limit: 1 });
  const now = Date.now();
  const patch = {
    oaOpenid,
    unionid: unionid || '',
    updateTime: now
  };
  if (existing.length) {
    // 已有 unionid 时不要被空值覆盖
    if (!patch.unionid && existing[0].unionid) {
      patch.unionid = existing[0].unionid;
    }
    return db.updateById(PENDING_COLLECTION, existing[0]._id, patch);
  }
  return db.insertOne(PENDING_COLLECTION, {
    ...patch,
    createTime: now
  });
}

async function removePendingByOaOpenid(oaOpenid) {
  if (!oaOpenid) return;
  await ensurePendingCollection();
  await db.deleteMany(PENDING_COLLECTION, { oaOpenid });
}

async function findPendingByUnionid(unionid) {
  if (!unionid) return null;
  await ensurePendingCollection();
  const rows = await db.findMany(PENDING_COLLECTION, { unionid }, { limit: 1 });
  return rows[0] || null;
}

async function bindOaOpenidToUser(user, oaOpenid, unionid) {
  if (!user || !oaOpenid) return user;
  const openids = {
    ...(user.openids || {}),
    oa: oaOpenid
  };
  if (!openids.user && user.openid) {
    openids.user = user.openid;
  }
  const patch = {
    openids,
    updateTime: Date.now()
  };
  if (unionid && !user.unionid) {
    patch.unionid = unionid;
  }
  const updated = await db.updateById('users', user._id, patch);
  await removePendingByOaOpenid(oaOpenid);
  return updated;
}

async function clearOaOpenid(oaOpenid) {
  if (!oaOpenid) return;
  const users = await identity.findUsersByOpenidAny(oaOpenid);
  for (const user of users) {
    const openids = { ...(user.openids || {}) };
    if (openids.oa !== oaOpenid) continue;
    delete openids.oa;
    await db.updateById('users', user._id, {
      openids,
      updateTime: Date.now()
    });
  }
  await removePendingByOaOpenid(oaOpenid);
}

/**
 * 用服务号 openid 拉取 unionid（需公众号 IP 白名单）
 */
async function resolveOaUnionid(oaOpenid, hintUnionid = '') {
  if (hintUnionid) return hintUnionid;
  if (!oaOpenid) return '';
  try {
    const info = await wechat.getOaUserInfo(oaOpenid);
    return info.unionid || '';
  } catch (err) {
    console.warn('[oa] getOaUserInfo failed', err.message || err);
    return '';
  }
}

/**
 * 关注服务号：用 unionid 绑定到已有用户；否则写入待绑定表
 * @param {string} oaOpenid
 * @param {{ unionid?: string }} [options] 事件里若已带 UnionId 可传入，避免依赖 user/info
 */
async function handleOaSubscribe(oaOpenid, options = {}) {
  if (!oaOpenid) return { bound: false };
  const unionid = await resolveOaUnionid(oaOpenid, (options && options.unionid) || '');

  if (unionid) {
    const users = await identity.findUsersByUnionid(unionid);
    const user = identity.pickPrimaryUser(users);
    if (user) {
      await bindOaOpenidToUser(user, oaOpenid, unionid);
      return { bound: true, unionid, userId: String(user._id) };
    }
  }

  await savePendingBind({ oaOpenid, unionid });
  return { bound: false, unionid, pending: true };
}

async function handleOaUnsubscribe(oaOpenid) {
  await clearOaOpenid(oaOpenid);
  return { unbound: true };
}

/**
 * 补全待绑表里缺失的 unionid（IP 白名单修好后，拉用户时可自动修复历史关注）
 */
async function hydratePendingUnionids(limit = 20) {
  await ensurePendingCollection();
  const rows = await db.findMany(PENDING_COLLECTION, {}, { limit: Math.max(1, Math.min(limit, 50)) });
  let hydrated = 0;
  for (const row of rows) {
    if (!row || !row.oaOpenid || row.unionid) continue;
    const unionid = await resolveOaUnionid(row.oaOpenid);
    if (!unionid) continue;
    await db.updateById(PENDING_COLLECTION, row._id, {
      unionid,
      updateTime: Date.now()
    });
    hydrated += 1;
  }
  return hydrated;
}

/**
 * 小程序登录后：若有同 unionid 的待绑 OA openid，写入 users.openids.oa
 */
async function attachPendingOaByUnionid(user, unionid) {
  if (!user) return user;
  const openids = user.openids || {};
  if (openids.oa) return user;

  const uid = unionid || user.unionid || '';
  if (!uid) return user;

  // 历史关注时 IP 白名单失败会导致 pending.unionid 为空，这里先尝试补全再匹配
  try {
    await hydratePendingUnionids(20);
  } catch (err) {
    console.warn('[oa] hydratePendingUnionids failed', err.message || err);
  }

  const pending = await findPendingByUnionid(uid);
  if (!pending || !pending.oaOpenid) return user;

  return bindOaOpenidToUser(user, pending.oaOpenid, uid);
}

function getOaOpenidFromUser(user) {
  if (!user) return '';
  const openids = user.openids || {};
  return openids.oa || '';
}

module.exports = {
  handleOaSubscribe,
  handleOaUnsubscribe,
  attachPendingOaByUnionid,
  getOaOpenidFromUser,
  bindOaOpenidToUser,
  clearOaOpenid,
  hydratePendingUnionids
};
