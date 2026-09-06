const db = require('../db');
const wechat = require('../wechat');
const config = require('../config');
const identity = require('./identity');
const userFields = require('./userFields');

const COLLECTIONS = ['users', 'stores', 'pets', 'orders', 'daily_logs'];

const {
  normalizeIsMerchant,
  normalizeMerchantStatus,
  isMerchantApprovedFromDoc,
  formatUserStoreFields
} = userFields;

function formatUser(doc) {
  const merchantStatus = normalizeMerchantStatus(doc.merchantStatus);
  const isMerchant = isMerchantApprovedFromDoc(doc);
  const petIds = Array.isArray(doc.pet_ids)
    ? [...new Set(doc.pet_ids.filter((id) => typeof id === 'string' && id.trim()))]
    : [];
  const storeFields = formatUserStoreFields(doc);
  const oaOpenid = (doc.openids && doc.openids.oa) || '';
  return {
    _id: String(doc._id),
    openid: doc.openid,
    nickName: doc.nickName || '',
    wechatId: doc.wechatId || '',
    avatarUrl: doc.avatarUrl || '',
    phone: doc.phone || '',
    realName: doc.realName || '',
    idCard: doc.idCard || '',
    address: doc.address || '',
    ...storeFields,
    pet_ids: petIds,
    merchantStatus: merchantStatus || (isMerchant ? 'approved' : ''),
    merchantRole: (doc.merchantRole || '').toLowerCase() === 'staff' ? 'staff' : (
      isMerchant ? 'owner' : ''
    ),
    isMerchant,
    hasMerchantCapability: isMerchant,
    role: isMerchant ? 'merchant' : 'user',
    oaBound: !!oaOpenid,
    oaQrcodeUrl: (config.wxOa && config.wxOa.qrcodeUrl) || '',
    createTime: doc.createTime,
    updateTime: doc.updateTime
  };
}

function pickCanonicalUser(records) {
  return identity.pickPrimaryUser(records);
}

function mergePetIds(records) {
  const ids = [];
  records.forEach((item) => {
    const list = Array.isArray(item.pet_ids) ? item.pet_ids : [];
    list.forEach((petId) => {
      if (typeof petId === 'string' && petId.trim() && !ids.includes(petId)) {
        ids.push(petId);
      }
    });
  });
  return ids;
}

function mergeUserFields(records) {
  const canonical = pickCanonicalUser(records);
  const merged = { ...canonical };
  merged.isMerchant = records.some((item) => isMerchantApprovedFromDoc(item));
  const staffRecord = records.find((item) => (item.merchantRole || '').toLowerCase() === 'staff');
  if (staffRecord) {
    merged.merchantRole = 'staff';
    merged.merchantStoreId = staffRecord.merchantStoreId || staffRecord.store_id || merged.merchantStoreId || '';
  }
  merged.merchantStatus = records.reduce((best, item) => {
    const status = normalizeMerchantStatus(item.merchantStatus);
    if (status === 'approved') return 'approved';
    if (status === 'pending' && best !== 'approved') return 'pending';
    if (status === 'rejected' && best !== 'approved' && best !== 'pending') return 'rejected';
    return best;
  }, '');

  const textFields = ['nickName', 'avatarUrl', 'phone', 'realName', 'idCard', 'address'];
  textFields.forEach((field) => {
    if (!merged[field]) {
      const found = records.find((item) => item[field]);
      if (found) merged[field] = found[field];
    }
  });

  const merchantStoreId = records
    .map((item) => userFields.resolveMerchantStoreId(item))
    .find(Boolean) || userFields.resolveMerchantStoreId(merged) || '';
  const visitStoreId = records
    .map((item) => userFields.resolveVisitStoreId(item))
    .find(Boolean) || userFields.resolveVisitStoreId(merged) || '';

  merged.merchantStoreId = merchantStoreId;
  merged.visitStoreId = visitStoreId;
  merged.store_id = visitStoreId;

  merged.createTime = Math.min(...records.map((item) => item.createTime || Date.now()));
  merged.updateTime = Math.max(...records.map((item) => item.updateTime || item.createTime || 0));
  merged.pet_ids = mergePetIds(records);
  return merged;
}

async function fetchUsersByOpenid(openid) {
  const byAny = await identity.findUsersByOpenidAny(openid);
  if (byAny.length) return byAny;
  return db.findMany('users', { openid });
}

