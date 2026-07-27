const { callApiService } = require('./api');

function callStoreService(action, data = {}) {
  return callApiService('storeService', { action, ...data });
}

function getStore(storeId) {
  return callStoreService('getStore', { store_id: storeId });
}

function getMyStore() {
  return callStoreService('getMyStore');
}

function saveStore(shop) {
  return callStoreService('saveStore', { shop });
}

function submitMerchantApply(shop) {
  return callStoreService('submitMerchantApply', { shop });
}

function listPendingMerchantApplications() {
  return callStoreService('listPendingMerchantApplications');
}

function reviewMerchantApplication(payload) {
  return callStoreService('reviewMerchantApplication', payload);
}

function listStoreStaff(storeId) {
  return callStoreService('listStoreStaff', { store_id: storeId || '' });
}

function removeStoreStaff(staffOpenid, storeId) {
  return callStoreService('removeStoreStaff', {
    staff_openid: staffOpenid,
    store_id: storeId || ''
  });
}

function acceptStaffInvite(storeId) {
  return callStoreService('acceptStaffInvite', { store_id: storeId });
}

module.exports = {
  getStore,
  getMyStore,
  saveStore,
  submitMerchantApply,
  listPendingMerchantApplications,
  reviewMerchantApplication,
  listStoreStaff,
  removeStoreStaff,
  acceptStaffInvite
};
