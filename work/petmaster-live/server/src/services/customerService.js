const crypto = require('crypto');
const db = require('../db');
const userService = require('./userService');

const COLLECTIONS = ['customer_profiles', 'customer_wallets', 'customer_wallet_ledger', 'customer_coupons'];
let ready;
function ensure() {
  if (!ready) ready = db.ensureCollections(COLLECTIONS).then(async () => {
    try {
      await db.collection('customer_profiles').createIndex({ store_id: 1, phone: 1 }, { unique: true });
      await db.collection('customer_profiles').createIndex({ store_id: 1, updateTime: -1 });
      await db.collection('customer_wallets').createIndex({ store_id: 1, customer_id: 1 }, { unique: true });
      await db.collection('customer_wallet_ledger').createIndex({ store_id: 1, customer_id: 1, createTime: -1 });
      await db.collection('customer_coupons').createIndex({ store_id: 1, code: 1 }, { unique: true });
    } catch (e) { console.warn('[customer] index setup skipped:', e.message || e); }
  });
  return ready;
}
function phoneOf(value) { return String(value || '').replace(/[\s-]/g, '').trim(); }
function validPhone(phone) { return /^\+?[0-9]{6,20}$/.test(phone); }
function storeOf(event, user) { return String(event.store_id || event.storeId || user.merchantStoreId || user.store_id || '').trim(); }
async function merchant(openid) {
  const u = await userService.getOrCreateUser(openid);
  return u;
}
async function profile(storeId, phone, patch = {}) {
  const now = Date.now();
  return db.collection('customer_profiles').findOneAndUpdate({ store_id: storeId, phone }, { $set: { ...patch, updateTime: now }, $setOnInsert: { store_id: storeId, phone, platformIds: {}, tags: [], createTime: now } }, { upsert: true, returnDocument: 'after' });
}
async function list(event, openid) {
  await ensure(); const u = await merchant(openid); const storeId = storeOf(event, u);
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };
  const q = String(event.keyword || '').trim().slice(0,80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const filter = { store_id: storeId };
  if (q) filter.$or = [{ phone: { $regex: q, $options: 'i' } }, { name: { $regex: q, $options: 'i' } }];
  const rows = await db.findMany('customer_profiles', filter, { sort: { updateTime: -1 }, limit: Math.max(1, Math.min(Math.floor(Number(event.limit)) || 100, 500)), skip: Math.max(0, Math.floor(Number(event.offset)) || 0) });
  const ids = rows.map((row) => String(row._id));
  const wallets = ids.length ? await db.findMany('customer_wallets', { store_id: storeId, customer_id: { $in: ids } }) : [];
  const walletMap = new Map(wallets.map((wallet) => [String(wallet.customer_id), wallet]));
  const openids = rows.map((row) => row.platformIds && row.platformIds.wechatOpenid).filter(Boolean);
  const users = openids.length ? await db.findMany('users', { openid: { $in: openids } }) : [];
  const userMap = new Map(users.map((user) => [String(user.openid), user]));
  const customers = rows.map((row) => {
    const wallet = walletMap.get(String(row._id));
    const identity = userMap.get(String(row.platformIds && row.platformIds.wechatOpenid));
    const merchantRole = identity && String(identity.merchantRole || '').toLowerCase() === 'staff'
      ? 'staff'
      : (identity && (identity.isMerchant === true || identity.merchantStatus === 'approved') ? 'owner' : '');
    return { ...row, customerRole: merchantRole, wallet: { balance: Number(wallet && wallet.balance) || 0, updateTime: Number(wallet && wallet.updateTime) || 0 } };
  });
  return { success: true, store_id: storeId, customers, hasMore: rows.length === Math.max(1, Math.min(Math.floor(Number(event.limit)) || 100, 500)) };
}
async function changeBalance({ storeId, phone, amount, operator, key, remark = '', orderId = '', credit = false }) {
  await ensure();
  const value = Math.round(Number(amount) * 100) / 100;
  if (!validPhone(phone) || !Number.isFinite(value) || value <= 0 || value > 100000 || !key) {
    return { success: false, errMsg: '请输入有效金额和操作凭证' };
  }
  const p = await profile(storeId, phone);
  const filter = { store_id: storeId, customer_id: String(p._id) };
  const col = db.collection('customer_wallets');
  await col.updateOne(filter, { $setOnInsert: { ...filter, phone, balance: 0, createTime: Date.now() } }, { upsert: true });
  for (let attempt = 0; attempt < 8; attempt++) {
    const wallet = await col.findOne(filter);
    const entries = wallet.entries || [];
    const prior = entries.find(e => e.idempotencyKey === key);
    const delta = credit ? value : -value;
    if (prior) {
      if (prior.amount !== delta || prior.orderId !== orderId || prior.remark !== remark) return { success: false, errMsg: '该操作凭证已用于其他费用' };
      return { success: true, balance: wallet.balance, amount: value, repeated: true };
    }
    // Never silently discard deduplication history when the document reaches its bounded capacity.
    if (entries.length >= 5000) return { success: false, errMsg: '账户流水需归档，请联系管理员' };
    const before = Number(wallet.balance) || 0;
    if (!credit && before < value) return { success: false, errMsg: '客户余额不足', balance: before };
    const after = Math.round((before + delta) * 100) / 100;
    const entry = { idempotencyKey: key, type: credit ? 'recharge' : 'consume', amount: delta,
      balanceBefore: before, balanceAfter: after, orderId, remark, operator, createTime: Date.now() };
    const revision = wallet.revision == null ? { $exists: false } : wallet.revision;
    const result = await col.updateOne({ ...filter, revision }, {
      $set: { balance: after, updateTime: entry.createTime }, $inc: { revision: 1 }, $push: { entries: entry }
    });
    if (result.modifiedCount) return { success: true, balance: after, amount: value };
  }
  return { success: false, errMsg: '账户繁忙，请使用原操作重试' };
}
async function recharge(event, openid) {
  return changeBalance({ storeId: event.store_id, phone: phoneOf(event.phone), amount: event.amount,
    operator: openid, key: String(event.idempotencyKey || crypto.randomUUID()), remark: String(event.remark || '').slice(0, 200), credit: true });
}
async function debitWallet({ storeId, phone, amount, orderId, operator, key, remark = '' }) {
  return changeBalance({ storeId, phone, amount, orderId: String(orderId || ''), operator,
    key: key || `order:${orderId}`, remark });
}
async function issueCoupon(event, openid) {
  await ensure(); const u = await merchant(openid); const storeId = storeOf(event, u); const phone = phoneOf(event.phone); const value = Math.round(Number(event.amount) * 100) / 100;
  if (!storeId || !validPhone(phone) || !(value > 0)) return { success: false, errMsg: '代金券参数无效' };
  const p = await profile(storeId, phone, { name: String(event.name || '').trim().slice(0, 80) }); const code = String(event.code || crypto.randomBytes(5).toString('hex')).toUpperCase(); const now = Date.now();
  await db.insertOne('customer_coupons', { store_id: storeId, customer_id: String(p._id), phone, code, amount: value, remaining: value, status: 'active', expireAt: Number(event.expireAt) || now + 365 * 86400000, createTime: now, issuedBy: String(openid) });
  return { success: true, code, amount: value, phone };
}
async function redeemCoupon(event, openid) {
  await ensure(); const u = await merchant(openid); const storeId = storeOf(event, u); const code = String(event.code || '').trim().toUpperCase();
  if (!storeId || !code) return { success: false, errMsg: '代金券码不能为空' };
  const row = await db.findOne('customer_coupons', { store_id: storeId, code });
  if (!row || row.status !== 'active' || Number(row.expireAt) < Date.now()) return { success: false, errMsg: '代金券不存在或已失效' };
  const use = Math.min(Number(row.remaining) || 0, Math.max(0, Number(event.amount) || Number(row.remaining) || 0));
  if (!(use > 0)) return { success: false, errMsg: '核销金额无效' };
  const remaining = Math.round((Number(row.remaining) - use) * 100) / 100;
  await db.updateOne('customer_coupons', { _id: row._id, status: 'active' }, { remaining, status: remaining <= 0 ? 'used' : 'active', usedTime: Date.now(), usedBy: String(openid), orderId: String(event.orderId || '') });
  return { success: true, code, usedAmount: use, remaining };
}
async function handle(event, openid) {
  if (!openid) return { success: false, errMsg: '请先登录' };
  const u = await merchant(openid);
  const storeId = storeOf(event, u);
  if (!storeId || !await require('./orderService').canManageOrder({ store_id: storeId }, openid)) return { success: false, errMsg: '无权操作该门店客户' };
  event = { ...event, store_id: storeId };
  if (event.action === 'listCustomers') return list(event, openid);
  if (event.action === 'rechargeCustomer') return recharge(event, openid);
  if (event.action === 'issueCustomerCoupon') return issueCoupon(event, openid);
  if (event.action === 'redeemCustomerCoupon') return redeemCoupon(event, openid);
  if (event.action === 'saveCustomer') {
    const phone = phoneOf(event.phone);
    if (!validPhone(phone)) return { success: false, errMsg: '请输入有效手机号' };
    await ensure();
    const customer = await profile(storeId, phone, { name: String(event.name || '').trim().slice(0, 80) });
    return { success: true, customer };
  }
  if (event.action === 'customerLedger') {
    await ensure();
    const p = await db.findOne('customer_profiles', { store_id: storeId, phone: phoneOf(event.phone) });
    if (!p) return { success: true, balance: 0, entries: [] };
    const filter = { store_id: storeId, customer_id: String(p._id) };
    const wallet = await db.findOne('customer_wallets', filter);
    const old = await db.findMany('customer_wallet_ledger', filter, { sort: { createTime: -1 }, limit: 100 });
    return { success: true, balance: Number(wallet && wallet.balance) || 0,
      entries: [...((wallet && wallet.entries) || []), ...old].sort((a,b) => b.createTime-a.createTime).slice(0,100) };
  }
  if (event.action === 'consumeCustomerBalance') {
    if (!event.idempotencyKey || !String(event.remark || '').trim()) return { success: false, errMsg: '请填写核销用途' };
    return debitWallet({ storeId, phone: phoneOf(event.phone), amount: event.amount, operator: openid,
      key: String(event.idempotencyKey), remark: String(event.remark).trim().slice(0,200) });
  }
  return { success: false, errMsg: '未知客户操作' };
}
module.exports = { handle, ensure, phoneOf, validPhone, debitWallet };
