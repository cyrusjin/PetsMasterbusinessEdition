const app = getApp();
const { copyText } = require('../../utils/clipboard');
const badgeUtil = require('../../utils/badge');
const { buildOrderListPetMeta } = require('../../utils/petSnapshot');
const { canMerchantModifyOrder } = require('../utils/orderActions');
const merchantDemo = require('../../utils/merchantDemo');
const { refreshMerchantOrders, startMerchantOrdersPoll, stopMerchantOrdersPoll } = require('../../utils/orderRefresh');
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');
const { buildPendingEditLines, getPendingEditTotalFee } = require('../utils/pendingEdit');

const LIST_PAGE_SIZE = 30;

function filterOrdersByTab(orders, tab) {
  if (tab === 'pending') return orders.filter((o) => o.status === 'pending');
  if (tab === 'awaiting_arrival') return orders.filter((o) => o.status === 'awaiting_arrival');
  if (tab === 'boarding') return orders.filter((o) => o.status === 'boarding');
  if (tab === 'completed') {
    return orders.filter((o) => o.status === 'completed' || o.status === 'cancelled');
  }
  return orders;
}

Page({
  data: {
    tab: 'all',
    orders: [],
    filtered: [],
    hasMore: false,
    loading: true,
    loadError: '',
    pendingBadge: 0,
    refreshing: false
  },

  onLoad(options) {
    const tab = (options && options.tab) ? String(options.tab).trim() : '';
    if (tab) {
      this.setData({ tab });
    }
  },

  onShow() {
    if (redirectToStoreAuthIfNeeded()) return;
    if (app.isMerchantApproved()) {
      if (app.getOrders().length) {
        this.load();
      }
    }
    this._refreshOrders({ force: false, showLoading: !this.data.orders.length });
    startMerchantOrdersPoll(this, () => this._refreshOrders({ force: false, showLoading: false }));
  },

  onHide() {
    stopMerchantOrdersPoll(this);
  },

  onUnload() {
    stopMerchantOrdersPoll(this);
  },

  onPullDownRefresh() {
    this._refreshOrders({ force: true, showLoading: false })
      .finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    const all = this._allFiltered || [];
    const limit = this._listLimit || LIST_PAGE_SIZE;
    if (limit >= all.length) return;
    this._listLimit = limit + LIST_PAGE_SIZE;
    this._publishFilteredWindow();
  },

  _refreshOrders({ force, showLoading } = {}) {
    if (showLoading) {
      this.setData({ loading: true, loadError: '' });
    } else if (force) {
      this.setData({ refreshing: true });
    }

    return refreshMerchantOrders(app, { force })
      .then(() => {
        if (!app.canAccessMerchantBackend()) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return;
        }
        const shop = app.getShop();
        if (!app.isMerchantDemoMode() && (!shop || !shop.store_id)) {
          this.setData({
            loading: false,
            refreshing: false,
            loadError: '请先保存店铺设置后再查看订单'
          });
          return;
        }
        this.load();
      })
      .catch((err) => {
        console.error('[商家订单] 加载失败', err);
        if (app.canAccessMerchantBackend() && app.getOrders().length) {
          this.load();
        }
        this.setData({
          loadError: (err && err.message) || '订单加载失败，请稍后重试'
        });
      })
      .finally(() => {
        this.setData({ loading: false, refreshing: false });
      });
  },

  _publishFilteredWindow(extra = {}) {
    const all = this._allFiltered || [];
    const limit = this._listLimit || LIST_PAGE_SIZE;
    this.setData({
      ...extra,
      filtered: all.slice(0, limit),
      hasMore: all.length > limit
    });
  },

  load() {
    const orders = app.getOrders()
      .sort((a, b) => {
        const aPend = a.editPendingConfirm ? 1 : 0;
        const bPend = b.editPendingConfirm ? 1 : 0;
        if (aPend !== bPend) return bPend - aPend;
        return (b.createTime || 0) - (a.createTime || 0);
      })
      .map((order) => ({
        ...order,
        ...buildOrderListPetMeta(order),
        pendingEditLines: order.editPendingConfirm ? buildPendingEditLines(order) : [],
        pendingEditTotalFee: order.editPendingConfirm ? getPendingEditTotalFee(order) : null
      }));
    this._allFiltered = filterOrdersByTab(orders, this.data.tab);
    this._listLimit = LIST_PAGE_SIZE;
    badgeUtil.countMerchantNewOrders(orders);
    badgeUtil.markMerchantOrdersSeen();
    this._publishFilteredWindow({
      orders,
      pendingBadge: 0,
      loading: false,
      loadError: ''
    });
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
    this.filter();
  },

  filter() {
    this._allFiltered = filterOrdersByTab(this.data.orders || [], this.data.tab);
    this._listLimit = LIST_PAGE_SIZE;
    this._publishFilteredWindow();
  },

  _getOrderById(id) {
    return (app.getOrders() || []).find((o) => (o.id || o.order_id) === id);
  },

  _guardMerchantModify(id) {
    const order = this._getOrderById(id);
    if (!canMerchantModifyOrder(order)) {
      const tip = order && order.editPendingConfirm
        ? '用户改单待确认，请先确认或拒绝'
        : '价格待用户确认，暂不可操作';
      wx.showToast({ title: tip, icon: 'none' });
      return false;
    }
    return true;
  },

  onConfirmUserEdit(e) {
    const id = e.currentTarget.dataset.id;
    const order = this._getOrderById(id);
    if (!order || !order.editPendingConfirm) return;
    const fee = getPendingEditTotalFee(order);
    const feeTip = fee != null ? `，确认后费用为 ¥${fee}` : '';
    wx.showModal({
      title: '确认用户改单',
      content: `确认接受宠主的订单修改吗${feeTip}？确认后修改将立即生效。`,
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { editPendingConfirm: false })
          .then(() => {
            wx.showToast({ title: '已确认修改', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onRejectUserEdit(e) {
    const id = e.currentTarget.dataset.id;
    const order = this._getOrderById(id);
    if (!order || !order.editPendingConfirm) return;
    wx.showModal({
      title: '拒绝用户改单',
      content: '拒绝后订单将保持原信息不变，确定拒绝吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { rejectUserEdit: true })
          .then(() => {
            wx.showToast({ title: '已拒绝修改', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onAccept(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    wx.showModal({
      title: '确认接单',
      content: '确认接收此寄养预约吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { status: 'awaiting_arrival' })
          .then((order) => {
            if (!order) return;
            wx.showToast({ title: '已确认接单', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onConfirmArrival(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    const order = this._getOrderById(id);
    const needPickupFlag = order && order.needPickup && order.pickupIncludeOutbound !== false && !order.pickupOutboundDone;
    wx.showModal({
      title: needPickupFlag ? '确认接宠到店' : '确认到店',
      content: needPickupFlag
        ? '确认已从宠主处接到宠物并送达店铺？'
        : '确认宠物已到店，开始寄养服务吗？',
      success: (r) => {
        if (!r.confirm) return;
        const updates = { status: 'boarding' };
        if (needPickupFlag) updates.pickupOutboundDone = true;
        app.updateOrder(id, updates)
          .then(() => {
            wx.showToast({ title: '已确认到店', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    wx.showModal({
      title: '拒绝预约',
      content: '确定拒绝此预约吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { status: 'cancelled' })
          .then(() => {
            wx.showToast({ title: '已拒绝', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onComplete(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    wx.showModal({
      title: '结束寄养',
      content: '确认结束寄养服务吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { status: 'completed' })
          .then(() => {
            wx.showToast({ title: '已完成', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onDetail(e) {
    wx.navigateTo({ url: '/packageBiz/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },

  onEditPrice(e) {
    const id = e.currentTarget.dataset.id;
    const order = this._getOrderById(id);
    if (order && order.pricePendingConfirm) {
      wx.showToast({ title: '价格待用户确认，暂不可改价', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/packageBiz/order-price/order-price?id=' + id });
  },

  onCopyOrderNo(e) {
    copyText(e.currentTarget.dataset.no, '已复制订单号');
  }
});
