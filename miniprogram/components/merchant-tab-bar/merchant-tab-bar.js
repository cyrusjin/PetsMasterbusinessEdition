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
  methods: {
    onTabDaily() {
      if (this.data.active === 'daily') return;
      wx.redirectTo({ url: '/pages/merchant/tab-daily/tab-daily' });
    },
    onTabStatistics() {
      if (this.data.active === 'statistics') return;
      wx.redirectTo({ url: '/pages/merchant/tab-statistics/tab-statistics' });
    },
    onTabStore() {
      if (this.data.active === 'store') return;
      wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
    }
  }
});
