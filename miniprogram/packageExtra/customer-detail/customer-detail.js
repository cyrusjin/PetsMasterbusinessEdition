const app = getApp();
const { findCustomerById, listCustomerOrders } = require('../utils/customers');
const { refreshMerchantOrders } = require('../../utils/orderRefresh');
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');

Page({
  data: {
    loading: true,
    customerId: '',
    customer: null,
    orders: [],
    expandedPetKey: ''
  },

  onLoad(options) {
    const customerId = decodeURIComponent(String((options && options.id) || '').trim());
    this.setData({ customerId });
  },

  onShow() {
    if (redirectToStoreAuthIfNeeded()) return;
    this._loadCustomer({ force: false, showLoading: !this.data.customer });
  },

  onPullDownRefresh() {
    this._loadCustomer({ force: true, showLoading: false })
      .finally(() => wx.stopPullDownRefresh());
  },

  _publishCustomer(orders) {
    const customerId = this.data.customerId;
    const customer = findCustomerById(orders, customerId);
    const historyOrders = customer ? listCustomerOrders(orders, customerId) : [];
    this.setData({
      customer,
      orders: historyOrders
    });
    if (customer) {
      wx.setNavigationBarTitle({ title: customer.name || '客户详情' });
    }
  },

  _loadCustomer({ force, showLoading } = {}) {
    const customerId = this.data.customerId;
    if (!customerId) {
      this.setData({ loading: false, customer: null, orders: [] });
      return Promise.resolve();
    }
    if (showLoading) {
      this.setData({ loading: true });
    }
    return refreshMerchantOrders(app, { force })
      .then(() => {
        this._publishCustomer(app.getOrders());
      })
      .catch((err) => {
        console.error('[客户详情] 加载失败', err);
        if (app.getOrders().length) {
          this._publishCustomer(app.getOrders());
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

  onCall() {
    const phone = this.data.customer && this.data.customer.phone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onTogglePet(e) {
    const key = e.currentTarget.dataset.key || '';
    this.setData({
      expandedPetKey: this.data.expandedPetKey === key ? '' : key
    });
  },

  onOpenOrder(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/packageBiz/order-detail/order-detail?id=${id}`
    });
  }
});
