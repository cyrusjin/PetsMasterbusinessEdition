/**
 * 开业引导弹窗：刚开始营业时弹出；测试店可在「我的门店」强制反复弹出
 */

const { isStoreOpenForUsers } = require('./storeStatus');

/** 测试店：每次进入「我的门店」都弹（测完可删） */
const FORCE_OPEN_SUCCESS_STORE_IDS = [
  'store_1786369931157_qflhbd',
  'QJSKWPDG'
];

function markForceOpenSuccessPromo(app) {
  if (!app || !app.globalData) return;
  app.globalData.forceOpenSuccessPromo = true;
}

/**
 * 消费「刚开业」强制弹窗标记
 * @returns {boolean}
 */
function consumeForcePromoRequest(app) {
  if (!app || !app.globalData || !app.globalData.forceOpenSuccessPromo) return false;
  app.globalData.forceOpenSuccessPromo = false;
  return true;
}

function isMerchantStoreOpen(app) {
  try {
    const shop = app && typeof app.getShop === 'function' ? app.getShop() : null;
    if (!shop || !shop.store_id) return false;
    return isStoreOpenForUsers(shop.status);
  } catch (err) {
    return false;
  }
}

function isForceOpenSuccessStore(shop) {
  const store = shop || {};
  const storeId = String(store.store_id || '').trim();
  const displayNo = String(store.displayNo || '').trim().toUpperCase();
  return FORCE_OPEN_SUCCESS_STORE_IDS.some((item) => {
    const key = String(item || '').trim();
    if (!key) return false;
    return key === storeId || key.toUpperCase() === displayNo;
  });
}

/**
 * @returns {Promise<boolean>}
 */
function canShowOpenSuccessPromo(app, options = {}) {
  const force = !!(options && options.force);
  if (!isMerchantStoreOpen(app) && !force) return Promise.resolve(false);
  if (force) {
    // 刚点「开始营业」或测试店：允许直接弹
    try {
      const shop = app && typeof app.getShop === 'function' ? app.getShop() : null;
      if (shop && shop.store_id) return Promise.resolve(true);
    } catch (err) {
      // ignore
    }
    return Promise.resolve(!!(options && options.allowWithoutShop));
  }
  return Promise.resolve(false);
}

module.exports = {
  FORCE_OPEN_SUCCESS_STORE_IDS,
  markForceOpenSuccessPromo,
  consumeForcePromoRequest,
  isForceOpenSuccessStore,
  canShowOpenSuccessPromo,
  isMerchantStoreOpen
};
