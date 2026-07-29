const app = getApp();
const { normalizeOrderFees } = require('../../utils/orderFees');
const { buildPetDetailView } = require('../../utils/petSnapshot');
const { formatOrderStatus } = require('../utils/orderDetailView');
const { formatPickupLegs } = require('../utils/pickupInfo');
const { formatPickupProgress } = require('../../utils/pickupManage');
const { loadOrderFeeDetail, buildOrderFeeDetail } = require('../utils/orderFeeDetail');
const { exportAndShareOrderDetail } = require('../utils/orderDetailExport');
const { resolveImageUrl } = require('../../utils/imageCache');
const { refreshSingleOrder } = require('../../utils/orderRefresh');
const { canMerchantModifyOrder } = require('../utils/orderActions');
const { attachOrderDisplayNo } = require('../../utils/displayNo');
const { formatOrderCreateTime } = require('../../utils/util');

Page({
  data: {
    order: {},
    petView: {},
    statusLabel: '--',
    feeSummary: {
      boardingFee: 0,
      shippingFee: 0,
      totalFee: 0
    },
    pickupLegsText: '',
    pickupProgressText: '',
    feeDetail: {},
    exporting: false,
    refreshing: false,
    canMerchantOperate: true
  },

  onLoad(opts) {
    this.orderId = opts.id;
    this._loadOrder();
    this._refreshOrder({ force: false });
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
        console.error('[商家订单详情] 刷新失败', err);
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
    const fees = normalizeOrderFees(order);
    const petView = buildPetDetailView(order.petSnapshot, order);
    const statusLabel = formatOrderStatus(order.status);
    const feeDetail = buildOrderFeeDetail(order, app.getStoreBillingRules(), {
      store: app.getCurrentStore()
    });
    this.setData({
      order,
      petView,
      statusLabel,
      pickupLegsText: formatPickupLegs(order),
      pickupProgressText: formatPickupProgress(order),
      feeSummary: fees,
      feeDetail,
      canMerchantOperate: canMerchantModifyOrder(order)
    });
    this._resolvePetPhoto(petView.photo);
    loadOrderFeeDetail(app, order).then((nextDetail) => {
      if (!nextDetail || !this.orderId || order.id !== this.orderId) return;
      this.setData({ feeDetail: nextDetail });
    });
  },

  _resolvePetPhoto(photo) {
    if (!photo) return;
    resolveImageUrl(photo).then((displayPhoto) => {
      if (!displayPhoto || displayPhoto === this.data.petView.photo) return;
      this.setData({
        petView: {
          ...this.data.petView,
          photo: displayPhoto
        }
      });
    }).catch(() => {});
  },

  onGoDaily() {
    const order = this.data.order;
    if (!order || !order.id) return;
    wx.navigateTo({ url: '/packageBiz/daily-logs/daily-logs?orderId=' + order.id });
  },

  onGoContract() {
    const order = this.data.order;
    if (!order || !order.id) return;
    wx.navigateTo({ url: `/packageContract/boarding-contract/boarding-contract?orderId=${order.id}` });
  },

  onEditPrice() {
    const order = this.data.order;
    if (!order || !order.id) return;
    if (!canMerchantModifyOrder(order)) {
      wx.showToast({ title: '价格待用户确认，暂不可改价', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/packageBiz/order-price/order-price?id=${order.id}` });
  },

  onComplete() {
    const order = this.data.order;
    if (!order || !order.id) return;
    if (!canMerchantModifyOrder(order)) {
      wx.showToast({ title: '价格待用户确认，暂不可操作', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '结束寄养',
      content: '确认结束寄养服务吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(order.id, { status: 'completed' })
          .then(() => {
            wx.showToast({ title: '已完成', icon: 'success' });
            this._refreshOrder({ force: true });
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onExportShare() {
    if (this.data.exporting || !this.data.order.id) return;
    const petView = buildPetDetailView(this.data.order.petSnapshot, this.data.order);
    this.setData({ exporting: true });
    wx.showLoading({ title: '生成中', mask: true });
    exportAndShareOrderDetail(this, {
      order: this.data.order,
      petView,
      feeSummary: this.data.feeSummary,
      feeDetail: this.data.feeDetail
    })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '请选择好友发送', icon: 'none' });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '导出失败',
          icon: 'none',
          duration: 3000
        });
      })
      .finally(() => {
        this.setData({ exporting: false });
      });
  }
});