async function dedupeUsersByOpenid(openid) {
  const records = await fetchUsersByOpenid(openid);
  if (records.length <= 1) {
    return records[0] || null;
  }

  const merged = mergeUserFields(records);
  const duplicateIds = records
    .map((item) => item._id)
    .filter((id) => String(id) !== String(merged._id));

  await db.updateById('users', merged._id, {
    nickName: merged.nickName || '',
    avatarUrl: merged.avatarUrl || '',
    phone: merged.phone || '',
    realName: merged.realName || '',
    idCard: merged.idCard || '',
    address: merged.address || '',
    merchantStoreId: merged.merchantStoreId || '',
    visitStoreId: merged.visitStoreId || '',
    store_id: merged.visitStoreId || '',
    pet_ids: mergePetIds(records),
    isMerchant: !!merged.isMerchant,
    merchantStatus: merged.merchantStatus || '',
    merchantRole: merged.merchantRole || '',
    createTime: merged.createTime,
    updateTime: merged.updateTime
  });

  if (duplicateIds.length > 0) {
    await db.deleteMany('users', { _id: { $in: duplicateIds } });
  }

  return db.findOne('users', { _id: merged._id });
}

async function getOrCreateUser(openid) {
  let user = await dedupeUsersByOpenid(openid);
  if (user) return user;

  const now = Date.now();
  const newUser = {
    openid,
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

  await db.insertOne('users', newUser);
  user = await dedupeUsersByOpenid(openid);
  return user || newUser;
}

async function initDatabase() {
  const results = await db.ensureCollections(COLLECTIONS);
  return { success: true, collections: results };
}

async function getUserInfo(openid, req) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const records = await fetchUsersByOpenid(openid);
  const beforeCount = records.length;
  let doc;
  if (beforeCount > 1) {
    doc = await dedupeUsersByOpenid(openid);
  } else if (beforeCount === 1) {
    doc = records[0];
  } else {
    doc = await getOrCreateUser(openid);
  }

  // 关注服务号后可能先写入待绑表：拉用户时补挂 openids.oa，便于前端隐藏关注 banner
  if (doc) {
    try {
      const oaBindService = require('./oaBindService');
      const unionid = (req && req.auth && req.auth.unionid) || doc.unionid || '';
      if (unionid) {
        doc = await oaBindService.attachPendingOaByUnionid(doc, unionid) || doc;
      }
    } catch (err) {
      console.warn('[userService] attachPendingOaByUnionid failed', err.message || err);
    }
  }

  if (req && req.client === 'user' && doc) {
    try {
      const visitStoreIntentService = require('./visitStoreIntentService');
      const consumed = await visitStoreIntentService.consumeIntentForUser(doc);
      if (consumed.consumed) doc = consumed.user;
    } catch (err) {
      console.warn('[userService] consumeIntentForUser failed', err.message || err);
    }
  }

  return {
    success: true,
    requestOpenid: openid,
    matchedCount: 1,
    deduped: beforeCount > 1,
    dbIsMerchant: doc.isMerchant,
    user: formatUser(doc)
  };
}

async function syncProfile(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const profile = event.profile || {};
  const doc = await getOrCreateUser(openid);
  const now = Date.now();
  const storeFields = formatUserStoreFields(doc);
  const profileData = {
    nickName: profile.nickName || doc.nickName || '',
    wechatId: profile.wechatId !== undefined
      ? String(profile.wechatId || '').trim()
      : (doc.wechatId || ''),
    avatarUrl: profile.avatarUrl || doc.avatarUrl || '',
    phone: profile.phone || doc.phone || '',
    realName: profile.realName || doc.realName || '',
    idCard: profile.idCard || doc.idCard || '',
    address: profile.address || doc.address || '',
    merchantStoreId: storeFields.merchantStoreId,
    visitStoreId: storeFields.visitStoreId,
    store_id: storeFields.visitStoreId,
    updateTime: now
  };

  const updated = await db.updateById('users', doc._id, profileData);
  await dedupeUsersByOpenid(openid);
  return { success: true, user: formatUser(updated) };
}

async function dedupeMyUser(openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const beforeCount = (await fetchUsersByOpenid(openid)).length;
  const doc = await dedupeUsersByOpenid(openid);
  const afterCount = (await fetchUsersByOpenid(openid)).length;

  return {
    success: true,
    beforeCount,
    afterCount,
    removed: Math.max(beforeCount - afterCount, 0),
    user: doc ? formatUser(doc) : null
  };
}

