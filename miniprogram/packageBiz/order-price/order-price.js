const app = getApp();
const { parseFee, buildFeePayload, normalizeOrderFees } = require('../../utils/orderFees');
const { formatPickupLegs, formatPickupTripType } = require('../utils/pickupInfo');
const { formatOrderCreateTime } = require('../../utils/util');

Page({
  data: {
    order: {},
    boardingFeeInput: '',
    shippingFeeInput: '0',
    washFeeInput: '0',
    valueAddedFeeInput: '0',
    boardingFeeText: '0',
    shippingFeeText: '0',
    washFeeText: '0',
    valueAddedFeeText: '0',
    totalFeeText: '0',
    valueAddedItemsText: '',
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

    if (found.pricePendingConfirm) {
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
    const valueAddedItems = Array.isArray(order.valueAddedServices) ? order.valueAddedServices : [];
    const valueAddedItemsText = valueAddedItems.map((item) => item.name).filter(Boolean).join('、');
    this.setData({
      order,
      boardingFeeInput: String(fees.boardingFee),
      shippingFeeInput: String(fees.shippingFee),
      washFeeInput: String(fees.washFee),
      valueAddedFeeInput: String(fees.valueAddedFee),
      valueAddedItemsText,
      pickupTripTypeText: formatPickupTripType(order),
      pickupLegsText: formatPickupLegs(order),
      pickupTimeText
    });
    this._syncPreview();
  },

  _syncPreview() {
    const { order, boardingFeeInput, shippingFeeInput, washFeeInput, valueAddedFeeInput } = this.data;
    const hasValueAdded = Array.isArray(order.valueAddedServices) && order.valueAddedServices.length > 0;
    const fees = buildFeePayload(
      boardingFeeInput,
      shippingFeeInput,
      order.needPickup,
      washFeeInput,
      order.needWash,
      valueAddedFeeInput,
      hasValueAdded
    );
    this.setData({
      boardingFeeText: fees.boardingFee.toFixed(2),
      shippingFeeText: fees.shippingFee.toFixed(2),
      washFeeText: fees.washFee.toFixed(2),
      valueAddedFeeText: fees.valueAddedFee.toFixed(2),
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

  onWashFeeInput(e) {
    this.setData({ washFeeInput: e.detail.value });
    this._syncPreview();
  },

  onValueAddedFeeInput(e) {
    this.setData({ valueAddedFeeInput: e.detail.value });
    this._syncPreview();
  },

  onSave() {
    const { order, boardingFeeInput, shippingFeeInput, washFeeInput, valueAddedFeeInput } = this.data;
    const boardingFee = parseFee(boardingFeeInput, -1);
    if (boardingFee < 0) {
      wx.showToast({ title: '请输入有效寄养费用', icon: 'none' });
      return;
    }

    if (order.needWash) {
      const washFee = parseFee(washFeeInput, -1);
      if (washFee < 0) {
        wx.showToast({ title: '请输入有效洗护费用', icon: 'none' });
        return;
      }
    }

    const hasValueAdded = Array.isArray(order.valueAddedServices) && order.valueAddedServices.length > 0;
    if (hasValueAdded) {
      const valueAddedFee = parseFee(valueAddedFeeInput, -1);
      if (valueAddedFee < 0) {
        wx.showToast({ title: '请输入有效增值服务费用', icon: 'none' });
        return;
      }
    }

    const shippingFee = order.needPickup ? parseFee(shippingFeeInput, 0) : 0;
    const fees = buildFeePayload(
      boardingFee,
      shippingFee,
      order.needPickup,
      washFeeInput,
      order.needWash,
      valueAddedFeeInput,
      hasValueAdded
    );

    wx.showLoading({ title: '保存中' });
    app.updateOrder(order.id, {
      boardingFee: fees.boardingFee,
      shippingFee: fees.shippingFee,
      washFee: fees.washFee,
      needWash: !!order.needWash,
      valueAddedFee: fees.valueAddedFee,
      valueAddedServices: hasValueAdded ? (order.valueAddedServices || []) : [],
      totalFee: fees.totalFee,
      merchantPriceAdjust: true
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
