/**
 * 用户端广告位（商家端不展示）。
 * 本版只搭了半屏弹层 + Tab 上 Banner 的架子，未接流量主/投放。
 * 下个版本再打开 USER_ADS_ENABLED，并填素材或 unit-id。
 */

const { getMiniProgramMeta } = require('./merchantSwitch');

const USER_ADS_ENABLED = false;

const NATIVE_AD = {
  id: 'user-native-half',
  image: '',
  title: '安心寄养',
  desc: '给毛孩子一个温暖的家',
  path: ''
};

const BANNER_AD = {
  id: 'user-banner-tab',
  image: '',
  path: ''
};

/** 底部 Banner 展示高度（rpx），tab 栏本身约 100rpx + 安全区 */
const BANNER_HEIGHT_RPX = 168;

function isUserShell() {
  try {
    const app = getApp();
    if (!app) return true;
    if (app.isUserClientMode && app.isUserClientMode()) return true;
    if (app.globalData && app.globalData.role === 'merchant') return false;
  } catch (err) {
    // ignore
  }
  return true;
}

function shouldShowUserAds() {
  if (!USER_ADS_ENABLED) return false;
  const env = getMiniProgramMeta().envVersion;
  // 提审体验版先不弹，避免审核看到未开通的广告位
  if (env === 'trial') return false;
  return isUserShell();
}

function shouldShowUserBannerAd() {
  return shouldShowUserAds();
}

function shouldShowUserNativeAd() {
  return shouldShowUserAds();
}

function hasShownNativeAdThisLaunch() {
  try {
    const app = getApp();
    return !!(app && app.globalData && app.globalData.userNativeAdShown);
  } catch (err) {
    return false;
  }
}

function markNativeAdShown() {
  try {
    const app = getApp();
    if (!app.globalData) app.globalData = {};
    if (app.globalData.userNativeAdShown) return false;
    app.globalData.userNativeAdShown = true;
    return true;
  } catch (err) {
    return false;
  }
}

function applyUserBannerAdPadding(page) {
  if (!page || typeof page.setData !== 'function') return;
  page.setData({ showUserBannerAd: shouldShowUserBannerAd() });
}

function openAdTarget(ad) {
  const path = String((ad && ad.path) || '').trim();
  if (path) {
    wx.navigateTo({
      url: path,
      fail: () => wx.showToast({ title: '暂无法打开', icon: 'none' })
    });
    return;
  }
  wx.showToast({ title: '示例广告', icon: 'none' });
}

const USER_AD_CREATIVE_SPECS = {
  nativeHalf: {
    display: '半屏弹层主图',
    ratio: '3:4',
    recommendPx: '1080 × 1440',
    alsoOk: ['1024 × 1536', '750 × 1000'],
    format: 'JPG / PNG',
    maxKb: 200
  },
  banner: {
    display: 'Tab 上方横幅',
    ratio: '5:1',
    recommendPx: '1125 × 225',
    alsoOk: ['1080 × 216', '750 × 150'],
    format: 'JPG / PNG',
    maxKb: 150
  }
};

module.exports = {
  NATIVE_AD,
  BANNER_AD,
  BANNER_HEIGHT_RPX,
  USER_AD_CREATIVE_SPECS,
  shouldShowUserAds,
  shouldShowUserBannerAd,
  shouldShowUserNativeAd,
  hasShownNativeAdThisLaunch,
  markNativeAdShown,
  applyUserBannerAdPadding,
  openAdTarget
};
