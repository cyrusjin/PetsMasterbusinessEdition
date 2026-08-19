const app = getApp();
const { parseFee, buildFeePayload, normalizeOrderFees } = require('../../utils/orderFees');
const { formatPickupLegs, formatPickupTripType } = require('../utils/pickupInfo');
const { formatOrderCreateTime } = require('../../utils/util');
const { formatHomeVisitTimeText } = require('../../utils/homeVisitAddress');
const { getOrderServiceKind, getOrderServiceLabel } = require('../../utils/dailyCheckable');

function getServiceTimeLabel(kind) {
  if (kind === 'homeFeeding') return '上门时间';
  if (kind === 'wash') return '到店时间';
  return '寄养时间';
}

function getServiceTimeText(order, kind) {
  if (kind === 'homeFeeding') return formatHomeVisitTimeText(order) || '--';
  if (kind === 'wash') {
    return `${order.startDate || ''} ${order.startTime || ''}`.trim() || '--';
  }
  const start = order.startDate || '';
  const end = order.endDate || '';
  if (start && end && start !== end) return `${start} ~ ${end}`;
  return start || end || '--';
}

function getMainFeeLabel(kind) {
  if (kind === 'homeFeeding') return '上门喂养费';
  if (kind === 'wash') return '洗护费用';
  return '寄养费用';
}

Page({
  data: {
    order: {},
    serviceKind: 'boarding',
    serviceLabel: '到店寄养',
    serviceTimeLabel: '寄养时间',
    serviceTimeText: '',
    mainFeeLabel: '寄养费用',
    showBoardingFee: true,
    showVisitFee: false,
    showWashFee: false,
    boardingFeeInput: '',
    visitFeeInput: '',
    shippingFeeInput: '0',
    washFeeInput: '0',
    valueAddedFeeInput: '0',
    boardingFeeText: '0',
    visitFeeText: '0',
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

    const serviceKind = getOrderServiceKind(found);
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
      serviceKind,
      serviceLabel: getOrderServiceLabel(serviceKind),
      serviceTimeLabel: getServiceTimeLabel(serviceKind),
      serviceTimeText: getServiceTimeText(order, serviceKind),
      mainFeeLabel: getMainFeeLabel(serviceKind),
      showBoardingFee: serviceKind === 'boarding',
      showVisitFee: serviceKind === 'homeFeeding',
      showWashFee: serviceKind === 'wash' || !!order.needWash,
      boardingFeeInput: String(fees.boardingFee),
      visitFeeInput: String(fees.visitFee),
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

  _buildFees() {
    const {
      order, serviceKind, boardingFeeInput, visitFeeInput,
      shippingFeeInput, washFeeInput, valueAddedFeeInput
    } = this.data;
    const hasValueAdded = Array.isArray(order.valueAddedServices) && order.valueAddedServices.length > 0;
    const isHome = serviceKind === 'homeFeeding';
    const isWashLine = serviceKind === 'wash';
    return buildFeePayload(
      isHome || isWashLine ? 0 : boardingFeeInput,
      shippingFeeInput,
      !isHome && !!order.needPickup,
      washFeeInput,
      isWashLine || !!order.needWash,
      valueAddedFeeInput,
      hasValueAdded,
      isHome ? visitFeeInput : 0
    );
  },

  _syncPreview() {
    const fees = this._buildFees();
    this.setData({
      boardingFeeText: fees.boardingFee.toFixed(2),
      visitFeeText: fees.visitFee.toFixed(2),
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

  onVisitFeeInput(e) {
    this.setData({ visitFeeInput: e.detail.value });
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
    const { order, serviceKind, boardingFeeInput, visitFeeInput, shippingFeeInput, washFeeInput, valueAddedFeeInput } = this.data;
    const isHome = serviceKind === 'homeFeeding';
    const isWashLine = serviceKind === 'wash';

    if (isHome) {
      const visitFee = parseFee(visitFeeInput, -1);
      if (visitFee < 0) {
        wx.showToast({ title: '请输入有效上门费用', icon: 'none' });
        return;
      }
    } else if (!isWashLine) {
      const boardingFee = parseFee(boardingFeeInput, -1);
      if (boardingFee < 0) {
        wx.showToast({ title: '请输入有效寄养费用', icon: 'none' });
        return;
      }
    }

    if (isWashLine || order.needWash) {
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

    const fees = this._buildFees();
    const updates = {
      boardingFee: fees.boardingFee,
      shippingFee: fees.shippingFee,
      washFee: fees.washFee,
      needWash: isWashLine || !!order.needWash,
      visitFee: fees.visitFee,
      valueAddedFee: fees.valueAddedFee,
      valueAddedServices: hasValueAdded ? (order.valueAddedServices || []) : [],
      totalFee: fees.totalFee,
      merchantPriceAdjust: true
    };

    if (order.feeSnapshot) {
      const snap = { ...order.feeSnapshot };
      if (isHome && snap.visit) {
        const visit = { ...snap.visit, fee: fees.visitFee };
        if (Array.isArray(visit.items) && visit.items.length === 1) {
          visit.items = [{ ...visit.items[0], fee: fees.visitFee }];
        }
        snap.visit = visit;
      }
      if ((isWashLine || order.needWash) && snap.wash) {
        const wash = { ...snap.wash, fee: fees.washFee };
        if (Array.isArray(wash.items) && wash.items.length === 1) {
          wash.items = [{ ...wash.items[0], fee: fees.washFee }];
        }
        snap.wash = wash;
      }
      if (hasValueAdded && snap.valueAdded) {
        snap.valueAdded = { ...snap.valueAdded, fee: fees.valueAddedFee };
      }
      updates.feeSnapshot = snap;
    }

    wx.showLoading({ title: '保存中' });
    app.updateOrder(order.id, updates)
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
