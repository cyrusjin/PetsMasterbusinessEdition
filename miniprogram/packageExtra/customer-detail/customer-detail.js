const app = getApp();
const { findCustomerById, listCustomerOrders } = require('../utils/customers');
const { refreshMerchantOrders } = require('../../utils/orderRefresh');
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');
const { listCustomerTags, updateCustomerTags } = require('../../utils/growth');

Page({
  data: {
    loading: true,
    customerId: '',
    customer: null,
    orders: [],
    expandedPetKey: '',
    tagMap: {},
    tagSaving: false
  },

  onLoad(options) {
    const customerId = decodeURIComponent(String((options && options.id) || '').trim());
    this.setData({ customerId });
  },

  onShow() {
    if (redirectToStoreAuthIfNeeded()) return;
    this._loadCustomer({ force: false, showLoading: !this.data.customer });
    this._loadTags();
  },

  onPullDownRefresh() {
    this._loadCustomer({ force: true, showLoading: false })
      .finally(() => wx.stopPullDownRefresh());
  },

  _publishCustomer(orders) {
    const customerId = this.data.customerId;
    const customer = findCustomerById(orders, customerId);
    const historyOrders = customer ? listCustomerOrders(orders, customerId) : [];
    const tagged = customer ? { ...customer, tags: (this.data.tagMap && this.data.tagMap[customer.id] && this.data.tagMap[customer.id].tags) || [], customerNote: (this.data.tagMap && this.data.tagMap[customer.id] && this.data.tagMap[customer.id].note) || '' } : customer;
    this.setData({
      customer: tagged,
      orders: historyOrders
    });
    if (customer) {
      wx.setNavigationBarTitle({ title: customer.name || '客户详情' });
    }
  },

  _storeId() {
    return String((app.getShop && app.getShop() && app.getShop().store_id) || (app.globalData && app.globalData.merchantStoreId) || '').trim();
  },

  _loadTags() {
    const storeId = this._storeId();
    if (!storeId || this._tagLoading) return;
    this._tagLoading = true;
    listCustomerTags(storeId).then((res) => {
      const tagMap = (res && res.success && res.tags) || {};
      this.setData({ tagMap });
      if (this.data.customer) this._publishCustomer(app.getOrders());
    }).catch(() => {}).finally(() => { this._tagLoading = false; });
  },

  onEditTags() {
    const customer = this.data.customer;
    const storeId = this._storeId();
    if (!customer || !storeId || this.data.tagSaving) return;
    wx.showModal({
      title: '编辑客户标签',
      editable: true,
      placeholderText: '例如：重点客户,多宠家庭',
      content: (customer.customTags || customer.tags || []).join(','),
      success: (res) => {
        if (!res.confirm) return;
        const tags = String(res.content || '').split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
        this.setData({ tagSaving: true });
        updateCustomerTags(storeId, customer.id, tags).then((result) => {
          if (!result || !result.success) throw new Error((result && result.errMsg) || '保存失败');
          const tagMap = { ...(this.data.tagMap || {}), [customer.id]: result.data || { tags } };
          this.setData({ tagMap });
          this._publishCustomer(app.getOrders());
          wx.showToast({ title: '标签已保存', icon: 'success' });
        }).catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' })).finally(() => this.setData({ tagSaving: false }));
      }
    });
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
