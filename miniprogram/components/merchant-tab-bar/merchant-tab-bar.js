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
    oaFollowSheetVisible: false
  },
  lifetimes: {
    attached() {
      this._syncBizTabs();
    }
  },
  pageLifetimes: {
    show() {
      this._syncBizTabs();
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
    },
    onTabGuide() {
      if (this.data.active === 'guide') return;
      wx.redirectTo({ url: '/pages/merchant/tab-guide/tab-guide' });
    }
  }
});
