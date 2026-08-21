const { STORAGE_KEYS } = require('./constants');
const { compactWashProducts } = require('./washProducts');
const { normalizeHomeFeeding } = require('./homeFeeding');
const { isHomeVisitPricingComplete } = require('./homeVisitPricing');
const { getBookableServiceOptions, getServiceShareMeta } = require('./serviceLines');
const { peekCachedPath, resolveImageUrl, isLocalImagePath } = require('./imageCache');

const DEFAULT_SHARE_IMAGE = '/images/default-avatar.png';
/** 旧版落地页（历史分享卡片兼容） */
const CUSTOMER_SHARE_LANDING = 'pages/share/store-landing/store-landing';
/** 本小程序用户端首页（兼容旧逻辑） */
const USER_MINI_PROGRAM_HOME = 'pages/index/index';
/** 客人分享统一进入预约页 */
const USER_RESERVE_PATH = 'packageUser/user/reserve/reserve';
const CUSTOMER_SHARE_TITLE = '开始预约寄养';
const GUEST_SHARE_PICKER_PATH = '/packageBiz/share-guest/share-guest';

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

function getShareableServiceOptions(shop) {
  const washProducts = compactWashProducts(shop && shop.washProducts);
  const homeFeeding = normalizeHomeFeeding(shop && shop.homeFeeding);
  return getBookableServiceOptions(shop, {
    washComplete: washProducts.length > 0,
    homeFeedingComplete: isHomeVisitPricingComplete(homeFeeding)
  });
}

function listGuestShareCards(shop) {
  return getShareableServiceOptions(shop).map((item) => {
    const meta = getServiceShareMeta(item.key);
    return {
      key: item.key,
      name: item.name,
      emoji: meta.emoji,
      pickerTitle: meta.pickerTitle || meta.name,
      pickerDesc: meta.pickerDesc,
      shareTitle: meta.shareTitle,
      homeTitle: meta.homeTitle,
      homeSub: meta.homeSub
    };
  });
}

function resolveShareServiceLine(shop, serviceLine) {
  const shareable = getShareableServiceOptions(shop);
  const line = String(serviceLine || '').trim();
  if (line && shareable.some((item) => item.key === line)) return line;
  if (shareable.length === 1) return shareable[0].key;
  return '';
}

function buildSharePath(storeId, serviceLine) {
  const id = (storeId || '').trim();
  const line = String(serviceLine || '').trim();
  const parts = [];
  if (id) parts.push(`store_id=${encodeURIComponent(id)}`);
  if (line) parts.push(`serviceLine=${encodeURIComponent(line)}`);
  if (!parts.length) return USER_RESERVE_PATH;
  return `${USER_RESERVE_PATH}?${parts.join('&')}`;
}

function buildStaffSharePath(storeId) {
  const id = (storeId || '').trim();
  if (!id) return 'pages/merchant/tab-daily/tab-daily';
  return `pages/merchant/tab-daily/tab-daily?staff_invite=1&store_id=${encodeURIComponent(id)}`;
}

function pickShopLogo(shop) {
  if (!shop || typeof shop !== 'object') return '';
  return String(shop.logo || shop.avatar || shop.storeLogo || '').trim();
}

let prefetchedShareImage = { source: '', path: '' };

function downloadShareTempFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error('分享图下载失败'));
      },
      fail: reject
    });
  });
}

/**
 * 分享封面必须是本地可用路径。网络图下载失败时微信会改用当前页截图。
 */
function resolveShareImageUrl(shop) {
  const logo = pickShopLogo(shop);
  if (!logo) return DEFAULT_SHARE_IMAGE;
  if (prefetchedShareImage.source === logo && prefetchedShareImage.path) {
    return prefetchedShareImage.path;
  }
  if (isLocalImagePath(logo)) return logo;
  const cached = peekCachedPath(logo);
  if (cached) return cached;
  return DEFAULT_SHARE_IMAGE;
}

function prefetchStoreShareImage(shop) {
  const logo = pickShopLogo(shop);
  if (!logo) {
    prefetchedShareImage = { source: '', path: DEFAULT_SHARE_IMAGE };
    return Promise.resolve(DEFAULT_SHARE_IMAGE);
  }
  if (isLocalImagePath(logo)) {
    prefetchedShareImage = { source: logo, path: logo };
    return Promise.resolve(logo);
  }
  const useTemp = logo.indexOf('https://') === 0 || logo.indexOf('http://') === 0;
  const remember = (path) => {
    const resolved = path || DEFAULT_SHARE_IMAGE;
    prefetchedShareImage = { source: logo, path: resolved };
    return resolved;
  };
  if (useTemp) {
    return downloadShareTempFile(logo)
      .then(remember)
      .catch(() => resolveImageUrl(logo).then(remember).catch(() => DEFAULT_SHARE_IMAGE));
  }
  return resolveImageUrl(logo).then(remember).catch(() => DEFAULT_SHARE_IMAGE);
}

