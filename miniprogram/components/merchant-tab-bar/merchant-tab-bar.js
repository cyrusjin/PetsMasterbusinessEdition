Component({
  properties: {
    active: {
      type: String,
      value: 'daily'
    }
  },
  methods: {
    onTabDaily() {
      if (this.data.active === 'daily') return;
      wx.switchTab({ url: '/pages/merchant/tab-daily/tab-daily' });
    },
    onTabStatistics() {
      if (this.data.active === 'statistics') return;
      wx.switchTab({ url: '/pages/merchant/tab-statistics/tab-statistics' });
    },
    onTabStore() {
      if (this.data.active === 'store') return;
      wx.switchTab({ url: '/pages/merchant/tab-store/tab-store' });
    }
  }
});
