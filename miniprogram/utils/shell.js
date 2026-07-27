const { isMerchantApproved, isMerchantPending, isMerchantRejected, isMerchantDisabled } = require('./role');
const { isMerchantDemoMode } = require('./merchantDemo');

const MERCHANT_APPLY_HOME = '/pages/merchant/tab-daily/tab-daily';
const MERCHANT_HOME = '/pages/merchant/tab-daily/tab-daily';

const MERCHANT_TAB_ROUTES = [
  'pages/merchant/tab-daily/tab-daily',
  'pages/merchant/tab-statistics/tab-statistics',
  'pages/merchant/tab-store/tab-store'
];

function getCurrentRoute() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  return current ? current.route : '';
}

function isMerchantTabRoute(route) {
  return MERCHANT_TAB_ROUTES.includes(route);
}

function hasMerchantBackendAccess() {
  try {
    const app = getApp();
    if (app.isMerchantApproved && app.isMerchantApproved()) return true;
    return isMerchantApproved(app.globalData && app.globalData.userInfo);
  } catch (err) {
    return false;
  }
}

function canUseMerchantShell() {
  try {
    const user = getApp().globalData && getApp().globalData.userInfo;
    if (hasMerchantBackendAccess()) return true;
    if (isMerchantDemoMode(user)) return true;
    if (isMerchantPending(user) || isMerchantRejected(user) || isMerchantDisabled(user)) return true;
    return true; // 商家独立小程序：未入驻也可停留在申请/日报壳
  } catch (err) {
    return true;
  }
}

function hasMerchantStore() {
  return hasMerchantBackendAccess();
}

function getMerchantLandingUrl() {
  return MERCHANT_HOME;
}

/** 商家独立小程序：不做宠主/商家壳切换 */
function applyRoleShell() {
  // no-op
}

function guardUserTabPage() {
  return false;
}

module.exports = {
  MERCHANT_APPLY_HOME,
  MERCHANT_HOME,
  applyRoleShell,
  guardUserTabPage,
  USER_TAB_ROUTES: [],
  MERCHANT_TAB_ROUTES,
  isMerchantTabRoute,
  hasMerchantStore,
  hasMerchantBackendAccess,
  canUseMerchantShell,
  getMerchantLandingUrl
};
