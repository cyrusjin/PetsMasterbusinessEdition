const {
  consumeForcePromoRequest,
  canShowOpenSuccessPromo
} = require('../../utils/openSuccessPromo');
const { enableStoreShareMenu, shouldOpenGuestSharePicker, openGuestSharePicker } = require('../../utils/storeShare');
const { isOaBound } = require('../../utils/officialAccount');

Component({
  properties: {
    active: {
      type: String,
      value: 'daily'
    },
    isDemoMode: {
      type: Boolean,
      value: false
    }
  },
  data: {
    showBizTabs: true,
    basicReady: false,
    openSuccessVisible: false,
    oaFollowSheetVisible: false,
    guestShareMulti: false
  },
  lifetimes: {
    attached() {
      this._syncBizTabs();
      this._maybeShowForcedOpenSuccessPromo();
    }
  },
  pageLifetimes: {
    show() {
      this._syncBizTabs();
      this._maybeShowForcedOpenSuccessPromo();
    }
  },
  methods: {
    preventMove() {},

    _syncBizTabs() {
      try {
        const app = getApp();
        const disabled = !!(app.isMerchantDisabled && app.isMerchantDisabled());
        const basicReady = !!(app.hasCompletedBasicStoreSetup && app.hasCompletedBasicStoreSetup());
        this.setData({
          // 未完成基础设置时整栏隐藏（由门店页不再挂载本组件兜底）
          showBizTabs: !disabled && basicReady,
          basicReady
        });
      } catch (err) {
        this.setData({ showBizTabs: false, basicReady: false });
      }
    },

    /** 仅消费「刚开业」标记，不再每次进入商家版都弹 */
    _maybeShowForcedOpenSuccessPromo() {
      if (this.data.openSuccessVisible || this._promoChecking) return;
      let app = null;
      try {
        app = getApp();
      } catch (err) {
        return;
      }
      if (!consumeForcePromoRequest(app)) return;

      this._promoChecking = true;
      canShowOpenSuccessPromo(app, { force: true })
        .then((ok) => {
          if (!ok || this.data.openSuccessVisible) return;
          this._presentOpenSuccessPromo();
        })
        .catch(() => {})
        .finally(() => {
          this._promoChecking = false;
        });
    },

    /** 页面主动唤起（刚开业 / 测试店） */
    showOpenSuccessPromo(options = {}) {
      const force = options.force !== false;
      const allowRepeat = !!options.allowRepeat;
      let app = null;
      try {
        app = getApp();
      } catch (err) {
        return Promise.resolve(false);
      }
      if (allowRepeat) this._promoShownLock = false;
      if (this.data.openSuccessVisible) return Promise.resolve(true);
      return canShowOpenSuccessPromo(app, { force }).then((ok) => {
        if (!ok) return false;
        this._presentOpenSuccessPromo();
        return true;
      });
    },

    _presentOpenSuccessPromo() {
      if (this.data.openSuccessVisible || this._promoShownLock) return;
      this._promoShownLock = true;
      enableStoreShareMenu();
      let guestShareMulti = false;
      try {
        const app = getApp();
        guestShareMulti = shouldOpenGuestSharePicker(app.getShop && app.getShop());
      } catch (err) {
        guestShareMulti = false;
      }
      this.setData({ openSuccessVisible: true, guestShareMulti });
    },

    onShareOpenSuccess() {
      if (!this.data.guestShareMulti) return;
      this.setData({ openSuccessVisible: false });
      this._promoShownLock = false;
      openGuestSharePicker();
    },

    onCloseOpenSuccess() {
      let needOa = false;
      try {
        const app = getApp();
        needOa = !isOaBound(app.globalData && app.globalData.userInfo);
      } catch (err) {
        needOa = false;
      }
      this._promoShownLock = false;
      this.setData({
        openSuccessVisible: false,
        oaFollowSheetVisible: needOa
      });
      this.triggerEvent('opensuccessclose');
    },

    onContinueAdvancedSettings() {
      this.setData({ openSuccessVisible: false });
      this._promoShownLock = false;
      let app = null;
      try {
        app = getApp();
      } catch (err) {
        app = null;
      }
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      if (cur && cur.route === 'pages/merchant/tab-store/tab-store') {
        if (typeof cur.setData === 'function') {
          cur.setData({ settingsTab: 'boarding', moduleSubTab: 'advanced', activeServiceTab: 'boarding' });
        }
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
        return;
      }
      if (app && app.globalData) {
        app.globalData.storeSettingsTab = 'advanced';
      }
      wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
    },

    onCloseOaFollowSheet() {
      this.setData({ oaFollowSheetVisible: false });
    },

    onOaFollowSheetFollowed() {},

    onTabDaily() {
      if (!this.data.showBizTabs || !this.data.basicReady) {
        wx.showToast({ title: '请先完成基础设置', icon: 'none' });
        if (this.data.active !== 'store') {
          wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
        }
        return;
      }
      if (this.data.active === 'daily') return;
      wx.redirectTo({ url: '/pages/merchant/tab-daily/tab-daily' });
    },
    onTabStatistics() {
      if (!this.data.showBizTabs || !this.data.basicReady) {
        wx.showToast({ title: '请先完成基础设置', icon: 'none' });
        if (this.data.active !== 'store') {
          wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
        }
        return;
      }
      if (this.data.active === 'statistics') return;
      wx.redirectTo({ url: '/pages/merchant/tab-statistics/tab-statistics' });
    },
    onTabStore() {
      if (this.data.active === 'store') return;
      wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
    }
  }
});
