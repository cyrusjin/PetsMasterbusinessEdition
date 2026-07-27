const app = getApp();
const { parseFee, buildFeePayload, normalizeOrderFees } = require('../../../utils/orderFees');
const { formatPickupLegs, formatPickupTripType } = require('../../../utils/pickupInfo');
const { canMerchantModifyOrder } = require('../../../utils/orderActions');
const { formatOrderCreateTime } = require('../../../utils/util');

Page({
  data: {
    order: {},
    boardingFeeInput: '',
    shippingFeeInput: '0',
    boardingFeeText: '0',
    shippingFeeText: '0',
    totalFeeText: '0',
    pickupTripTypeText: '',
    pickupLegsText: '',
    pickupTimeText: ''
  },

  onLoad(options) {
    this.orderId = options.id || '';
    this._loadOrder();
  },

  onShow() {
    if (this.orderId) this._loadOrder();
  },

  _loadOrder() {
    const found = app.getOrders().find((item) => item.id === this.orderId);
    if (!found) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    if (!['pending', 'awaiting_arrival', 'boarding', 'confirmed'].includes(found.status)) {
      wx.showToast({ title: '当前状态不可改价', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    if (!canMerchantModifyOrder(found)) {
      wx.showToast({ title: '价格待用户确认，暂不可改价', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const order = {
      ...found,
      createTimeText: formatOrderCreateTime(found)
    };
    const fees = normalizeOrderFees(order);
    const pickupTimeText = order.needPickup
      ? `${order.startDate || ''} ${order.pickupTime || order.startTime || ''}`.trim()
      : '';
    this.setData({
      order,
      boardingFeeInput: String(fees.boardingFee),
      shippingFeeInput: String(fees.shippingFee),
      pickupTripTypeText: formatPickupTripType(order),
      pickupLegsText: formatPickupLegs(order),
      pickupTimeText
    });
    this._syncPreview();
  },

  _syncPreview() {
    const { order, boardingFeeInput, shippingFeeInput } = this.data;
    const fees = buildFeePayload(boardingFeeInput, shippingFeeInput, order.needPickup);
    this.setData({
      boardingFeeText: fees.boardingFee.toFixed(2),
      shippingFeeText: fees.shippingFee.toFixed(2),
      totalFeeText: fees.totalFee.toFixed(2)
    });
  },

  onBoardingFeeInput(e) {
    this.setData({ boardingFeeInput: e.detail.value });
    this._syncPreview();
  },

  onShippingFeeInput(e) {
    this.setData({ shippingFeeInput: e.detail.value });
    this._syncPreview();
  },

  onSave() {
    const { order, boardingFeeInput, shippingFeeInput } = this.data;
    const boardingFee = parseFee(boardingFeeInput, -1);
    if (boardingFee < 0) {
      wx.showToast({ title: '请输入有效寄养费用', icon: 'none' });
      return;
    }

    const shippingFee = order.needPickup ? parseFee(shippingFeeInput, 0) : 0;
    const fees = buildFeePayload(boardingFee, shippingFee, order.needPickup);

    wx.showLoading({ title: '保存中' });
    app.updateOrder(order.id, {
      boardingFee: fees.boardingFee,
      shippingFee: fees.shippingFee,
      totalFee: fees.totalFee
    })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none'
        });
      });
  }
});
