const { readCachedAuditMode } = require('../utils/merchantSwitch');

const USER_TABS = [
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
];

function getCurrentAuditMode() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData && typeof app.globalData.auditMode === 'boolean') {
      return app.globalData.auditMode;
    }
  } catch (err) {
    // fall through
  }
  const cached = readCachedAuditMode();
  // 远程状态未确认前不展示受审核控制的栏目。
  return cached === null ? true : cached;
}

Component({
  data: {
    selected: 0,
    hidden: false,
    // 审核状态未确认前按审核态处理，避免首屏短暂闪出“动态”。
    list: USER_TABS.slice(0, 2)
  },

  lifetimes: {
    attached() {
      this.syncAuditMode(getCurrentAuditMode());
    }
  },

  pageLifetimes: {
    show() {
      this.syncAuditMode(getCurrentAuditMode());
    }
  },

  methods: {
    syncAuditMode(auditMode) {
      const nextList = auditMode ? USER_TABS.slice(0, 2) : USER_TABS;
      const currentList = this.data.list || [];
      if (currentList.length === nextList.length) return;
      this.setData({ list: nextList });
    },

    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      wx.switchTab({ url: item.pagePath });
      this.setData({ selected: index });
    }
  }
});
