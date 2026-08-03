/**
 * 双端壳：用户版用原生 custom-tab-bar；商家版用页面内 merchant-tab-bar
 */

const { isMerchantApproved, isMerchantPending, isMerchantRejected, isMerchantDisabled } = require('./role');

const USER_TAB_ROUTES = [
  'pages/index/index',
  'pages/orders/orders',
  'pages/daily/daily'
];

const MERCHANT_TAB_ROUTES = [
  'pages/merchant/tab-daily/tab-daily',
  'pages/merchant/tab-statistics/tab-statistics',
  'pages/merchant/tab-store/tab-store'
];

const MERCHANT_APPLY_HOME = '/pages/merchant/tab-store/tab-store';
const MERCHANT_HOME = '/pages/merchant/tab-daily/tab-daily';
const USER_HOME = '/pages/index/index';

function getCurrentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return current ? current.route : '';
}

function isMerchantTabRoute(route) {
  return MERCHANT_TAB_ROUTES.includes(route || getCurrentRoute());
}

function isUserTabRoute(route) {
  return USER_TAB_ROUTES.includes(route || getCurrentRoute());
}

function hasMerchantBackendAccess() {
  try {
    const app = getApp();
    if (app.isUserClientMode && app.isUserClientMode()) return false;
    if (app.isMerchantApproved && app.isMerchantApproved()) return true;
    return isMerchantApproved(app.globalData && app.globalData.userInfo);
  } catch (err) {
    return false;
  }
}

function canUseMerchantShell() {
  try {
    const app = getApp();
    if (app.isUserClientMode && app.isUserClientMode()) return false;
    const user = app.globalData && app.globalData.userInfo;
    if (hasMerchantBackendAccess()) return true;
    // 未入驻也可进商家壳，仅用于门店授权/申请入驻（不再走演示模式）
    if (app.globalData && app.globalData.role === 'merchant') return true;
    if (isMerchantPending(user) || isMerchantRejected(user) || isMerchantDisabled(user)) return true;
    return false;
  } catch (err) {
    return false;
  }
}

function hasMerchantStore() {
  return hasMerchantBackendAccess();
}

function getMerchantLandingUrl() {
  // 已入驻进日常管理；未入驻只进门店授权
  if (hasMerchantBackendAccess()) return MERCHANT_HOME;
  return MERCHANT_APPLY_HOME;
}

/** 未审核通过时强制回到门店授权页；返回 true 表示已发起跳转 */
function redirectToStoreAuthIfNeeded() {
  try {
    const app = getApp();
    if (!app) return false;
    if (app.isUserClientMode && app.isUserClientMode()) return false;
    if (app.isMerchantApproved && app.isMerchantApproved()) return false;
    const route = getCurrentRoute();
    if (route === 'pages/merchant/tab-store/tab-store') return false;
    wx.redirectTo({ url: MERCHANT_APPLY_HOME });
    return true;
  } catch (err) {
    return false;
  }
}

function getUserLandingUrl() {
  return USER_HOME;
}

function applyRoleShell() {
  try {
    const app = getApp();
    const inUserMode = !!(app.isUserClientMode && app.isUserClientMode());
    const useMerchant = !inUserMode && canUseMerchantShell();
    if (useMerchant) {
      // 商家页不在原生 tabBar 内，隐藏原生栏避免叠层
      wx.hideTabBar({ animation: false }).catch(() => {});
      return;
    }
    // 用户版：隐藏原生默认栏，由 custom-tab-bar 展示
    wx.hideTabBar({ animation: false }).catch(() => {});
  } catch (err) {
    // ignore
  }
}

function guardUserTabPage() {
  try {
    const app = getApp();
    if (!app) return false;
    if (app.isUserClientMode && app.isUserClientMode()) return false;
    if (app.canAccessMerchantBackend && app.canAccessMerchantBackend() && !(app.isUserClientMode && app.isUserClientMode())) {
      // 已入驻商家误入用户 Tab：交给 app 冷启动跳转，此处不强制
      return false;
    }
  } catch (err) {
    // ignore
  }
  return false;
}

module.exports = {
  MERCHANT_APPLY_HOME,
  MERCHANT_HOME,
  USER_HOME,
  applyRoleShell,
  guardUserTabPage,
  USER_TAB_ROUTES,
  MERCHANT_TAB_ROUTES,
  isMerchantTabRoute,
  isUserTabRoute,
  hasMerchantStore,
  hasMerchantBackendAccess,
  canUseMerchantShell,
  getMerchantLandingUrl,
  getUserLandingUrl,
  redirectToStoreAuthIfNeeded
};
