const db = require('../db');
const identity = require('./identity');
const userFields = require('./userFields');

const LEDGER_COLLECTION = 'ledger_entries';
const VALID_TYPES = new Set(['expense', 'income']);

function buildEntryId() {
  return `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  return text;
}

async function getStoreById(storeId) {
  if (!storeId) return null;
  return db.findOne('stores', { store_id: storeId });
}

async function isMerchantUser(openid, storeId) {
  if (!openid || !storeId) return false;
  const user = await identity.findPrimaryUserByOpenid(openid);
  if (!user) return false;
  if (userFields.resolveMerchantStoreId(user) === storeId
    && userFields.isMerchantApprovedFromDoc(user)) {
    return true;
  }
  const openids = identity.collectOpenids(user);
  const owned = await db.findMany('stores', {
    store_id: storeId,
    ownerOpenid: { $in: openids }
  }, { limit: 1 });
  if (owned.length) return true;
  const staff = await db.findMany('stores', {
    store_id: storeId,
    staffOpenids: { $in: openids }
  }, { limit: 1 });
  return staff.length > 0;
}

async function canManageStore(storeId, openid) {
  if (!openid || !storeId) return false;

  const store = await getStoreById(storeId);
  if (store) {
    const ownerOpenid = store.ownerOpenid || '';
    if (ownerOpenid === openid) return true;
    if (!ownerOpenid && await isMerchantUser(openid, storeId)) {
      return true;
    }
  }

  if (await isMerchantUser(openid, storeId)) {
    return true;
  }

  const openids = identity.collectOpenids(await identity.findPrimaryUserByOpenid(openid) || openid);
  const ownedStores = await db.findMany('stores', {
    ownerOpenid: { $in: openids },
    store_id: storeId
  }, { limit: 1 });
  return ownedStores.length > 0;
}

function formatEntry(doc) {
  if (!doc) return null;
  const entryId = doc.entry_id || doc.id || '';
  if (!entryId) return null;
  const type = doc.type === 'income' ? 'income' : 'expense';
  return {
    id: entryId,
    entry_id: entryId,
    store_id: doc.store_id || '',
    type,
    category: doc.category || '',
    categoryLabel: doc.categoryLabel || doc.category || '',
    amount: roundMoney(doc.amount),
    note: doc.note || '',
    date: doc.date || '',
    createTime: Number(doc.createTime) || 0,
    updateTime: Number(doc.updateTime) || Number(doc.createTime) || 0,
    createdByOpenid: doc.createdByOpenid || ''
  };
}

function validateEntryPayload(payload, { requireStoreId } = {}) {
  const source = payload || {};
  const type = source.type === 'income' ? 'income' : (source.type === 'expense' ? 'expense' : '');
  if (!VALID_TYPES.has(type)) return { error: '记账类型无效' };

  const category = String(source.category || '').trim();
  if (!category) return { error: '请选择分类' };

  const amount = roundMoney(source.amount);
  if (!(amount > 0)) return { error: '请输入有效金额' };

  const date = normalizeDate(source.date) || todayYmd();
  const storeId = String(source.store_id || source.storeId || '').trim();
  if (requireStoreId && !storeId) return { error: '缺少店铺信息' };

  return {
    type,
    category,
    categoryLabel: String(source.categoryLabel || '').trim() || category,
    amount,
    note: String(source.note || '').trim().slice(0, 200),
    date,
    store_id: storeId
  };
}

async function initLedgerDatabase() {
  await db.ensureCollections([LEDGER_COLLECTION]);
  try {
    await db.collection(LEDGER_COLLECTION).createIndex(
      { entry_id: 1 },
      { name: 'entry_id_unique', unique: true, background: true }
    );
  } catch (err) {
    console.warn('[ledger] createIndex entry_id_unique failed', (err && err.message) || err);
  }
  try {
    await db.collection(LEDGER_COLLECTION).createIndex(
      { store_id: 1, date: -1, createTime: -1 },
      { name: 'store_date_createTime', background: true }
    );
  } catch (err) {
    console.warn('[ledger] createIndex store_date_createTime failed', (err && err.message) || err);
  }
  return { success: true, collection: LEDGER_COLLECTION };
}

async function listLedgerEntries(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const storeId = String(event.store_id || event.storeId || '').trim();
  if (!storeId) return { success: false, errMsg: '缺少店铺信息' };

  const canView = await canManageStore(storeId, openid);
  if (!canView) {
    return { success: false, errMsg: '无权查看记账记录' };
  }

  const rows = await db.findMany(LEDGER_COLLECTION, { store_id: storeId }, {
    sort: { date: -1, createTime: -1 },
    limit: 1000
  });

  return {
    success: true,
    entries: (rows || []).map(formatEntry).filter(Boolean)
  };
}

async function saveLedgerEntry(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const payload = event.entry || {};
  const validated = validateEntryPayload(payload, { requireStoreId: true });
  if (validated.error) return { success: false, errMsg: validated.error };

  const canManage = await canManageStore(validated.store_id, openid);
  if (!canManage) {
    return { success: false, errMsg: '无权操作该店铺记账' };
  }

  const now = Date.now();
  const entryId = String(payload.id || payload.entry_id || '').trim() || buildEntryId();
  const existing = await db.findOne(LEDGER_COLLECTION, { entry_id: entryId });
  if (existing) {
    if (existing.store_id && existing.store_id !== validated.store_id) {
      return { success: false, errMsg: '记账记录不属于该店铺' };
    }
    await db.updateById(LEDGER_COLLECTION, existing._id, {
      ...validated,
      updateTime: now
    });
    const updated = await db.findOne(LEDGER_COLLECTION, { _id: existing._id });
    return { success: true, entry: formatEntry(updated) };
  }

  const doc = {
    entry_id: entryId,
    ...validated,
    createdByOpenid: openid,
    createTime: Number(payload.createTime) || now,
    updateTime: now
  };
  await db.insertOne(LEDGER_COLLECTION, doc);
  return { success: true, entry: formatEntry(doc) };
}

async function updateLedgerEntry(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const entryId = String(event.entry_id || event.entryId || event.id || '').trim();
  if (!entryId) return { success: false, errMsg: '缺少记账记录' };

  const existing = await db.findOne(LEDGER_COLLECTION, { entry_id: entryId });
  if (!existing) return { success: false, errMsg: '记账记录不存在' };

  const canManage = await canManageStore(existing.store_id, openid);
  if (!canManage) {
    return { success: false, errMsg: '无权操作该店铺记账' };
  }

  const updates = event.updates || {};
  const merged = {
    type: updates.type != null ? updates.type : existing.type,
    category: updates.category != null ? updates.category : existing.category,
    categoryLabel: updates.categoryLabel != null ? updates.categoryLabel : existing.categoryLabel,
    amount: updates.amount != null ? updates.amount : existing.amount,
    note: updates.note != null ? updates.note : existing.note,
    date: updates.date != null ? updates.date : existing.date,
    store_id: existing.store_id
  };
  const validated = validateEntryPayload(merged, { requireStoreId: true });
  if (validated.error) return { success: false, errMsg: validated.error };

  const now = Date.now();
  await db.updateById(LEDGER_COLLECTION, existing._id, {
    type: validated.type,
    category: validated.category,
    categoryLabel: validated.categoryLabel,
    amount: validated.amount,
    note: validated.note,
    date: validated.date,
    updateTime: now
  });

  const updated = await db.findOne(LEDGER_COLLECTION, { _id: existing._id });
  return { success: true, entry: formatEntry(updated) };
}

async function deleteLedgerEntry(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const entryId = String(event.entry_id || event.entryId || event.id || '').trim();
  if (!entryId) return { success: false, errMsg: '缺少记账记录' };

  const existing = await db.findOne(LEDGER_COLLECTION, { entry_id: entryId });
  if (!existing) return { success: false, errMsg: '记账记录不存在' };

  const storeId = String(event.store_id || event.storeId || existing.store_id || '').trim();
  if (storeId && existing.store_id && storeId !== existing.store_id) {
    return { success: false, errMsg: '记账记录不属于该店铺' };
  }

  const canManage = await canManageStore(existing.store_id, openid);
  if (!canManage) {
    return { success: false, errMsg: '无权操作该店铺记账' };
  }

  await db.deleteById(LEDGER_COLLECTION, existing._id);
  return { success: true };
}

async function handle(event, openid) {
  switch (event.action) {
    case 'initDatabase':
      return initLedgerDatabase();
    case 'listLedgerEntries':
      return listLedgerEntries(event, openid);
    case 'saveLedgerEntry':
      return saveLedgerEntry(event, openid);
    case 'updateLedgerEntry':
      return updateLedgerEntry(event, openid);
    case 'deleteLedgerEntry':
      return deleteLedgerEntry(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = {
  handle,
  initLedgerDatabase
};
