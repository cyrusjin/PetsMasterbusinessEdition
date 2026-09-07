/**
 * 双端壳：用户版用原生 custom-tab-bar；商家版用页面内 merchant-tab-bar
 */

const { isMerchantApproved, isMerchantPending, isMerchantRejected, isMerchantDisabled } = require('./role');
const { isMerchantUiBlocked, fetchMerchantSwitchEnabled, applyMerchantSwitchToApp } = require('./merchantSwitch');
const { isBasicStoreComplete } = require('./storeForm');

const USER_TAB_ROUTES = [
  'pages/index/index',
  'pages/orders/orders',
  'pages/daily/daily'
];

const MERCHANT_TAB_ROUTES = [
  'pages/merchant/tab-daily/tab-daily',
  'pages/merchant/tab-statistics/tab-statistics',
  'pages/merchant/tab-guide/tab-guide',
  'pages/merchant/tab-store/tab-store'
];

const MERCHANT_APPLY_HOME = '/pages/merchant/tab-store/tab-store';
const MERCHANT_HOME = '/pages/merchant/tab-daily/tab-daily';
const MEMBERSHIP_HOME = '/packageExtra/membership/membership?required=1';
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

function getAppShopSafe() {
  try {
    const app = getApp();
    if (app && typeof app.getShop === 'function') return app.getShop() || null;
  } catch (err) {
    // ignore
  }
  return null;
}

function hasCompletedBasicSetup() {
  try {
    const app = getApp();
    if (app && typeof app.hasCompletedBasicStoreSetup === 'function') {
      return !!app.hasCompletedBasicStoreSetup();
    }
  } catch (err) {
    // fall through
  }
  return isBasicStoreComplete(getAppShopSafe());
}

/** 商家壳下可用业务能力：未禁用即可（不再要求审核通过） */
function hasMerchantBackendAccess() {
  try {
    if (isMerchantUiBlocked()) return false;
    const app = getApp();
    if (app.isUserClientMode && app.isUserClientMode()) return false;
    if (app.isMerchantDisabled && app.isMerchantDisabled()) return false;
    const user = app.globalData && app.globalData.userInfo;
    if (isMerchantDisabled(user)) return false;
    // 商家壳内即可访问后端能力；基础未完成由落地页/跳转约束
    if (app.globalData && app.globalData.role === 'merchant') return true;
    if (app.isMerchantApproved && app.isMerchantApproved()) return true;
    if (isMerchantApproved(user) || isMerchantPending(user) || isMerchantRejected(user)) return true;
    return false;
  } catch (err) {
    return false;
  }
}

function canUseMerchantShell() {
  try {
    if (isMerchantUiBlocked()) return false;
    const app = getApp();
    if (app.isUserClientMode && app.isUserClientMode()) return false;
    const user = app.globalData && app.globalData.userInfo;
    if (hasMerchantBackendAccess()) return true;
    if (app.globalData && app.globalData.role === 'merchant') return true;
    if (isMerchantPending(user) || isMerchantRejected(user) || isMerchantDisabled(user)) return true;
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * 审核态 / 商家开关已明确关闭 / 非正式环境误入商家页时踢回用户首页。
 * 注意：未拉取远程前不按「默认关闭」误踢（develop 默认关，需等 fetch）。
 * 返回 true 表示已发起跳转。
 */
function redirectToUserIfMerchantUiBlocked() {
  try {
    const route = getCurrentRoute();
    if (!route || route.indexOf('pages/merchant/') !== 0) return false;
    if (isMerchantUiBlocked()) {
      wx.switchTab({ url: USER_HOME });
      return true;
    }
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData && app.globalData.merchantSwitchEnabled === false) {
      wx.switchTab({ url: USER_HOME });
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

function isMembershipAccessKnown(membership) {
  if (!membership || typeof membership !== 'object') return false;
  return typeof membership.active === 'boolean'
    || typeof membership.accessActive === 'boolean'
    || !!membership.statusType
    || !!membership.accessType;
}

function hasActiveMembershipAccess(membership) {
  if (!membership || typeof membership !== 'object') return false;
  if (membership.active === true || membership.accessActive === true) return true;
  return !!(
    membership.subscriptionActive || membership.subscription_active
    || membership.trialActive || membership.trial_active
    || membership.migrationActive || membership.migration_active
    || membership.promotionActive || membership.promotion_active
  );
}

function ensureMembershipAccess(app) {
  if (!app || (app.isMerchantDemoMode && app.isMerchantDemoMode())) return Promise.resolve(false);
  if (!app.isMerchantApproved || !app.isMerchantApproved()) return Promise.resolve(false);
  if (typeof app.ensureMerchantStore !== 'function') return Promise.resolve(false);
  return app.ensureMerchantStore({ force: false }).then((shop) => {
    if (!shop || !shop.store_id) return false;
    const membership = shop.membership;
    if (!isMembershipAccessKnown(membership) || hasActiveMembershipAccess(membership)) return false;
    wx.reLaunch({ url: MEMBERSHIP_HOME });
    return true;
  }).catch(() => false);
}

/**
 * 先拉远程开关再决定是否拦截商家页；用于避免默认值误放行。
 * resolve(true) 表示已跳走 / 应中止页面逻辑。
 */
function ensureMerchantPageAllowed() {
  const app = typeof getApp === 'function' ? getApp() : null;
  if (redirectToUserIfMerchantUiBlocked()) return Promise.resolve(true);
  // 启动时已拉过开关且允许进入，切 Tab 不再重复打远程接口
  if (app && app.globalData && app.globalData.merchantSwitchEnabled === true) {
    return ensureMembershipAccess(app);
  }
  return fetchMerchantSwitchEnabled({ force: false }).then((enabled) => {
    applyMerchantSwitchToApp(app, enabled);
    if (!enabled || isMerchantUiBlocked()) {
      try {
        wx.switchTab({ url: USER_HOME });
      } catch (err) {
        // ignore
      }
      return true;
    }
    return ensureMembershipAccess(app);
  });
}

function hasMerchantStore() {
  return hasMerchantBackendAccess();
}

function getMerchantLandingUrl() {
  if (hasCompletedBasicSetup()) return MERCHANT_HOME;
  return MERCHANT_APPLY_HOME;
}

/** 基础设置未完成时强制回门店页；返回 true 表示已发起跳转 */
function redirectToStoreAuthIfNeeded() {
  try {
    if (redirectToUserIfMerchantUiBlocked()) return true;
    const app = getApp();
    if (!app) return false;
    if (app.isUserClientMode && app.isUserClientMode()) return false;
    if (app.isMerchantDisabled && app.isMerchantDisabled()) return false;
    if (hasCompletedBasicSetup()) return false;
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
      wx.hideTabBar({ animation: false }).catch(() => {});
      return;
    }
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
  redirectToStoreAuthIfNeeded,
  redirectToUserIfMerchantUiBlocked,
  ensureMerchantPageAllowed,
  hasActiveMembershipAccess,
  hasCompletedBasicSetup
};
