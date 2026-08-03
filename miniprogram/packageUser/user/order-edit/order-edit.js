const app = getApp();
const util = require('../../../utils/util');
const { calcStayFeeBreakdown, formatMoney } = require('../../../utils/billing');
const timePicker = require('../../utils/timePicker');
const { validateReserveContact, validateContactIdCard } = require('../../utils/reserveContact');
const { validatePickupInfo, buildPickupPayload } = require('../../utils/pickupInfo');
const { calcPickupShippingFee, canCalcDistancePickupFee, parseStoreCoords, isPickupFreeByStayDays } = require('../../../utils/pickupPricing');
const { resolveStorePickupDrivingDistance } = require('../../utils/mapDistance');
const { choosePickupLocation, formatLocationAddress, getPickupLocationValidationMessage } = require('../../../utils/location');
const { isOrderEditTimeOnly } = require('../../utils/orderActions');
const { showValidationAlert } = require('../../../utils/formAlert');
const { getPetBookingConflictMessage } = require('../../../utils/bookingOverlap');

function getTodayStr() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    order: {},
    store: null,
    timeOnly: false,
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    minDate: getTodayStr(),
    contactName: '',
    contactPhone: '',
    contactIdCard: '',
    emergencyPhone: '',
    specialNeeds: '',
    needPickup: false,
    pickupAddress: '',
    pickupLocationName: '',
    pickupLatitude: '',
    pickupLongitude: '',
    pickupContactPhone: '',
    pickupLeg: 'both',
    pickupDrivingDistanceKm: null,
    pickupDistanceMode: '',
    pickupDistanceError: '',
    feeReady: false,
    totalFeeText: '0',
    showTimePicker: false,
    timePickerTarget: '',
    timePickerTitle: '',
    timeHours: [],
    timeMinutes: [],
    timePickerValue: [10, 0]
  },

  onLoad(opts) {
    this.orderId = opts.id;
    this._choosingPickupLocation = false;
    this._loadOrder();
  },

  onShow() {
    if (this._choosingPickupLocation) {
      this._choosingPickupLocation = false;
    }
  },

  _loadOrder() {
    const order = app.getOrders().find((o) => o.id === this.orderId);
    if (!order) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const timeOnly = isOrderEditTimeOnly(order.status);
    const store = app.getUserStoreView() || { hasPickup: order.needPickup };
    this.setData({
      order,
      store,
      timeOnly,
      startDate: order.startDate,
      endDate: order.endDate,
      startTime: order.startTime,
      endTime: order.endTime,
      contactName: order.contactName || '',
      contactPhone: order.contactPhone || order.userPhone || '',
      contactIdCard: order.contactIdCard || '',
      emergencyPhone: order.emergencyPhone || '',
      specialNeeds: order.specialNeeds || '',
      needPickup: !!order.needPickup,
      pickupAddress: order.pickupAddress || '',
      pickupLocationName: order.pickupLocationName || '',
      pickupLatitude: order.pickupLatitude,
      pickupLongitude: order.pickupLongitude,
      pickupContactPhone: order.pickupContactPhone || '',
      pickupLeg: order.pickupIncludeOutbound === false
        ? 'return'
        : (order.pickupIncludeReturn === false ? 'outbound' : 'both')
    });
    this.calcFee();
  },

  _getPickupFlags() {
    const { pickupLeg } = this.data;
    return {
      pickupIncludeOutbound: pickupLeg === 'both' || pickupLeg === 'outbound',
      pickupIncludeReturn: pickupLeg === 'both' || pickupLeg === 'return'
    };
  },

  onDateSelect(e) {
    if (this.data.timeOnly) {
      this.setData({
        startDate: this.data.order.startDate,
        endDate: e.detail.endDate || e.detail.startDate
      });
    } else {
      this.setData({
        startDate: e.detail.startDate,
        endDate: e.detail.endDate
      });
    }
    this.calcFee();
  },

  onOpenStartTimePicker() {
    const state = timePicker.buildPickerState(this.data.startTime, '10:00');
    this.setData({
      showTimePicker: true,
      timePickerTarget: 'start',
      timePickerTitle: '选择入住时间',
      timeHours: state.hours,
      timeMinutes: state.minutes,
      timePickerValue: state.timePickerValue
    });
  },

  onOpenEndTimePicker() {
    const state = timePicker.buildPickerState(this.data.endTime, '18:00');
    this.setData({
      showTimePicker: true,
      timePickerTarget: 'end',
      timePickerTitle: '选择离店时间',
      timeHours: state.hours,
      timeMinutes: state.minutes,
      timePickerValue: state.timePickerValue
    });
  },

  onTimePickerChange(e) {
    this.setData({ timePickerValue: e.detail.value });
  },

  onConfirmTimePicker() {
    const { timeHours, timeMinutes, timePickerValue, timePickerTarget } = this.data;
    const time = timePicker.valueToTimeString(timeHours, timeMinutes, timePickerValue);
    if (timePickerTarget === 'start') {
      this.setData({ startTime: time, showTimePicker: false });
    } else {
      this.setData({ endTime: time, showTimePicker: false });
    }
    this.calcFee();
  },

  onCancelTimePicker() {
    this.setData({ showTimePicker: false });
  },

  onTimePanelTap() {},

  onContactNameInput(e) { this.setData({ contactName: (e.detail.value || '').trim() }); },
  onContactPhoneInput(e) { this.setData({ contactPhone: (e.detail.value || '').trim() }); },
  onContactIdCardInput(e) { this.setData({ contactIdCard: (e.detail.value || '').trim() }); },
  onEmergencyPhoneInput(e) { this.setData({ emergencyPhone: (e.detail.value || '').trim() }); },
  onSpecialInput(e) { this.setData({ specialNeeds: e.detail.value }); },

  onPickupChange(e) {
    const needPickup = e.detail.value;
    const patch = { needPickup };
    if (!needPickup) {
      patch.pickupAddress = '';
      patch.pickupLocationName = '';
      patch.pickupLatitude = '';
      patch.pickupLongitude = '';
      patch.pickupContactPhone = '';
      patch.pickupLeg = 'both';
      patch.pickupDrivingDistanceKm = null;
      patch.pickupDistanceMode = '';
      patch.pickupDistanceError = '';
    }
    this.setData(patch);
    this.calcFee();
  },

  onPickupPhoneInput(e) {
    this.setData({ pickupContactPhone: (e.detail.value || '').trim() });
  },

  onPickupLegChange(e) {
    this.setData({ pickupLeg: e.detail.value || 'both' }, () => this.calcFee());
  },

  onChoosePickupAddress() {
    this._choosingPickupLocation = true;
    choosePickupLocation({
      latitude: this.data.pickupLatitude,
      longitude: this.data.pickupLongitude
    })
      .then((res) => {
        const validationMsg = getPickupLocationValidationMessage(res);
        if (validationMsg) {
          this._choosingPickupLocation = false;
          wx.showToast({ title: validationMsg, icon: 'none' });
          return;
        }
        this.setData({
          pickupAddress: formatLocationAddress(res),
          pickupLocationName: (res.name || '').trim(),
          pickupLatitude: res.latitude,
          pickupLongitude: res.longitude,
          pickupDrivingDistanceKm: null,
          pickupDistanceMode: '',
          pickupDistanceError: ''
        }, () => this.calcFee());
      })
      .catch(() => {
        this._choosingPickupLocation = false;
      });
  },

  calcFee() {
    const {
      order, timeOnly, startDate, endDate, startTime, endTime, needPickup, store,
      pickupLatitude, pickupLongitude, pickupDrivingDistanceKm, pickupDistanceMode
    } = this.data;
    const useStartDate = timeOnly ? order.startDate : startDate;
    const useStartTime = timeOnly ? order.startTime : startTime;
    const feeToken = (this._feeCalcToken = (this._feeCalcToken || 0) + 1);

    if (!useStartDate || !endDate || !useStartTime || !endTime) {
      this.setData({ feeReady: false, totalFeeText: '0', _feePayload: null });
      return;
    }

    const rules = app.getStoreBillingRules();
    const basePrice = order.basePrice || util.getPriceByMode(rules, order.petWeight, order.roomType);
    const breakdown = calcStayFeeBreakdown(
      useStartDate, endDate, useStartTime, endTime, rules, basePrice
    );
    const storeView = store || {};
    const pickupFlags = this._getPickupFlags();
    const isDistanceMode = storeView.pickupPricingMode === 'distance';
    const storeHasLocation = !!parseStoreCoords(storeView);
    const hasPickupCoords = !!(pickupLatitude && pickupLongitude);
    const needsDrivingDistance = !!(needPickup && isDistanceMode && storeHasLocation && hasPickupCoords);

    const applyFeeUi = (distanceKm, distanceError, distanceMode) => {
      if (feeToken !== this._feeCalcToken) return;
      const resolvedMode = distanceMode === 'straight' ? 'straight' : (distanceKm != null ? 'driving' : '');
      const pickupReady = !needPickup
        || isPickupFreeByStayDays(storeView, breakdown.days)
        || !isDistanceMode
        || canCalcDistancePickupFee(
          storeView, pickupLatitude, pickupLongitude, distanceKm, breakdown.days
        );
      const pickupFee = needPickup && pickupReady
        ? calcPickupShippingFee({
          store: storeView,
          ...pickupFlags,
          pickupLatitude,
          pickupLongitude,
          distanceKm,
          distanceMode: resolvedMode,
          stayDays: breakdown.days
        })
        : 0;
      const totalFee = breakdown.baseFee + pickupFee;
      const feeReady = breakdown.ready && (!needPickup || pickupReady);

      this.setData({
        feeReady,
        totalFeeText: formatMoney(totalFee),
        pickupDrivingDistanceKm: distanceKm != null ? distanceKm : null,
        pickupDistanceMode: resolvedMode,
        pickupDistanceError: distanceError || '',
        _feePayload: {
          days: breakdown.days,
          boardingFee: breakdown.baseFee,
          shippingFee: pickupFee,
          totalFee,
          feeSnapshot: {
            basePrice,
            dailyBreakdown: breakdown.dailyBreakdown,
            chargeSummary: breakdown.chargeSummary,
            daysText: breakdown.daysText,
            pickupDistanceKm: distanceKm != null ? distanceKm : undefined,
            pickupDistanceMode: isDistanceMode ? (resolvedMode || 'driving') : undefined
          },
          basePrice
        }
      });

      if (distanceError) {
        wx.showToast({ title: distanceError, icon: 'none' });
      }
    };

    if (!needsDrivingDistance) {
      applyFeeUi(null, '', '');
      return;
    }

    if (pickupDrivingDistanceKm != null && pickupDrivingDistanceKm !== '') {
      applyFeeUi(pickupDrivingDistanceKm, '', pickupDistanceMode || 'driving');
      return;
    }

    this.setData({ feeReady: false });
    resolveStorePickupDrivingDistance(storeView, pickupLatitude, pickupLongitude)
      .then((res) => {
        if (feeToken !== this._feeCalcToken) return;
        if (!res || !res.success) {
          applyFeeUi(null, (res && res.errMsg) || '距离计算失败，请重新选择地址', '');
          return;
        }
        applyFeeUi(res.distanceKm, '', res.distanceMode || 'driving');
      })
      .catch(() => {
        if (feeToken !== this._feeCalcToken) return;
        applyFeeUi(null, '距离计算失败，请重新选择地址', '');
      });
  },

  onSubmit() {
    const { order, timeOnly, feeReady, _feePayload } = this.data;
    if (!feeReady || !_feePayload) {
      showValidationAlert(this.data.pickupDistanceError || '请完善时间信息');
      return;
    }

    if (!timeOnly) {
      const contactErr = validateReserveContact(this.data.contactName, this.data.contactPhone);
      if (contactErr) {
        showValidationAlert(contactErr);
        return;
      }
      const idCardErr = validateContactIdCard(this.data.contactIdCard);
      if (idCardErr) {
        showValidationAlert(idCardErr);
        return;
      }
      if (this.data.needPickup) {
        const pickupErr = validatePickupInfo({
          needPickup: true,
          pickupAddress: this.data.pickupAddress,
          pickupLatitude: this.data.pickupLatitude,
          pickupLongitude: this.data.pickupLongitude,
          pickupContactPhone: this.data.pickupContactPhone,
          pickupTime: order.pickupTime || order.startTime,
          ...this._getPickupFlags()
        });
        if (pickupErr) {
          showValidationAlert(pickupErr);
          return;
        }
      }
    }

    const updates = {
      ..._feePayload,
      endDate: this.data.endDate,
      endTime: this.data.endTime
    };

    if (!timeOnly) {
      Object.assign(updates, {
        startDate: this.data.startDate,
        startTime: this.data.startTime,
        contactName: this.data.contactName,
        contactPhone: this.data.contactPhone,
        contactIdCard: this.data.contactIdCard,
        emergencyPhone: this.data.emergencyPhone,
        specialNeeds: this.data.specialNeeds,
        ...buildPickupPayload({
          needPickup: this.data.needPickup,
          pickupAddress: this.data.pickupAddress,
          pickupLocationName: this.data.pickupLocationName,
          pickupLatitude: this.data.pickupLatitude,
          pickupLongitude: this.data.pickupLongitude,
          pickupContactPhone: this.data.pickupContactPhone,
          pickupTime: order.pickupTime || this.data.startTime,
          ...this._getPickupFlags()
        })
      });
    }

    const scheduleRange = {
      startDate: updates.startDate || order.startDate,
      endDate: updates.endDate || order.endDate,
      startTime: updates.startTime || order.startTime,
      endTime: updates.endTime || order.endTime
    };
    const overlapErr = getPetBookingConflictMessage(
      typeof app.getOrders === 'function' ? app.getOrders() : [],
      { id: order.petId, name: order.petName },
      scheduleRange,
      {
        excludeOrderId: order.id || order.order_id,
        excludeGroupId: order.orderGroupId || ''
      }
    );
    if (overlapErr) {
      showValidationAlert(overlapErr);
      return;
    }

    wx.showLoading({ title: '保存中' });
    app.updateOrder(order.id, updates)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  }
});
