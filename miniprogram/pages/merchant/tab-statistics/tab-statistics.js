const app = getApp();
const merchantDemo = require('../../../utils/merchantDemo');
const { PERIOD_OPTIONS, buildMerchantStatistics } = require('../../../utils/merchantStats');
const ledgerApi = require('../../../utils/ledger');
const { hideHomeButton } = require('../../../utils/navBar');
const { handlePageSecretTap } = require('../../../utils/hiddenAdmin');
const { redirectToStoreAuthIfNeeded } = require('../../../utils/shell');

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
    ledger: {},
    orderStats: {},
    recentOrders: [],
    updatedAt: '',
    ledgerEntries: []
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
    // 未入驻不再展示演示营收，统一回门店授权
    if (redirectToStoreAuthIfNeeded()) return;
    this._loadStats();
  },

  onPullDownRefresh() {
    this._loadStats({ force: true }).finally(() => wx.stopPullDownRefresh());
  },

  onPeriodTab(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.periodKey) return;
    this.setData({ periodKey: key });
    this._applyStats(app.getOrders(), this.data.ledgerEntries);
  },

  onGoOrders() {
    wx.navigateTo({ url: '/packageBiz/orders/orders' });
  },

  onGoLedger() {
    wx.navigateTo({ url: '/packageExtra/ledger/ledger' });
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

  _loadLedger(force) {
    return ledgerApi.fetchLedgerEntries(app, { force })
      .catch((err) => {
        console.warn('[营收统计] 加载记账失败', err);
        return ledgerApi.getLocalEntries(!!(app.isMerchantDemoMode && app.isMerchantDemoMode()));
      });
  },

  _loadStats(options = {}) {
    const force = !!(options && options.force);
    const isDemoMode = app.isMerchantDemoMode();
    const cachedOrders = app.getOrders() || [];
    const hasCache = cachedOrders.length > 0;
    const cachedLedger = this.data.ledgerEntries || [];

    // 先用缓存立刻出屏，避免切换 Tab 空白等待
    if (hasCache || cachedLedger.length) {
      this._applyStats(cachedOrders, cachedLedger, { isDemoMode, loading: false });
    } else {
      this.setData({ loading: true, isDemoMode });
    }

    if (isDemoMode) {
      merchantDemo.ensureDemoData();
      return this._loadLedger(force).then((entries) => {
        this._applyStats(app.getOrders(), entries, { isDemoMode, loading: false });
      });
    }

    if (!app.canAccessMerchantBackend()) {
      this._applyStats(cachedOrders, cachedLedger, { isDemoMode, loading: false });
      return Promise.resolve();
    }

    return app.ensureMerchantStore()
      .then(() => Promise.all([
        app.loadOrders({ force }),
        this._loadLedger(force)
      ]))
      .then(([orders, entries]) => {
        this._applyStats(orders || app.getOrders(), entries, { isDemoMode, loading: false });
      })
      .catch(() => {
        this._applyStats(app.getOrders(), this.data.ledgerEntries, { isDemoMode, loading: false });
      });
  },

  _applyStats(orders, ledgerEntries, extra = {}) {
    const entries = Array.isArray(ledgerEntries) ? ledgerEntries : [];
    const stats = buildMerchantStatistics(orders, this.data.periodKey, entries);
    const patch = {
      ledgerEntries: entries,
      summary: stats.summary,
      kpis: stats.kpis,
      composition: stats.composition,
      ledger: stats.ledger,
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
