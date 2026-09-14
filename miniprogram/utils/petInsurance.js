const { callApiService } = require('./api');

// 平安好车主小程序分享链接，支持按钮跳转及复制备用。
const PET_INSURANCE_URL = '#小程序://平安好车主/qxDPjgUdWuiVzqc';
const PET_INSURANCE_SHARE_PATH = 'packageUser/user/pet-insurance/pet-insurance';
const PET_INSURANCE_SHARE_IMAGE = '/images/insurance/pingan-logo.png';
const PET_INSURANCE_LINK_HOURS = 6;

// 首页和购买弹窗统一先进入保险二级页面。
function openPetInsurance(callbacks = {}) {
  wx.navigateTo({
    url: '/packageUser/user/pet-insurance/pet-insurance',
    success: callbacks.success,
    fail: (err) => {
      wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' });
      if (callbacks.fail) callbacks.fail(err);
    }
  });
}

// 仅由保险二级页面的购买按钮触发外部小程序跳转。
function navigateToPetInsurance(callbacks = {}) {
  const onFail = (err) => {
    if (!/cancel/i.test(String((err && err.errMsg) || ''))) {
      wx.showToast({ title: '暂时无法跳转，请使用下方小程序码', icon: 'none' });
    }
    if (callbacks.fail) callbacks.fail(err);
  };
  if (typeof wx.navigateToMiniProgram !== 'function') {
    onFail({ errMsg: 'navigateToMiniProgram:fail unsupported' });
    return;
  }
  wx.navigateToMiniProgram({
    shortLink: PET_INSURANCE_URL,
    success: callbacks.success,
    fail: onFail
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
  navigateToPetInsurance,
  recordPetInsuranceEvent,
  createPetInsuranceShare,
  validatePetInsuranceShare,
  buildPetInsuranceSharePath,
  buildPetInsuranceShareConfig
};