function buildStoreShareConfig(shop, storeId, serviceLine) {
  const id = resolveShareStoreId(shop) || (storeId || '').trim();
  const line = resolveShareServiceLine(shop, serviceLine);
  const meta = line ? getServiceShareMeta(line) : getServiceShareMeta('');
  const title = line
    ? meta.shareTitle
    : (getShareableServiceOptions(shop).length > 1 ? '开始预约本店服务' : CUSTOMER_SHARE_TITLE);
  return {
    title,
    path: buildSharePath(id, line),
    imageUrl: resolveShareImageUrl(shop)
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

function enableStoreShareMenu(shop) {
  if (wx.showShareMenu) {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  }
  try {
    const app = getApp();
    prefetchStoreShareImage(shop || (app && app.getShop && app.getShop()) || {});
  } catch (err) {
    // ignore
  }
}

function promptShareUnavailable() {
  wx.showToast({ title: '请先完善店铺资料', icon: 'none' });
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

function buildMerchantShareConfig(page, extra) {
  const shop = resolveMerchantShareShop(page);
  if (!shop.store_id) {
    promptShareUnavailable();
  }
  const serviceLine = extra && extra.serviceLine;
  return buildStoreShareConfig(shop, shop.store_id, serviceLine);
}

function shouldOpenGuestSharePicker(shop) {
  return listGuestShareCards(shop).length > 1;
}

function openGuestSharePicker() {
  wx.navigateTo({ url: GUEST_SHARE_PICKER_PATH, animationType: 'none', animationDuration: 0 });
}

// 商家日常页进入后提前预热轻量服务选择页，避免首次点击等待分包解析。
function preloadGuestSharePicker() {
  if (!wx.preloadPage) return;
  try {
    wx.preloadPage({ url: GUEST_SHARE_PICKER_PATH });
  } catch (err) {
    // 预热失败不影响正常 navigateTo
  }
}

function openProxyOrderPicker() {
  wx.navigateTo({ url: '/packageExtra/customers/customers?mode=proxy' });
}

function buildStaffShareConfig(page) {
  const shop = resolveMerchantShareShop(page);
  if (!shop.store_id) {
    promptShareUnavailable();
    return buildStoreShareConfig(shop);
  }
  const name = (shop && shop.name) || '宠物寄养';
  return {
    title: `${name} · 邀请您加入店铺管理`,
    path: buildStaffSharePath(shop.store_id),
    imageUrl: resolveShareImageUrl(shop)
  };
}

function buildMerchantTimelineShareConfig(page) {
  const shop = resolveMerchantShareShop(page);
  return buildTimelineShareConfig(shop);
}

/**
 * 朋友圈等入口会落到当前商家页：非本店员工时引导进预约页。
 * 返回 true 表示已发起跳转。
 */
function redirectGuestShareToReserve(storeId, serviceLine) {
  const id = String(storeId || '').trim();
  if (!id) return false;
  let app = null;
  try {
    app = getApp();
  } catch (err) {
    return false;
  }
  if (!app) return false;
  if (app.shouldIgnoreShareEntry && app.shouldIgnoreShareEntry()) return false;
  if (app.isStaffForStore && app.isStaffForStore(id)) return false;
  const enter = app.enterUserStore
    ? app.enterUserStore(id, { forceData: true })
    : Promise.resolve();
  Promise.resolve(enter)
    .catch(() => {})
    .finally(() => {
      wx.reLaunch({
        url: `/${buildSharePath(id, serviceLine)}`
      });
    });
  return true;
}

module.exports = {
  DEFAULT_SHARE_IMAGE,
  CUSTOMER_SHARE_LANDING,
  USER_MINI_PROGRAM_HOME,
  USER_RESERVE_PATH,
  CUSTOMER_SHARE_TITLE,
  GUEST_SHARE_PICKER_PATH,
  pickShopLogo,
  resolveShareImageUrl,
  prefetchStoreShareImage,
  preloadGuestSharePicker,
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
  promptShareUnavailable,
  redirectGuestShareToReserve,
  getShareableServiceOptions,
  listGuestShareCards,
  shouldOpenGuestSharePicker,
  openGuestSharePicker,
  openProxyOrderPicker
};