async function registerVisitStoreIntent(event, openid, req) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }
  if (req && req.client !== 'merchant') {
    return { success: false, errMsg: '仅商家端可登记邀请' };
  }

  const storeId = (event.store_id || '').trim();
  if (!storeId) {
    return { success: false, errMsg: '缺少 store_id' };
  }

  let unionid = (req && req.auth && req.auth.unionid) || '';
  if (!unionid) {
    const records = await fetchUsersByOpenid(openid);
    const doc = pickCanonicalUser(records) || records[0];
    unionid = (doc && doc.unionid) || '';
  }

  const visitStoreIntentService = require('./visitStoreIntentService');
  return visitStoreIntentService.registerIntent({
    unionid,
    storeId,
    sourceOpenid: openid
  });
}

async function bindUserStore(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const storeId = (event.store_id || '').trim();
  if (!storeId) {
    return { success: false, errMsg: '缺少 store_id' };
  }

  const storeDocs = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  if (!storeDocs.length) {
    return { success: false, errMsg: '店铺不存在' };
  }

  const doc = await getOrCreateUser(openid);
  const now = Date.now();
  // 换绑只改 visit；若已有商家身份，显式保留 merchantStoreId，避免被 visit 覆盖
  const merchantStoreId = userFields.resolveMerchantStoreId(doc);
  const updateData = {
    visitStoreId: storeId,
    store_id: storeId,
    updateTime: now
  };
  if (merchantStoreId) {
    updateData.merchantStoreId = merchantStoreId;
  }

  const updated = await db.updateById('users', doc._id, updateData);
  return { success: true, user: formatUser(updated), store: storeDocs[0] };
}

async function setMerchantProfile(event, openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const storeId = (event.store_id || '').trim();
  const doc = await getOrCreateUser(openid);
  const now = Date.now();
  const storeFields = formatUserStoreFields(doc);
  // 开店/保存店铺后：用户端也绑到自己的店
  const visitStoreId = storeId || storeFields.visitStoreId;
  const updateData = {
    merchantStoreId: storeId || storeFields.merchantStoreId,
    visitStoreId,
    store_id: visitStoreId,
    updateTime: now
  };
  if (storeId && isMerchantApprovedFromDoc(doc)) {
    updateData.isMerchant = true;
    updateData.merchantStatus = 'approved';
  }

  const updated = await db.updateById('users', doc._id, updateData);
  return { success: true, user: formatUser(updated) };
}

async function bindPhone(event, openid, req) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }

  const code = (event.code || '').trim();
  if (!code) {
    return { success: false, errMsg: '缺少手机号授权 code' };
  }

  const client = wechat.normalizeClient((req && req.client) || (event && event.client) || 'user');
  let phone = '';
  try {
    phone = await wechat.getPhoneNumber(code, client);
  } catch (err) {
    console.error('getPhoneNumber failed', err);
    return {
      success: false,
      errMsg: (err && err.message) || '获取手机号失败'
    };
  }

  if (!phone) {
    return { success: false, errMsg: '未能解析手机号' };
  }

  const doc = await getOrCreateUser(openid);
  const updated = await identity.mergeByPhone(doc, phone);
  await dedupeUsersByOpenid((updated && updated.openid) || openid);

  return { success: true, phone, user: formatUser(updated) };
}

async function ping(openid) {
  return {
    success: true,
    openid: openid || '',
    env: 'aliyun',
    time: Date.now()
  };
}

async function createOaBindQr(openid) {
  if (!openid) {
    return { success: false, errMsg: '无法获取用户身份' };
  }
  const oaBindTicketService = require('./oaBindTicketService');
  try {
    return await oaBindTicketService.createBindQr(openid);
  } catch (err) {
    console.error('[userService] createOaBindQr failed', err.message || err);
    return { success: false, errMsg: (err && err.message) || '生成关注二维码失败' };
  }
}

async function handle(event, openid, req) {
  switch (event.action) {
    case 'ping':
      return ping(openid);
    case 'initDatabase':
      return initDatabase();
    case 'getUserInfo':
      return getUserInfo(openid, req);
    case 'syncProfile':
      return syncProfile(event, openid);
    case 'bindPhone':
      return bindPhone(event, openid, req);
    case 'dedupeMyUser':
      return dedupeMyUser(openid);
    case 'bindUserStore':
      return bindUserStore(event, openid);
    case 'registerVisitStoreIntent':
      return registerVisitStoreIntent(event, openid, req);
    case 'setMerchantProfile':
      return setMerchantProfile(event, openid);
    case 'createOaBindQr':
      return createOaBindQr(openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = {
  handle,
  getOrCreateUser,
  formatUser,
  normalizeIsMerchant,
  isMerchantApprovedFromDoc
};
