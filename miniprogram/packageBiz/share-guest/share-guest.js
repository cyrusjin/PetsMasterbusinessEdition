const app = getApp();
const {
  enableStoreShareMenu,
  buildMerchantShareConfig,
  listGuestShareCards,
  promptShareUnavailable,
  prefetchStoreShareImage
} = require('../../utils/storeShare');
const { openProxyGuestPicker } = require('../../utils/proxyOrder');
const { hideHomeButton } = require('../../utils/navBar');
const { redirectToStoreAuthIfNeeded, redirectToUserIfMerchantUiBlocked } = require('../../utils/shell');

Page({
  data: {
    shopName: '',
    cards: [],
    isProxy: false,
    pickerTitle: '发给客人预约',
    pickerSub: '客人打开后会直接进入对应服务的预约页'
  },

  onLoad(options) {
    hideHomeButton();
    enableStoreShareMenu();
    const isProxy = String((options && options.mode) || '') === 'proxy';
    this._isProxy = isProxy;
    if (isProxy) {
      openProxyGuestPicker('', { redirect: true });
      return;
    }
    this.setData({
      isProxy: false,
      pickerTitle: '发给客人预约',
      pickerSub: '客人打开后会直接进入对应服务的预约页'
    });
    this._refreshCards();
  },

  onShow() {
    hideHomeButton();
    if (redirectToUserIfMerchantUiBlocked()) return;
    if (redirectToStoreAuthIfNeeded()) return;
    this._refreshCards();
  },

  _refreshCards() {
    const shop = (app.getShop && app.getShop()) || {};
    const cards = listGuestShareCards(shop);
    this.setData({
      shop,
      shopName: (shop && shop.name) || '',
      cards
    });
    prefetchStoreShareImage(shop);
    if (!shop.store_id) {
      promptShareUnavailable();
    }
  },

  onTouchMove() {},

  onClose() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/merchant/tab-daily/tab-daily' }) });
  },

  onPickProxy() {
    openProxyGuestPicker('', { redirect: true });
  },

  onShareAppMessage(res) {
    const serviceLine = res && res.target && res.target.dataset && res.target.dataset.serviceLine;
    return buildMerchantShareConfig(this, { serviceLine });
  }
});
