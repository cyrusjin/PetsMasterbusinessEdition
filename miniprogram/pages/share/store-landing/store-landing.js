const app = getApp();
const auth = require('../../../utils/auth');
const { resolveImageUrl } = require('../../../utils/imageCache');
const { OA_USERNAME, DEFAULT_OA_QRCODE } = require('../../../utils/officialAccount');

Page({
  data: {
    storeId: '',
    storeName: '',
    storeLogo: '',
    storeAddress: '',
    welcomeText: '',
    phase: 'loading',
    loadError: '',
    oaQrcodeUrl: DEFAULT_OA_QRCODE,
    intentRegistered: false,
    intentError: '',
    perks: [
      {
        icon: '/images/card/card-pets.png',
        title: '专属宠物档案',
        desc: '记录毛孩子的性格、习惯与健康状况'
      },
      {
        icon: '/images/card/card-check.png',
        title: '专业安心照护',
        desc: '寄养期间每日悉心照料，放心托付'
      },
      {
        icon: '/images/card/card-camera.png',
        title: '每日动态分享',
        desc: '随时查看宝贝的生活点滴与成长瞬间'
      }
    ]
  },

  onLoad(options) {
    const storeId = (options.store_id || '').trim();
    this.setData({ storeId });
    if (!storeId) {
      this.setData({
        phase: 'ready',
        loadError: '邀请链接无效，请联系商家重新分享'
      });
      return;
    }
    this._bootstrap(storeId);
  },

  _bootstrap(storeId) {
    app.ensureCloudAndLogin({ silent: true })
      .then(() => this._applyOaQrcode())
      .then(() => app.bindStore(storeId, { syncUser: false, force: true }))
      .then((store) => this._applyStoreView(store))
      .then(() => auth.registerVisitStoreIntent(storeId))
      .then((res) => {
        this.setData({
          intentRegistered: !!(res && res.success),
          intentError: (res && !res.success && res.errMsg) || ''
        });
      })
      .catch(() => {
        this.setData({ intentError: '登记邀请失败，请稍后重试' });
      })
      .finally(() => {
        this.setData({ phase: 'ready' });
      });
  },

  _applyOaQrcode() {
    const user = (app.globalData && app.globalData.userInfo) || {};
    const url = (user.oaQrcodeUrl || '').trim();
    if (!url) {
      return Promise.resolve();
    }
    return resolveImageUrl(url)
      .then((resolved) => {
        if (resolved) {
          this.setData({ oaQrcodeUrl: resolved });
        }
      })
      .catch(() => {});
  },

  _applyStoreView(store) {
    if (!store) {
      this.setData({
        storeName: '宠物寄养店',
        welcomeText: '欢迎加入我们的宠物大家庭，一起守护毛孩子的每一天'
      });
      return Promise.resolve();
    }

    const name = (store.name || '').trim() || '宠物寄养店';
    const address = (store.addressRegion || store.address || '').trim();
    const welcomeText = store.intro
      ? String(store.intro).trim()
      : `${name} 诚邀您加入我们的宠物大家庭，在这里，每一只毛孩子都被温柔以待。`;

    const updates = {
      storeName: name,
      storeAddress: address,
      welcomeText
    };

    if (!store.logo) {
      this.setData(updates);
      return Promise.resolve();
    }

    return resolveImageUrl(store.logo)
      .then((url) => {
        updates.storeLogo = url || store.logo;
        this.setData(updates);
      })
      .catch(() => {
        updates.storeLogo = store.logo;
        this.setData(updates);
      });
  },

  onOpenOfficialAccount() {
    if (!wx.openOfficialAccountProfile) {
      wx.showToast({ title: '请长按识别二维码关注', icon: 'none' });
      return;
    }
    wx.openOfficialAccountProfile({
      username: OA_USERNAME,
      fail: () => wx.showToast({ title: '请长按识别二维码关注', icon: 'none' })
    });
  },

  onPreviewOaQrcode() {
    const url = this.data.oaQrcodeUrl || DEFAULT_OA_QRCODE;
    wx.previewImage({ urls: [url], current: url });
  }
});
