const { callApiService } = require('./api');

function callUserAuth(action, data = {}) {
  return callApiService('userAuth', { action, ...data });
}

function initDatabase() {
  return callUserAuth('initDatabase');
}

function getUserInfo() {
  return callUserAuth('getUserInfo');
}

function syncProfile(profile) {
  return callUserAuth('syncProfile', { profile });
}

function bindPhone(code) {
  return callUserAuth('bindPhone', { code });
}

function dedupeMyUser() {
  return callUserAuth('dedupeMyUser');
}

function bindUserStore(storeId) {
  return callUserAuth('bindUserStore', { store_id: storeId });
}

function unbindUserStore() {
  return callUserAuth('unbindUserStore');
}

function registerVisitStoreIntent(storeId) {
  return callUserAuth('registerVisitStoreIntent', { store_id: storeId });
}

function setMerchantProfile(storeId) {
  return callUserAuth('setMerchantProfile', { store_id: storeId || '' });
}

function createOaBindQr() {
  return callUserAuth('createOaBindQr');
}

function ping() {
  return callUserAuth('ping');
}

module.exports = {
  initDatabase,
  getUserInfo,
  syncProfile,
  bindPhone,
  dedupeMyUser,
  bindUserStore,
  unbindUserStore,
  registerVisitStoreIntent,
  setMerchantProfile,
  createOaBindQr,
  ping
};
