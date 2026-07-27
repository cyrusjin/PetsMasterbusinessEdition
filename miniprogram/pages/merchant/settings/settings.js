const app = getApp();
const { copyText } = require('../../../utils/clipboard');

Page({
  data: { shop: {}, billingMode: 'weight', weightPricing: [], roomPricing: {} },

  onShow() {
    app.ensureCloudAndLogin().then(() => {
      if (app.globalData.isMerchant) {
        wx.reLaunch({ url: '/pages/merchant/tab-store/tab-store' });
        return;
      }
      app.ensureMerchantStore().then((shop) => {
        const rules = app.getBillingRules();
        this.setData({
          shop: app.getShop(),
          billingMode: rules.billingMode || 'weight',
          weightPricing: rules.weightPricing || [],
          roomPricing: rules.roomPricing || {}
        });
      });
    });
  },

  onField(e) {
    const shop = { ...this.data.shop };
    shop[e.currentTarget.dataset.field] = e.detail.value;
    this.setData({ shop });
  },

  onChooseLogo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const shop = { ...this.data.shop, logo: res.tempFiles[0].tempFilePath };
        this.setData({ shop });
      }
    });
  },

  onBillingMode(e) { this.setData({ billingMode: e.detail.value }); },

  onWeightPrice(e) {
    const idx = e.currentTarget.dataset.index;
    const weightPricing = [...this.data.weightPricing];
    weightPricing[idx] = { ...weightPricing[idx], price: parseFloat(e.detail.value) || 0 };
    this.setData({ weightPricing });
  },

  onRoomPrice(e) {
    const roomPricing = { ...this.data.roomPricing };
    roomPricing[e.currentTarget.dataset.key] = parseFloat(e.detail.value) || 0;
    this.setData({ roomPricing });
  },

  onSave() {
    wx.showLoading({ title: '保存中' });
    const shop = { ...this.data.shop };
    const uploadLogo = () => {
      const logo = shop.logo;
      if (!logo || logo.startsWith('cloud://') || logo.startsWith('https://') || logo.startsWith('http://')) {
        return Promise.resolve(logo);
      }
      const { uploadStoreLogo } = require('../../../utils/storePhotos');
      return uploadStoreLogo(logo);
    };

    uploadLogo()
      .then((logo) => {
        if (logo) shop.logo = logo;
        return app.syncShopToCloud(shop);
      })
      .then((saved) => {
        app.saveBillingRules({
          ...app.getBillingRules(),
          billingMode: this.data.billingMode,
          weightPricing: this.data.weightPricing,
          roomPricing: this.data.roomPricing
        });
        this.setData({ shop: saved });
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
  },

  onCopyStoreDisplayNo() {
    copyText(this.data.shop && this.data.shop.displayNo, '已复制店铺编号');
  }
});
