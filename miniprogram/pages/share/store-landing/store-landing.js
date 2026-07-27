const app = getApp();
const { resolveImageUrl } = require('../../../utils/imageCache');

const WELCOME_HOLD_MS = 500;

Page({
  data: {
    storeId: '',
    storeName: '',
    storeLogo: '',
    storeAddress: '',
    welcomeText: '',
    phase: 'loading',
    jumping: false,
    jumpFailed: false,
    loadError: '',
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
    // 跳转与拉店并行：不必等店铺接口返回再开始计时
    this._scheduleJump(storeId);
    this._loadStore(storeId);
  },

  onUnload() {
    if (this._jumpTimer) {
      clearTimeout(this._jumpTimer);
      this._jumpTimer = null;
    }
  },

  _loadStore(storeId) {
    app.ensureCloudAndLogin({ silent: true })
      .then(() => app.bindStore(storeId, { syncUser: false, force: true }))
      .then((store) => this._applyStoreView(store))
      .then(() => {
        this.setData({ phase: 'ready' });
      })
      .catch(() => {
        this.setData({
          phase: 'ready',
          storeName: '宠物寄养店',
          welcomeText: '欢迎加入我们的宠物大家庭，一起守护毛孩子的每一天'
        });
      });
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

  _scheduleJump(storeId) {
    if (this._jumpTimer) clearTimeout(this._jumpTimer);
    this._jumpTimer = setTimeout(() => {
      this._jumpTimer = null;
      this._jumpToUserApp(storeId);
    }, WELCOME_HOLD_MS);
  },

  _jumpToUserApp(storeId) {
    if (!storeId) return;
    this.setData({ jumping: true, jumpFailed: false });
    app.enterUserStore(storeId).then((result) => {
      if (result && result.errMsg) {
        this.setData({ jumping: false, jumpFailed: true });
        return;
      }
      this.setData({ jumping: false });
    });
  },

  onContinue() {
    const { storeId, jumping } = this.data;
    if (!storeId || jumping) return;
    if (this._jumpTimer) {
      clearTimeout(this._jumpTimer);
      this._jumpTimer = null;
    }
    this._jumpToUserApp(storeId);
  }
});
