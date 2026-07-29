Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        iconPath: '/images/tab/tab-home.png',
        selectedIconPath: '/images/tab/tab-home-active.png'
      },
      {
        pagePath: '/pages/orders/orders',
        text: '订单',
        iconPath: '/images/tab/tab-order.png',
        selectedIconPath: '/images/tab/tab-order-active.png'
      },
      {
        pagePath: '/pages/daily/daily',
        text: '动态',
        iconPath: '/images/tab/tab-daily.png',
        selectedIconPath: '/images/tab/tab-daily-active.png'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      wx.switchTab({ url: item.pagePath });
      this.setData({ selected: index });
    }
  }
});
