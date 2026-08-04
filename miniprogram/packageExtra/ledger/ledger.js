const app = getApp();
const ledgerApi = require('../../utils/ledger');
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');

Page({
  data: {
    loading: true,
    monthKey: '',
    monthLabel: '',
    typeFilter: 'all',
    typeTabs: [
      { key: 'all', label: '全部' },
      { key: 'expense', label: '支出' },
      { key: 'income', label: '额外收入' }
    ],
    allEntries: [],
    entries: [],
    summary: {
      expense: '0',
      income: '0',
      net: '0'
    },
    isDemoMode: false
  },

  onLoad() {
    const monthKey = ledgerApi.currentMonthKey();
    this.setData({
      monthKey,
      monthLabel: ledgerApi.formatMonthLabel(monthKey)
    });
  },

  onShow() {
    if (redirectToStoreAuthIfNeeded()) return;
    if (!this.data.monthKey) {
      const monthKey = ledgerApi.currentMonthKey();
      this.setData({
        monthKey,
        monthLabel: ledgerApi.formatMonthLabel(monthKey)
      });
    }
    this._load({ showLoading: !this.data.allEntries.length });
  },

  onPullDownRefresh() {
    this._load({ force: true, showLoading: false })
      .finally(() => wx.stopPullDownRefresh());
  },

  _applyList(allEntries, options = {}) {
    const typeFilter = options.typeFilter || this.data.typeFilter;
    const monthKey = options.monthKey || this.data.monthKey || ledgerApi.currentMonthKey();
    const monthEntries = ledgerApi.filterEntriesByMonth(allEntries, monthKey);
    const list = ledgerApi.filterEntries(allEntries, typeFilter, monthKey)
      .map(ledgerApi.decorateEntry)
      .filter(Boolean);
    const sums = ledgerApi.summarizeEntries(monthEntries, 'all');
    this.setData({
      allEntries,
      entries: list,
      typeFilter,
      monthKey,
      monthLabel: ledgerApi.formatMonthLabel(monthKey),
      summary: {
        expense: ledgerApi.formatAmount(sums.expense),
        income: ledgerApi.formatAmount(sums.income),
        net: ledgerApi.formatAmount(sums.net)
      }
    });
  },

  _load({ force, showLoading } = {}) {
    if (showLoading) this.setData({ loading: true });
    const isDemoMode = !!(app.isMerchantDemoMode && app.isMerchantDemoMode());
    this.setData({ isDemoMode });

    return Promise.resolve()
      .then(() => {
        if (!app.canAccessMerchantBackend() && !isDemoMode) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return null;
        }
        if (isDemoMode) return ledgerApi.fetchLedgerEntries(app, { force });
        return app.ensureMerchantStore()
          .then(() => ledgerApi.fetchLedgerEntries(app, { force }));
      })
      .then((entries) => {
        if (!entries) return;
        this._applyList(entries);
      })
      .catch((err) => {
        console.error('[记账本] 加载失败', err);
        const cached = ledgerApi.getLocalEntries(isDemoMode);
        if (cached.length) {
          this._applyList(cached);
        } else {
          wx.showToast({
            title: (err && err.message) || '加载失败',
            icon: 'none'
          });
        }
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  onMonthChange(e) {
    const monthKey = (e.detail && e.detail.value) || ledgerApi.currentMonthKey();
    if (monthKey === this.data.monthKey) return;
    this._applyList(this.data.allEntries, { monthKey });
  },

  onTypeTab(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.typeFilter) return;
    this._applyList(this.data.allEntries, { typeFilter: key });
  },

  onAddExpense() {
    wx.navigateTo({ url: '/packageExtra/ledger/ledger-edit?type=expense' });
  },

  onAddIncome() {
    wx.navigateTo({ url: '/packageExtra/ledger/ledger-edit?type=income' });
  },

  onOpenEdit(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/packageExtra/ledger/ledger-edit?id=${encodeURIComponent(id)}`
    });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const label = e.currentTarget.dataset.label || '该记录';
    if (!id) return;
    wx.showModal({
      title: '删除记账',
      content: `确定删除「${label}」吗？`,
      confirmColor: '#E53935',
      confirmText: '删除',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        ledgerApi.removeEntry(app, id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            return this._load({ force: true, showLoading: false });
          })
          .catch((err) => {
            wx.showToast({
              title: (err && err.message) || '删除失败',
              icon: 'none'
            });
          })
          .finally(() => wx.hideLoading());
      }
    });
  }
});
