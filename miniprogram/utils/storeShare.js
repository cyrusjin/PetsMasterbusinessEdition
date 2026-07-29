const { STORAGE_KEYS } = require('./constants');

const DEFAULT_SHARE_IMAGE = '/images/default-avatar.png';
/** 旧版商家端落地页（历史分享卡片仍可能打开） */
const CUSTOMER_SHARE_LANDING = 'pages/share/store-landing/store-landing';
/** 跳转宠主端小程序时的首页路径（员工邀请等场景仍可用） */
const USER_MINI_PROGRAM_HOME = 'pages/index/index';

function resolveShareStoreId(shop) {
  let app = null;
  try {
    app = getApp();
  } catch (err) {
    app = null;
  }

  const candidates = [
    shop && shop.store_id,
    app && app.globalData && app.globalData.merchantStoreId,
    app && app.getShareStoreId && app.getShareStoreId(),
    app && app.getShop && app.getShop() && app.getShop().store_id,
    app && app.getStoreId && app.getStoreId(),
    app && app.globalData && app.globalData.userInfo && app.globalData.userInfo.store_id,
    app && app.getCurrentStore && app.getCurrentStore() && app.getCurrentStore().store_id
  ];

  if (app && wx.getStorageSync) {
    const cachedShop = wx.getStorageSync(STORAGE_KEYS.SHOP) || {};
    candidates.push(cachedShop.store_id);
    candidates.push(wx.getStorageSync(STORAGE_KEYS.STORE_ID));
  }

  return candidates.find((id) => id && String(id).trim()) || '';
}

function buildSharePath(storeId) {
  const id = (storeId || '').trim();
  if (!id) return CUSTOMER_SHARE_LANDING;
  return `${CUSTOMER_SHARE_LANDING}?store_id=${encodeURIComponent(id)}`;
}

function buildStaffSharePath(storeId) {
  const id = (storeId || '').trim();
  if (!id) return 'pages/merchant/tab-daily/tab-daily';
  return `pages/merchant/tab-daily/tab-daily?staff_invite=1&store_id=${encodeURIComponent(id)}`;
}

function buildStoreShareConfig(shop, storeId) {
  const id = resolveShareStoreId(shop) || (storeId || '').trim();
  const name = (shop && shop.name) || '宠物寄养';
  const logo = (shop && shop.logo) || DEFAULT_SHARE_IMAGE;
  const path = buildSharePath(id);
  return {
    title: `${name} · 在线预约寄养`,
    path,
    imageUrl: logo
  };
}

function buildTimelineShareConfig(shop, storeId) {
  const appMessage = buildStoreShareConfig(shop, storeId);
  const id = resolveShareStoreId(shop) || (storeId || '').trim();
  return {
    title: appMessage.title,
    query: id ? `store_id=${encodeURIComponent(id)}` : '',
    imageUrl: appMessage.imageUrl
  };
}

function enableStoreShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  });
}

function promptShareUnavailable() {
  wx.showToast({ title: '请先申请入驻', icon: 'none' });
}

/** 商家页右上角「···」转发时，合并页面与本地缓存的店铺信息 */
function resolveMerchantShareShop(page) {
  const app = getApp();
  const pageShop = (page && page.data && page.data.shop) || {};
  const cachedShop = (app && app.getShop && app.getShop()) || {};
  const userStoreId = (app.globalData.userInfo && app.globalData.userInfo.store_id) || '';
  const merchantStoreId = (app.globalData && app.globalData.merchantStoreId) || '';
  const storeId = resolveShareStoreId({
    ...cachedShop,
    ...pageShop,
    store_id: pageShop.store_id || cachedShop.store_id || merchantStoreId || userStoreId
  });
  return {
    ...cachedShop,
    ...pageShop,
    store_id: storeId
  };
}

function buildMerchantShareConfig(page) {
  const shop = resolveMerchantShareShop(page);
  if (!shop.store_id) {
    promptShareUnavailable();
  }
  return buildStoreShareConfig(shop, shop.store_id);
}

function buildStaffShareConfig(page) {
  const shop = resolveMerchantShareShop(page);
  if (!shop.store_id) {
    promptShareUnavailable();
    return buildStoreShareConfig(shop);
  }
  const name = (shop && shop.name) || '宠物寄养';
  const logo = (shop && shop.logo) || DEFAULT_SHARE_IMAGE;
  return {
    title: `${name} · 邀请您加入店铺管理`,
    path: buildStaffSharePath(shop.store_id),
    imageUrl: logo
  };
}

function buildMerchantTimelineShareConfig(page) {
  const shop = resolveMerchantShareShop(page);
  return buildTimelineShareConfig(shop);
}

module.exports = {
  DEFAULT_SHARE_IMAGE,
  CUSTOMER_SHARE_LANDING,
  USER_MINI_PROGRAM_HOME,
  buildSharePath,
  buildStaffSharePath,
  resolveShareStoreId,
  buildStoreShareConfig,
  buildStaffShareConfig,
  buildTimelineShareConfig,
  buildMerchantShareConfig,
  buildMerchantTimelineShareConfig,
  resolveMerchantShareShop,
  enableStoreShareMenu,
  promptShareUnavailable
};
