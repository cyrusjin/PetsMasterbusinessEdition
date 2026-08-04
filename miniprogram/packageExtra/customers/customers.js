const app = getApp();
const { buildCustomersFromOrders, filterCustomers } = require('../utils/customers');
const { refreshMerchantOrders } = require('../../utils/orderRefresh');
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');

Page({
  data: {
    loading: true,
    keyword: '',
    allCustomers: [],
    customers: []
  },

  onShow() {
    if (redirectToStoreAuthIfNeeded()) return;
    this._loadCustomers({ force: false, showLoading: !this.data.allCustomers.length });
  },

  onPullDownRefresh() {
    this._loadCustomers({ force: true, showLoading: false })
      .finally(() => wx.stopPullDownRefresh());
  },

  _applyFilter(allCustomers, keyword) {
    const list = Array.isArray(allCustomers) ? allCustomers : [];
    const kw = keyword == null ? this.data.keyword : keyword;
    this.setData({
      allCustomers: list,
      customers: filterCustomers(list, kw)
    });
  },

  _loadCustomers({ force, showLoading } = {}) {
    if (showLoading) {
      this.setData({ loading: true });
    }
    return refreshMerchantOrders(app, { force })
      .then(() => {
        if (!app.canAccessMerchantBackend() && !app.isMerchantDemoMode()) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return;
        }
        this._applyFilter(buildCustomersFromOrders(app.getOrders()));
      })
      .catch((err) => {
        console.error('[客户管理] 加载失败', err);
        if (app.getOrders().length) {
          this._applyFilter(buildCustomersFromOrders(app.getOrders()));
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

  onSearchInput(e) {
    const keyword = (e.detail && e.detail.value) || '';
    this.setData({ keyword });
    this._applyFilter(this.data.allCustomers, keyword);
  },

  onSearchConfirm(e) {
    const keyword = (e.detail && e.detail.value) || this.data.keyword || '';
    this.setData({ keyword });
    this._applyFilter(this.data.allCustomers, keyword);
  },

  onClearSearch() {
    this.setData({ keyword: '' });
    this._applyFilter(this.data.allCustomers, '');
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/packageExtra/customer-detail/customer-detail?id=${encodeURIComponent(id)}`
    });
  }
});
