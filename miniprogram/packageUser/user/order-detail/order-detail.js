const app = getApp();
const badgeUtil = require('../../../utils/badge');
const { normalizeOrderFees } = require('../../../utils/orderFees');
const { loadOrderFeeDetail, buildOrderFeeDetail } = require('../../utils/orderFeeDetail');
const { refreshSingleOrder } = require('../../../utils/orderRefresh');
const { formatOrderStatus } = require('../../../utils/orderStatus');
const {
  canUserCancelOrder,
  canUserEditOrder,
  canShowUserOrderActions
} = require('../../utils/orderActions');
const { attachOrderDisplayNo } = require('../../../utils/displayNo');
const { formatOrderCreateTime } = require('../../../utils/util');

Page({
  data: {
    order: {},
    statusLabel: '--',
    canCancel: false,
    canEdit: false,
    showActions: false,
    feeSummary: {
      boardingFee: 0,
      shippingFee: 0,
      totalFee: 0
    },
    feeDetail: {},
    refreshing: false
  },

  onLoad(opts) {
    this.orderId = opts.id;
    this._loadOrder();
    this._refreshOrder({ force: false });
  },

  onShow() {
    this._loadOrder();
  },

  onPullDownRefresh() {
    this._refreshOrder({ force: true })
      .finally(() => wx.stopPullDownRefresh());
  },

  _refreshOrder({ force } = {}) {
    if (force) this.setData({ refreshing: true });
    return refreshSingleOrder(app, this.orderId, { force })
      .then(() => this._loadOrder())
      .catch((err) => {
        console.error('[订单详情] 刷新失败', err);
        this._loadOrder();
      })
      .finally(() => {
        this.setData({ refreshing: false });
      });
  },

  _loadOrder() {
    const found = attachOrderDisplayNo(app.getOrders().find((o) => o.id === this.orderId));
    if (!found) return;
    const order = {
      ...found,
      createTimeText: formatOrderCreateTime(found)
    };
    const feeSummary = normalizeOrderFees(order);
    const feeDetail = buildOrderFeeDetail(order, app.getStoreBillingRules(), {
      store: app.getCurrentStore()
    });
    const status = order.status;
    this.setData({
      order,
      statusLabel: formatOrderStatus(status),
      canCancel: canUserCancelOrder(status),
      canEdit: canUserEditOrder(status),
      showActions: canShowUserOrderActions(status),
      feeSummary,
      feeDetail
    });
    loadOrderFeeDetail(app, order).then((nextDetail) => {
      if (!nextDetail || !this.orderId || order.id !== this.orderId) return;
      this.setData({ feeDetail: nextDetail });
    });
  },

  onConfirmPrice() {
    const { order } = this.data;
    if (!order.id) return;
    wx.showModal({
      title: '确认改价',
      content: `商家已将订单金额调整为 ¥${this.data.feeSummary.totalFee}，是否确认？`,
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(order.id, { pricePendingConfirm: false })
          .then(() => {
            wx.showToast({ title: '已确认', icon: 'success' });
            badgeUtil.markUserOrdersSeen();
            app.refreshUserBadges();
            this._refreshOrder({ force: true });
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onCancel() {
    wx.showModal({
      title: '取消订单',
      content: '确定取消此订单吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(this.data.order.id, { status: 'cancelled' })
          .then(() => {
            wx.showToast({ title: '已取消', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1000);
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' });
          });
      }
    });
  },

  onEditOrder() {
    wx.navigateTo({ url: `/packageUser/user/order-edit/order-edit?id=${this.data.order.id}` });
  },

  onViewContract() {
    wx.navigateTo({ url: `/packageUser/user/boarding-contract/boarding-contract?orderId=${this.data.order.id}` });
  }
});
