const config = require('../config');
const wechat = require('../wechat');
const oaShareService = require('./oaShareService');
const visitStoreIntentService = require('./visitStoreIntentService');
const userFields = require('./userFields');
const db = require('../db');

function truncate(value, max = 20) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(max - 1, 1))}…`;
}

function buildWelcomeCardTitle(storeName) {
  const name = truncate(storeName, 10);
  if (!name) return '';
  const templates = [
    `${name} · 毛孩子等你来看`,
    `来${name}看毛孩子啦～`,
    `${name}喊你看寄养动态`
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i)) % templates.length;
  }
  return templates[hash] || templates[0];
}

function getWelcomeConfig() {
  return (config.wxOa && config.wxOa.welcome) || {};
}

/**
 * 关注事件被动回复 XML（明文或 AES 加密包）
 */
function buildSubscribeReplyXml(msg, options = {}) {
  const welcome = getWelcomeConfig();
  const content = String(welcome.text || '').trim();
  if (!content || !msg) return '';

  const plainXml = wechat.buildPassiveTextReply({
    toUser: msg.FromUserName,
    fromUser: msg.ToUserName,
    content
  });

  if (!options.encrypt) return plainXml;

  const oa = config.wxOa || {};
  return wechat.encryptOaReply(
    plainXml,
    oa.aesKey,
    oa.appId,
    oa.token,
    options.timestamp,
    options.nonce
  );
}

async function bindVisitStoreForUser(userId, storeId) {
  const sid = String(storeId || '').trim();
  if (!userId || !sid) return;
  await db.updateById('users', userId, {
    visitStoreId: sid,
    store_id: sid,
    updateTime: Date.now()
  });
}

/**
 * 从用户资料 / 订单推断当前关联店铺（绑定码关注时用）
 */
async function resolveStoreIdForUserDoc(user) {
  if (!user) return '';

  const visitStoreId = userFields.resolveVisitStoreId(user);
  if (visitStoreId) return visitStoreId;

  const merchantStoreId = userFields.resolveMerchantStoreId(user);
  if (merchantStoreId) return merchantStoreId;

  const openid = String(user.openid || (user.openids && user.openids.user) || '').trim();
  if (!openid) return '';

  const orders = await db.findMany('orders', { userOpenid: openid }, {
    limit: 30,
    sort: { updateTime: -1 }
  });
  const boarding = orders.find((item) => item && item.status === 'boarding' && item.store_id);
  if (boarding && boarding.store_id) return String(boarding.store_id).trim();

  const latest = orders.find((item) => item && item.store_id);
  return latest ? String(latest.store_id).trim() : '';
}

async function resolveStoreIdForUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) return '';
  const user = await db.findById('users', id);
  return resolveStoreIdForUserDoc(user);
}

/**
 * 关注/扫码后：登记店铺意向，并异步推送商家端小程序卡片（封面用店铺头像）
 */
async function handleStoreFollowSideEffects({ oaOpenid, storeId, unionid, userId }) {
  const sid = String(storeId || '').trim();
  if (!sid) {
    return sendWelcomeMiniprogramCard(oaOpenid);
  }

  if (unionid) {
    try {
      await visitStoreIntentService.registerIntent({
        unionid,
        storeId: sid,
        sourceOpenid: oaOpenid || ''
      });
    } catch (err) {
      console.warn('[oa] register visit intent failed', err.message || err);
    }
  }

  if (userId) {
    try {
      await bindVisitStoreForUser(userId, sid);
      if (unionid) {
        await visitStoreIntentService.removeIntent(unionid);
      }
    } catch (err) {
      console.warn('[oa] bind visit store failed', err.message || err);
    }
  }

  return sendWelcomeMiniprogramCard(oaOpenid, { storeId: sid });
}

/**
 * 关注后异步推送商家端小程序卡片（客服消息）
 * @param {string} oaOpenid
 * @param {{ storeId?: string }} [options]
 */
async function sendWelcomeMiniprogramCard(oaOpenid, options = {}) {
  if (!oaOpenid) return { sent: false, reason: 'missing_openid' };

  const welcome = getWelcomeConfig();
  const merchantAppId = (config.wxApps && config.wxApps.merchant && config.wxApps.merchant.appId) || '';
  const appid = String(welcome.mpAppId || merchantAppId || '').trim();
  let pagepath = String(welcome.mpPath || '').trim() || 'pages/index/index';
  let title = String(welcome.mpTitle || '').trim() || '打开商家小程序';
  let thumbMediaId = String(welcome.thumbMediaId || '').trim();
  const storeId = String((options && options.storeId) || '').trim();

  if (!appid || !pagepath) {
    console.warn('[oa] welcome miniprogram skipped: missing mp appid/path');
    return { sent: false, reason: 'missing_mp_config' };
  }

  if (storeId) {
    pagepath = `pages/index/index?store_id=${encodeURIComponent(storeId)}`;
    const storeDoc = await oaShareService.findStoreById(storeId);
    if (storeDoc) {
      const name = String(storeDoc.name || '').trim();
      if (name) {
        title = buildWelcomeCardTitle(name) || `${name} · 在线预约寄养`;
      }
      thumbMediaId = (await oaShareService.resolveStoreLogoThumbMediaId(storeDoc)) || thumbMediaId;
    }
  }

  if (!thumbMediaId) {
    console.warn('[oa] welcome miniprogram skipped: missing thumb_media_id');
    return { sent: false, reason: 'missing_thumb_media_id' };
  }

  await wechat.sendCustomMessage({
    touser: oaOpenid,
    msgtype: 'miniprogrampage',
    miniprogrampage: {
      title,
      appid,
      pagepath,
      thumb_media_id: thumbMediaId
    }
  });
  return { sent: true, storeId, title, pagepath, appid };
}

module.exports = {
  buildSubscribeReplyXml,
  sendWelcomeMiniprogramCard,
  handleStoreFollowSideEffects,
  resolveStoreIdForUserDoc,
  resolveStoreIdForUserId,
  buildWelcomeCardTitle
};
