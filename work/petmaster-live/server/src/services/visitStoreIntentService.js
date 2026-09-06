const db = require('../db');

const COLLECTION = 'visit_store_intents';
const INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function ensureCollection() {
  await db.ensureCollections([COLLECTION]);
}

async function registerIntent({ unionid, storeId, sourceOpenid }) {
  const uid = (unionid || '').trim();
  const sid = (storeId || '').trim();
  if (!sid) {
    return { success: false, errMsg: '缺少 store_id' };
  }
  if (!uid) {
    return {
      success: false,
      errMsg: '无法识别用户身份，请确认小程序已绑定微信开放平台'
    };
  }

  const storeDocs = await db.findMany('stores', { store_id: sid }, { limit: 1 });
  if (!storeDocs.length) {
    return { success: false, errMsg: '店铺不存在' };
  }

  await ensureCollection();
  const now = Date.now();
  const existing = await db.findMany(COLLECTION, { unionid: uid }, { limit: 1 });
  const patch = {
    unionid: uid,
    store_id: sid,
    sourceOpenid: sourceOpenid || '',
    updateTime: now,
    expireTime: now + INTENT_TTL_MS
  };

  if (existing.length) {
    await db.updateById(COLLECTION, existing[0]._id, patch);
  } else {
    await db.insertOne(COLLECTION, { ...patch, createTime: now });
  }

  return { success: true, store_id: sid };
}

async function findIntentByUnionid(unionid) {
  const uid = (unionid || '').trim();
  if (!uid) return null;
  await ensureCollection();
  const rows = await db.findMany(COLLECTION, { unionid: uid }, { limit: 1 });
  const row = rows[0];
  if (!row) return null;
  if (row.expireTime && row.expireTime < Date.now()) {
    await db.deleteMany(COLLECTION, { unionid: uid });
    return null;
  }
  return row;
}

async function removeIntent(unionid) {
  const uid = (unionid || '').trim();
  if (!uid) return;
  await ensureCollection();
  await db.deleteMany(COLLECTION, { unionid: uid });
}

/**
 * 宠主端登录/拉用户信息时：消费落地页登记的待绑定店铺
 */
async function consumeIntentForUser(user) {
  if (!user) return { user, consumed: false };
  const unionid = (user.unionid || '').trim();
  if (!unionid) return { user, consumed: false };

  const intent = await findIntentByUnionid(unionid);
  if (!intent || !intent.store_id) return { user, consumed: false };

  const storeId = String(intent.store_id).trim();
  const storeDocs = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  if (!storeDocs.length) {
    await removeIntent(unionid);
    return { user, consumed: false };
  }

  const updated = await db.updateById('users', user._id, {
    visitStoreId: storeId,
    store_id: storeId,
    updateTime: Date.now()
  });
  await removeIntent(unionid);
  return { user: updated, consumed: true, store_id: storeId };
}

module.exports = {
  registerIntent,
  consumeIntentForUser,
  findIntentByUnionid,
  removeIntent
};
