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
    showBizTabs: false
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
    _syncBizTabs() {
      try {
        const app = getApp();
        const approved = !!(app.isMerchantApproved && app.isMerchantApproved());
        this.setData({ showBizTabs: approved });
      } catch (err) {
        this.setData({ showBizTabs: false });
      }
    },
    onTabDaily() {
      if (!this.data.showBizTabs) return;
      if (this.data.active === 'daily') return;
      wx.redirectTo({ url: '/pages/merchant/tab-daily/tab-daily' });
    },
    onTabStatistics() {
      if (!this.data.showBizTabs) return;
      if (this.data.active === 'statistics') return;
      wx.redirectTo({ url: '/pages/merchant/tab-statistics/tab-statistics' });
    },
    onTabStore() {
      if (this.data.active === 'store') return;
      wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
    }
  }
});
