const db = require('../db');
const { normalizeClient } = require('../wechat');
const userFields = require('./userFields');

/**
 * 双小程序 + 服务号身份：
 * - users.openid：业务主 openid（兼容历史订单/店铺 ownerOpenid）
 * - users.openids.user / users.openids.merchant：两端各自 openid
 * - users.openids.oa：服务号 openid（模板消息推送）
 * - users.unionid：微信开放平台 UnionID（两端/服务号绑同一开放平台账号时可用）
 */

function buildOpenidQuery(openid) {
  if (!openid) return null;
  return {
    $or: [
      { openid },
      { 'openids.user': openid },
      { 'openids.merchant': openid },
      { 'openids.oa': openid },
      { linkedOpenids: openid }
    ]
  };
}

async function findUsersByOpenidAny(openid) {
  const query = buildOpenidQuery(openid);
  if (!query) return [];
  return db.findMany('users', query);
}

async function findUsersByUnionid(unionid) {
  if (!unionid) return [];
  return db.findMany('users', { unionid });
}

async function findUsersByPhone(phone) {
  if (!phone) return [];
  return db.findMany('users', { phone });
}

function collectOpenids(userOrOpenid) {
  if (!userOrOpenid) return [];
  if (typeof userOrOpenid === 'string') return [userOrOpenid.trim()].filter(Boolean);
  const set = new Set();
  if (userOrOpenid.openid) set.add(String(userOrOpenid.openid).trim());
  const openids = userOrOpenid.openids || {};
  if (openids.user) set.add(String(openids.user).trim());
  if (openids.merchant) set.add(String(openids.merchant).trim());
  if (openids.oa) set.add(String(openids.oa).trim());
  return [...set].filter(Boolean);
}

async function findPrimaryUserByOpenid(openid) {
  const records = await findUsersByOpenidAny(openid);
  return pickPrimaryUser(records);
}

function pickPrimaryUser(records) {
  if (!records.length) return null;
  const merchantApproved = records.find((item) => {
    const status = String(item.merchantStatus || '').toLowerCase();
    return status === 'approved' || item.isMerchant === true;
  });
  if (merchantApproved) return merchantApproved;
  return records.sort((a, b) => {
    const timeDiff = (b.updateTime || b.createTime || 0) - (a.updateTime || a.createTime || 0);
    if (timeDiff !== 0) return timeDiff;
    return (a.createTime || 0) - (b.createTime || 0);
  })[0];
}

async function attachClientIdentity(user, { openid, unionid, client }) {
  if (!user || !openid) return user;
  const appClient = normalizeClient(client);
  const openids = {
    ...(user.openids || {}),
    [appClient]: openid
  };
  // 历史数据：主 openid 视为宠主端
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
  // 主 openid 优先保留宠主端，保证历史店铺/订单归属不断
  if (!user.openid) {
    patch.openid = openid;
  } else if (appClient === 'user' && user.openid !== openid && !openids.merchant) {
    // 极少见：仅有商家 openid 后补绑宠主端时，切回宠主主 openid
    patch.openid = openid;
  }
  return db.updateById('users', user._id, patch);
}

