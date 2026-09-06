const { callApiService } = require('./api');

// 第三方保险页无法作为未验证业务域名直接嵌入；仅用于复制后在微信聊天中打开。
const PET_INSURANCE_URL = 'https://emcs.pa18.com/v2/product/p_pet/index.html?appType=01&key=120260618157662108057987395&productName=%E5%B9%B3%E5%AE%89%E5%AE%A0%E6%97%A0%E5%BF%A7%C2%B7%E7%88%B1%E5%AE%A0%E4%BF%9D%E9%9A%9C%E5%8D%A12.0%E7%89%88(%E7%BA%BF%E4%B8%8B%E7%89%88)';
const PET_INSURANCE_SHARE_PATH = 'packageUser/user/pet-insurance/pet-insurance';
const PET_INSURANCE_SHARE_IMAGE = '/images/insurance/pingan-logo.png';
const PET_INSURANCE_LINK_HOURS = 6;

function openPetInsurance(callbacks = {}) {
  wx.navigateTo({
    url: '/packageUser/user/pet-insurance/pet-insurance',
    success: callbacks.success,
    fail: callbacks.fail
  });
}

function recordPetInsuranceEvent(data = {}) {
  return callApiService('orderService', {
    action: 'recordInsuranceEvent',
    eventType: String(data.eventType || '').trim(),
    eventId: String(data.eventId || '').trim(),
    store_id: String(data.store_id || '').trim(),
    source: 'checkout_success_popup'
  });
}

function createPetInsuranceShare(storeId) {
  return callApiService('orderService', {
    action: 'createInsuranceShare',
    store_id: String(storeId || '').trim()
  });
}

function validatePetInsuranceShare(shareToken) {
  return callApiService('orderService', {
    action: 'validateInsuranceShare',
    insurance_token: String(shareToken || '').trim()
  });
}

function buildPetInsuranceSharePath(shareToken) {
  const token = String(shareToken || '').trim();
  if (!token) return PET_INSURANCE_SHARE_PATH;
  return `${PET_INSURANCE_SHARE_PATH}?insurance_token=${encodeURIComponent(token)}`;
}

function buildPetInsuranceShareConfig(shareToken) {
  return {
    title: '中国平安宠物保障 · 给爱宠多一份安心',
    path: buildPetInsuranceSharePath(shareToken),
    imageUrl: PET_INSURANCE_SHARE_IMAGE
  };
}

module.exports = {
  PET_INSURANCE_URL,
  PET_INSURANCE_SHARE_PATH,
  PET_INSURANCE_SHARE_IMAGE,
  PET_INSURANCE_LINK_HOURS,
  openPetInsurance,
  recordPetInsuranceEvent,
  createPetInsuranceShare,
  validatePetInsuranceShare,
  buildPetInsuranceSharePath,
  buildPetInsuranceShareConfig
};
