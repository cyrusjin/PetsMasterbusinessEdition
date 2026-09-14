const crypto = require('crypto');
const db = require('../db');
const identity = require('./identity');
const agreement = require('./collectionAgreement');
let pay;
try {
  pay = require('./partnerPayService');
} catch (err) {
  // 允许先部署申请入口；服务商支付模块和凭证接通前保持不可开启在线收款。
  if (err && err.code === 'MODULE_NOT_FOUND' && /partnerPayService/.test(err.message || '')) {
    pay = { ready: () => false, queryApplication: async () => { throw new Error('微信支付服务商参数尚未配置'); } };
  } else {
    throw err;
  }
}
const agreementHash = crypto.createHash('sha256').update(JSON.stringify(agreement)).digest('hex');
const states = { requested: '请补充自动开户资料', submitting: '正在自动提交微信', auditing: '微信审核中', signing: '待经营者核验及签约', ready: '收款账户已就绪', rejected: '需要补充资料' };
const onboarding = () => require('./collectionOnboardingService');
async function storeForOwner(id, openid) {
  if (typeof id !== 'string' || !id || typeof openid !== 'string' || !openid) throw new Error('仅店主可以管理收款设置');
  const store = await db.findOne('stores', { store_id: id });
  const user = await identity.findPrimaryUserByOpenid(openid);
  const ids = user ? identity.collectOpenids(user) : [openid];
  if (!store || !ids.includes(store.ownerOpenid)) throw new Error('仅店主可以管理收款设置');
  return store;
}
function view(store) {
  const p = store.collection || {};
  return { mode: p.mode || 'offline', state: p.state || 'none', stateText: states[p.state] || '尚未申请',
    configured: onboarding().configured(), canEnable: pay.ready() && p.state === 'ready' && !!p.subMchId,
    applicationLocked: p.state === 'submitting' || (!!p.applymentId && p.state !== 'rejected'),
    applymentId: p.applymentId || '',
    subMchId: p.subMchId || '', signUrl: p.signUrl || '', reviewMessage: p.reviewMessage || '',
    agreementVersion: p.agreementVersion || '', requestedAt: p.requestedAt || 0,
    application: p.application || null };
}
async function syncApplication(store) {
  return onboarding().sync(store);
}
async function handle(event, openid) {
  let store = await storeForOwner(event.store_id, openid);
  if (event.action === 'getCollectionSettings') {
    if (event.refresh) store = await syncApplication(store);
    return { success: true, collection: view(store), agreement, agreementHash };
  }
  if (event.action === 'applyCollection') {
    if (event.agreementVersion !== agreement.version || event.agreementHash !== agreementHash || event.accepted !== true) throw new Error('请阅读并同意当前版本收款协议');
    if (event.sensitiveAccepted !== true) throw new Error('请单独同意开户敏感个人信息处理授权');
    const now = Date.now();
    const fields = { 'collection.agreementVersion': agreement.version, 'collection.agreementHash': agreementHash,
      'collection.acceptedAt': now, 'collection.acceptedBy': openid,
      'collection.sensitiveAcceptedAt': now };
    await db.insertOne('collection_agreements', { store_id: store.store_id, openid, acceptedAt: now, agreement, agreementHash, sensitiveAccepted: true });
    store = await onboarding().queue(store, event.application || {}, fields);
  } else if (event.action === 'setCollectionMode') {
    if (!['online', 'offline'].includes(event.mode)) throw new Error('无效收款方式');
    if (event.mode === 'online') {
      store = await syncApplication(store);
      if (!view(store).canEnable) throw new Error('请先完成微信支付审核、签约及平台配置');
      if (store.collection.agreementHash !== agreementHash) {
        if (event.accepted !== true || event.agreementVersion !== agreement.version || event.agreementHash !== agreementHash) throw new Error('请先阅读并同意最新协议');
        await db.insertOne('collection_agreements', { store_id: store.store_id, openid, acceptedAt: Date.now(), agreement, agreementHash });
        store = await db.updateById('stores', store._id, { 'collection.agreementVersion': agreement.version, 'collection.agreementHash': agreementHash });
      }
    }
    store = await db.updateById('stores', store._id, { 'collection.mode': event.mode, 'collection.modeChangedAt': Date.now() });
  } else throw new Error('未知收款操作');
  return { success: true, collection: view(store), agreement, agreementHash };
}
async function adminHandle(event, username) {
  let store = await db.findOne('stores', { store_id: event.store_id });
  if (!store) throw new Error('店铺不存在');
  if (event.applymentId) {
    throw new Error('申请单号由系统自动获取，无需人工关联');
  }
  if (event.refresh || event.applymentId) store = await syncApplication(store);
  return { success: true, collection: { ...view(store), contactName: store.collection?.contactName || '', contactPhone: store.collection?.contactPhone || '', applymentId: store.collection?.applymentId || '' } };
}
async function adminList() {
  const stores = await db.findMany('stores', { 'collection.requestedAt': { $exists: true } }, { limit: 200, sort: { 'collection.requestedAt': -1 } });
  return { success: true, stores: stores.map(s => ({ store_id: s.store_id, name: s.name, ...view(s), contactName: s.collection.contactName, contactPhone: s.collection.contactPhone, applymentId: s.collection.applymentId || '' })) };
}
module.exports = { handle, adminHandle, adminList, view, storeForOwner };
