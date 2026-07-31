const app = getApp();
const merchantDemo = require('../../../utils/merchantDemo');
const { PERIOD_OPTIONS, buildMerchantStatistics } = require('../../../utils/merchantStats');
const { hideHomeButton } = require('../../../utils/navBar');
const { handlePageSecretTap } = require('../../../utils/hiddenAdmin');

Page({
  data: {
    loading: true,
    isDemoMode: false,
    periodKey: 'month',
    periodLabel: '本月',
    periodTabs: PERIOD_OPTIONS,
    summary: {},
    kpis: [],
    composition: {},
    orderStats: {},
    recentOrders: [],
    updatedAt: ''
  },

  onLoad() {
    hideHomeButton();
  },

  onShow() {
    hideHomeButton();
    this._syncTabBar();
    if (app.isUserClientMode && app.isUserClientMode()) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    // 未入驻也保留营收 Tab（体验数据），不强制跳入驻页
    this._loadStats();
  },

  onPullDownRefresh() {
    this._loadStats({ force: true }).finally(() => wx.stopPullDownRefresh());
  },

  onPeriodTab(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.periodKey) return;
    this.setData({ periodKey: key });
    this._applyStats(app.getOrders());
  },

  onGoOrders() {
    wx.navigateTo({ url: '/packageBiz/orders/orders' });
  },

  onGoOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/packageBiz/order-detail/order-detail?id=${id}` });
  },

  onAdminSecretTap() {
    handlePageSecretTap(this);
  },

  _syncTabBar() {},

  onSwitchToUser() {
    if (app.enterUserMode) {
      app.enterUserMode();
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  _loadStats(options = {}) {
    const force = !!(options && options.force);
    const isDemoMode = app.isMerchantDemoMode();
    const cachedOrders = app.getOrders() || [];
    const hasCache = cachedOrders.length > 0;

    // 先用缓存立刻出屏，避免切换 Tab 空白等待
    if (hasCache) {
      this._applyStats(cachedOrders, { isDemoMode, loading: false });
    } else {
      this.setData({ loading: true, isDemoMode });
    }

    if (isDemoMode) {
      merchantDemo.ensureDemoData();
      this._applyStats(app.getOrders(), { isDemoMode, loading: false });
      return Promise.resolve();
    }

    if (!app.canAccessMerchantBackend()) {
      this._applyStats(cachedOrders, { isDemoMode, loading: false });
      return Promise.resolve();
    }

    return app.ensureMerchantStore()
      .then(() => app.loadOrders({ force }))
      .then((orders) => {
        this._applyStats(orders || app.getOrders(), { isDemoMode, loading: false });
      })
      .catch(() => {
        this._applyStats(app.getOrders(), { isDemoMode, loading: false });
      });
  },

  _applyStats(orders, extra = {}) {
    const stats = buildMerchantStatistics(orders, this.data.periodKey);
    const patch = {
      summary: stats.summary,
      kpis: stats.kpis,
      composition: stats.composition,
      orderStats: stats.orderStats,
      recentOrders: stats.recentOrders,
      updatedAt: stats.updatedAt,
      periodLabel: stats.periodLabel
    };
    if (extra.isDemoMode !== undefined) patch.isDemoMode = extra.isDemoMode;
    if (extra.loading !== undefined) patch.loading = extra.loading;
    this.setData(patch);
  }
});
