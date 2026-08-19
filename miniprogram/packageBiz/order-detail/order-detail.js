const app = getApp();
const { normalizeOrderFees } = require('../../utils/orderFees');
const { buildPetDetailView } = require('../../utils/petSnapshot');
const { formatPickupLegs } = require('../utils/pickupInfo');
const { formatPickupProgress } = require('../../utils/pickupManage');
const { loadOrderFeeDetail, buildOrderFeeDetail } = require('../utils/orderFeeDetail');
const { exportAndShareOrderDetail } = require('../utils/orderDetailExport');
const { resolveImageUrl } = require('../../utils/imageCache');
const { refreshSingleOrder } = require('../../utils/orderRefresh');
const { canMerchantModifyOrder } = require('../utils/orderActions');
const { attachOrderDisplayNo } = require('../../utils/displayNo');
const { formatOrderCreateTime } = require('../../utils/util');
const { buildPendingEditLines, getPendingEditTotalFee } = require('../utils/pendingEdit');
const { attachVisitAddressFields } = require('../../utils/homeVisitAddress');
const {
  isDailyCheckableOrder,
  formatServiceStatus,
  getCompleteServiceCopy
} = require('../../utils/dailyCheckable');
const { canShareProxyOrder, buildProxyShareConfig } = require('../../utils/proxyOrder');
const { prefetchStoreShareImage, resolveShareImageUrl } = require('../../utils/storeShare');

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
    pendingEditLines: [],
    pendingEditTotalFee: null,
    exporting: false,
    refreshing: false,
    canMerchantOperate: true,
    canDailyCheck: false,
    canShareProxy: false,
    completeActionLabel: '结束寄养'
  },

  onLoad(opts) {
    this.orderId = opts.id;
    prefetchStoreShareImage(app.getShop());
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
    const order = attachVisitAddressFields({
      ...found,
      createTimeText: formatOrderCreateTime(found)
    });
    const fees = normalizeOrderFees(order);
    const petView = buildPetDetailView(order.petSnapshot, order);
    const statusLabel = formatServiceStatus(order);
    const feeDetail = buildOrderFeeDetail(order, app.getStoreBillingRules(), {
      store: app.getCurrentStore()
    });
    this.setData({
      order,
      petView,
      statusLabel,
      canDailyCheck: isDailyCheckableOrder(order),
      completeActionLabel: getCompleteServiceCopy(order).button,
      pickupLegsText: formatPickupLegs(order),
      pickupProgressText: formatPickupProgress(order),
      valueAddedServicesText: Array.isArray(order.valueAddedServices) && order.valueAddedServices.length
        ? order.valueAddedServices.map((item) => {
          const name = (item && item.name) || '增值服务';
          const price = item && item.price != null ? item.price : '';
          return price !== '' ? `${name}（¥${price}）` : name;
        }).join('、')
        : '',
      feeSummary: fees,
      feeDetail,
      pendingEditLines: order.editPendingConfirm ? buildPendingEditLines(order) : [],
      pendingEditTotalFee: order.editPendingConfirm ? getPendingEditTotalFee(order) : null,
      canMerchantOperate: canMerchantModifyOrder(order),
      canShareProxy: canShareProxyOrder(order)
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

  onGoDailyCheck() {
    const order = this.data.order;
    if (!order || !order.id) return;
    wx.navigateTo({ url: '/packageBiz/daily-check/daily-check?orderId=' + order.id });
  },

  onGoContract() {
    const order = this.data.order;
    if (!order || !order.id) return;
    wx.navigateTo({ url: `/packageContract/boarding-contract/boarding-contract?orderId=${order.id}` });
  },

  onEditPrice() {
    const order = this.data.order;
    if (!order || !order.id) return;
    if (order.pricePendingConfirm) {
      wx.showToast({ title: '价格待用户确认，暂不可改价', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/packageBiz/order-price/order-price?id=${order.id}` });
  },

  onConfirmUserEdit() {
    const order = this.data.order;
    if (!order || !order.id || !order.editPendingConfirm) return;
    const fee = this.data.pendingEditTotalFee;
    const feeTip = fee != null ? `，确认后费用为 ¥${fee}` : '';
    wx.showModal({
      title: '确认用户改单',
      content: `确认接受宠主的订单修改吗${feeTip}？确认后修改将立即生效。`,
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(order.id, { editPendingConfirm: false })
          .then(() => {
            wx.showToast({ title: '已确认修改', icon: 'success' });
            this._refreshOrder({ force: true });
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onRejectUserEdit() {
    const order = this.data.order;
    if (!order || !order.id || !order.editPendingConfirm) return;
    wx.showModal({
      title: '拒绝用户改单',
      content: '拒绝后订单将保持原信息不变，确定拒绝吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(order.id, { rejectUserEdit: true })
          .then(() => {
            wx.showToast({ title: '已拒绝修改', icon: 'success' });
            this._refreshOrder({ force: true });
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onComplete() {
    const order = this.data.order;
    if (!order || !order.id) return;
    if (!canMerchantModifyOrder(order)) {
      wx.showToast({
        title: order.editPendingConfirm ? '请先确认或拒绝用户改单' : '价格待用户确认，暂不可操作',
        icon: 'none'
      });
      return;
    }
    const copy = getCompleteServiceCopy(order);
    wx.showModal({
      title: copy.title,
      content: copy.content,
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
  },

  onShareAppMessage() {
    const order = this.data.order || {};
    if (canShareProxyOrder(order)) {
      return buildProxyShareConfig({
        shop: app.getShop(),
        storeId: order.store_id,
        token: order.proxyClaimToken,
        petName: order.petName
      });
    }
    return {
      title: (order.petName ? `${order.petName}的预约` : '订单详情'),
      path: `packageBiz/order-detail/order-detail?id=${encodeURIComponent(order.id || '')}`,
      imageUrl: resolveShareImageUrl(app.getShop())
    };
  }
});