async function resolveLoginUser({ openid, unionid, client }) {
  const appClient = normalizeClient(client);
  if (!openid) {
    throw new Error('无法获取 openid');
  }

  let records = await findUsersByOpenidAny(openid);
  if (!records.length && unionid) {
    records = await findUsersByUnionid(unionid);
  }

  let user = pickPrimaryUser(records);
  if (user) {
    user = await attachClientIdentity(user, { openid, unionid, client: appClient });
    try {
      const oaBindService = require('./oaBindService');
      user = await oaBindService.attachPendingOaByUnionid(user, unionid || user.unionid);
    } catch (err) {
      console.warn('[identity] attachPendingOaByUnionid failed', err.message || err);
    }
    if (appClient === 'user') {
      try {
        const visitStoreIntentService = require('./visitStoreIntentService');
        const consumed = await visitStoreIntentService.consumeIntentForUser(user);
        if (consumed.consumed) user = consumed.user;
      } catch (err) {
        console.warn('[identity] consumeIntentForUser failed', err.message || err);
      }
    }
    return user;
  }

  const now = Date.now();
  const openids = { [appClient]: openid };
  let newUser = {
    openid,
    openids,
    unionid: unionid || '',
    nickName: '',
    avatarUrl: '',
    phone: '',
    realName: '',
    idCard: '',
    address: '',
    store_id: '',
    merchantStoreId: '',
    visitStoreId: '',
    pet_ids: [],
    isMerchant: false,
    merchantStatus: '',
    createTime: now,
    updateTime: now
  };
  newUser = await db.insertOne('users', newUser);
  try {
    const oaBindService = require('./oaBindService');
    newUser = await oaBindService.attachPendingOaByUnionid(newUser, unionid);
  } catch (err) {
    console.warn('[identity] attachPendingOaByUnionid failed', err.message || err);
  }
  if (appClient === 'user') {
    try {
      const visitStoreIntentService = require('./visitStoreIntentService');
      const consumed = await visitStoreIntentService.consumeIntentForUser(newUser);
      if (consumed.consumed) newUser = consumed.user;
    } catch (err) {
      console.warn('[identity] consumeIntentForUser failed', err.message || err);
    }
  }
  return newUser;
}

/**
 * 手机号打通：商家端新账号绑定手机号后，合并到已有同手机号账号（优先商家已审核账号）
 */
async function mergeByPhone(currentUser, phone) {
  if (!currentUser || !phone) return currentUser;
  const others = (await findUsersByPhone(phone)).filter(
    (item) => String(item._id) !== String(currentUser._id)
  );
  if (!others.length) {
    return db.updateById('users', currentUser._id, {
      phone,
      updateTime: Date.now()
    });
  }

  const target = pickPrimaryUser(others);
  const openids = {
    ...(target.openids || {}),
    ...(currentUser.openids || {})
  };
  if (currentUser.openid && !openids.user && !openids.merchant) {
    openids.user = currentUser.openid;
  }
  if (target.openid && !openids.user) {
    openids.user = target.openid;
  }

  const now = Date.now();
  const merchantStoreId = userFields.resolveMerchantStoreId(target)
    || userFields.resolveMerchantStoreId(currentUser);
  const visitStoreId = userFields.resolveVisitStoreId(target)
    || userFields.resolveVisitStoreId(currentUser);
  const merged = await db.updateById('users', target._id, {
    phone,
    openids,
    unionid: target.unionid || currentUser.unionid || '',
    nickName: target.nickName || currentUser.nickName || '',
    avatarUrl: target.avatarUrl || currentUser.avatarUrl || '',
    realName: target.realName || currentUser.realName || '',
    idCard: target.idCard || currentUser.idCard || '',
    address: target.address || currentUser.address || '',
    merchantStoreId,
    visitStoreId,
    store_id: visitStoreId,
    pet_ids: [...new Set([
      ...(Array.isArray(target.pet_ids) ? target.pet_ids : []),
      ...(Array.isArray(currentUser.pet_ids) ? currentUser.pet_ids : [])
    ])],
    isMerchant: !!(target.isMerchant || currentUser.isMerchant),
    merchantStatus: target.merchantStatus || currentUser.merchantStatus || '',
    merchantRole: target.merchantRole || currentUser.merchantRole || '',
    updateTime: now
  });

  // 删除当前空壳账号（避免双份）
  await db.deleteMany('users', { _id: currentUser._id });
  return merged;
}

module.exports = {
  buildOpenidQuery,
  collectOpenids,
  findUsersByOpenidAny,
  findUsersByUnionid,
  findUsersByPhone,
  findPrimaryUserByOpenid,
  resolveLoginUser,
  attachClientIdentity,
  mergeByPhone,
  pickPrimaryUser
};
