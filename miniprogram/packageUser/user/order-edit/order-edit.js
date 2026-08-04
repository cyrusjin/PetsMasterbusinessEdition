const app = getApp();
const util = require('../../../utils/util');
const { calcStayFeeBreakdown, formatMoney } = require('../../../utils/billing');
const timePicker = require('../../utils/timePicker');
const { validateReserveContact, validateContactIdCard } = require('../../utils/reserveContact');
const { validatePickupInfo, buildPickupPayload } = require('../../utils/pickupInfo');
const { calcPickupShippingFee, canCalcDistancePickupFee, parseStoreCoords, isPickupFreeByStayDays } = require('../../../utils/pickupPricing');
const { calcWashFee, formatWashPricingSummary } = require('../../../utils/washPricing');
const { resolveStorePickupDrivingDistance } = require('../../utils/mapDistance');
const { choosePickupLocation, formatLocationAddress, getPickupLocationValidationMessage } = require('../../../utils/location');
const { isOrderEditTimeOnly } = require('../../utils/orderActions');
const { showValidationAlert } = require('../../../utils/formAlert');
const { getPetBookingConflictMessage, toRangeMs } = require('../../utils/bookingOverlap');

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
    minEndDate: getTodayStr(),
    contactName: '',
    contactPhone: '',
    contactIdCard: '',
    emergencyPhone: '',
    specialNeeds: '',
    needPickup: false,
    needWash: false,
    washPricingSummary: '',
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
    const store = app.getUserStoreView() || { hasPickup: order.needPickup, hasWash: order.needWash };
    const today = getTodayStr();
    const minEndDate = order.startDate && order.startDate > today ? order.startDate : today;
    const pending = order.editPendingConfirm && order.pendingEdit ? order.pendingEdit : null;
    const formOrder = pending ? { ...order, ...pending } : order;
    this.setData({
      order,
      store,
      timeOnly,
      startDate: formOrder.startDate,
      endDate: formOrder.endDate,
      startTime: formOrder.startTime,
      endTime: formOrder.endTime,
      minEndDate,
      contactName: formOrder.contactName || '',
      contactPhone: formOrder.contactPhone || order.userPhone || '',
      contactIdCard: formOrder.contactIdCard || '',
      emergencyPhone: formOrder.emergencyPhone || '',
      specialNeeds: formOrder.specialNeeds || '',
      needPickup: !!formOrder.needPickup,
      needWash: !!formOrder.needWash,
      washPricingSummary: formatWashPricingSummary(store),
      pickupAddress: formOrder.pickupAddress || '',
      pickupLocationName: formOrder.pickupLocationName || '',
      pickupLatitude: formOrder.pickupLatitude,
      pickupLongitude: formOrder.pickupLongitude,
      pickupContactPhone: formOrder.pickupContactPhone || '',
      pickupLeg: formOrder.pickupIncludeOutbound === false
        ? 'return'
        : (formOrder.pickupIncludeReturn === false ? 'outbound' : 'both')
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
    this.setData({
      startDate: e.detail.startDate,
      endDate: e.detail.endDate
    });
    this.calcFee();
  },

  onEndDateChange(e) {
    const endDate = (e.detail && e.detail.value) || '';
    if (!endDate) return;
    this.setData({
      startDate: this.data.order.startDate,
      endDate
    });
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

  onWashChange(e) {
    const needWash = !!e.detail.value;
    if (needWash && !(this.data.store && this.data.store.hasWash)) {
      wx.showToast({ title: '店铺未开通洗护', icon: 'none' });
      this.setData({ needWash: false });
      return;
    }
    this.setData({ needWash });
    this.calcFee();
  },

  onPreviewWashNoticePhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.store && this.data.store.washNoticePhotos) || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
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
      order, timeOnly, startDate, endDate, startTime, endTime, needPickup, needWash, store,
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
    // 店铺开通时可勾选；已选洗护的订单在店铺关闭洗护后仍可取消
    const orderNeedWash = !!needWash && (!!storeView.hasWash || !!order.needWash);

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

      let washFee = 0;
      let washSnap = null;
      if (orderNeedWash) {
        if (storeView.hasWash) {
          const washQuote = calcWashFee({
            store: storeView,
            petWeight: order.petWeight,
            stayDays: breakdown.days,
            needWash: true
          });
          washFee = washQuote.fee;
          washSnap = {
            unitPrice: washQuote.unitPrice,
            fee: washFee,
            freeByStay: washQuote.freeByStay,
            freeMinDays: washQuote.freeMinDays,
            text: washQuote.text
          };
        } else {
          const prevSnap = (order.feeSnapshot && order.feeSnapshot.wash) || {};
          const unitPrice = parseFloat(prevSnap.unitPrice != null ? prevSnap.unitPrice : order.washFee) || 0;
          const freeMinDays = parseInt(prevSnap.freeMinDays, 10) || 0;
          const freeByStay = freeMinDays > 0 && breakdown.days >= freeMinDays;
          washFee = freeByStay ? 0 : unitPrice;
          washSnap = {
            unitPrice,
            fee: washFee,
            freeByStay,
            freeMinDays,
            text: freeByStay
              ? `寄养满 ${freeMinDays} 天，洗护免费`
              : (unitPrice > 0 ? `洗护 ¥${unitPrice}/次` : '')
          };
        }
      }
      const totalFee = breakdown.baseFee + pickupFee + washFee;
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
          washFee,
          needWash: orderNeedWash,
          totalFee,
          feeSnapshot: {
            basePrice,
            dailyBreakdown: breakdown.dailyBreakdown,
            chargeSummary: breakdown.chargeSummary,
            daysText: breakdown.daysText,
            pickupDistanceKm: distanceKm != null ? distanceKm : undefined,
            pickupDistanceMode: isDistanceMode ? (resolvedMode || 'driving') : undefined,
            wash: washSnap || undefined
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
    // 仅补选增值服务、寄养时段未变时不做重叠校验
    const scheduleChanged = (
      String(scheduleRange.startDate || '') !== String(order.startDate || '')
      || String(scheduleRange.endDate || '') !== String(order.endDate || '')
      || String(scheduleRange.startTime || '') !== String(order.startTime || '')
      || String(scheduleRange.endTime || '') !== String(order.endTime || '')
    );
    if (scheduleChanged) {
      const sameStart = (
        String(scheduleRange.startDate || '') === String(order.startDate || '')
        && String(scheduleRange.startTime || '') === String(order.startTime || '')
      );
      let checkRange = scheduleRange;
      // 入住不变：缩短离店不校验；延长只校验「原离店 ~ 新离店」新增时段，避免把自己原订单判成冲突
      if (sameStart) {
        const oldEndMs = toRangeMs(order.endDate, order.endTime, '23:59');
        const newEndMs = toRangeMs(scheduleRange.endDate, scheduleRange.endTime, '23:59');
        if (Number.isFinite(oldEndMs) && Number.isFinite(newEndMs) && newEndMs <= oldEndMs) {
          checkRange = null;
        } else {
          checkRange = {
            startDate: order.endDate,
            startTime: order.endTime,
            endDate: scheduleRange.endDate,
            endTime: scheduleRange.endTime
          };
        }
      }

      if (checkRange) {
        const excludeIds = [order.id, order.order_id].filter(Boolean);
        const overlapErr = getPetBookingConflictMessage(
          typeof app.getOrders === 'function' ? app.getOrders() : [],
          { id: order.petId, name: order.petName },
          checkRange,
          {
            excludeOrderId: order.id || order.order_id,
            excludeOrderIds: excludeIds,
            excludeGroupId: order.orderGroupId || '',
            excludeSameStayAs: {
              petId: order.petId,
              petName: order.petName,
              startDate: order.startDate,
              startTime: order.startTime
            }
          }
        );
        if (overlapErr) {
          showValidationAlert(overlapErr);
          return;
        }
      }
    }

    wx.showLoading({ title: '提交中' });
    app.updateOrder(order.id, updates)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已提交', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
      });
  }
});
