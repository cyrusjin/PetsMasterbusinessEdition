const app = getApp();
const util = require('../../../utils/util');
const { calcStayFeeBreakdown, formatMoney, buildChargeSummary } = require('../../../utils/billing');
const { buildRoomOptions, resolveRoomOptionsPhotos, findRoom, supportsPetWeight } = require('../../../utils/roomPricing');
const timePicker = require('../../utils/timePicker');
const { buildPetSnapshot } = require('../../../utils/petSnapshot');
const { buildContractDraft } = require('../../../utils/boardingContract');
const { showValidationAlert } = require('../../../utils/formAlert');
const {
  loadReserveContact,
  saveReserveContact,
  validateReserveContact
} = require('../../utils/reserveContact');
const { validatePickupInfo, buildPickupPayload } = require('../../utils/pickupInfo');
const {
  calcPickupShippingFee,
  formatPickupPricingSummary,
  canCalcDistancePickupFee,
  buildPickupFeeQuote,
  parseStoreCoords
} = require('../../../utils/pickupPricing');
const { resolveStorePickupDrivingDistance } = require('../../utils/mapDistance');
const {
  choosePickupLocation,
  formatLocationAddress,
  getPickupLocationValidationMessage
} = require('../../../utils/location');
const { isOaBound } = require('../../../utils/officialAccount');

function getTodayStr() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

Page({
  data: {
    store: null,
    pets: [],
    selectedPet: null,
    contactName: '',
    contactPhone: '',
    emergencyPhone: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    minDate: getTodayStr(),
    showTimePicker: false,
    timePickerTarget: '',
    timePickerTitle: '',
    timeHours: [],
    timeMinutes: [],
    timePickerValue: [10, 0],
    days: 0,
    daysText: '0',
    totalFee: 0,
    totalFeeText: '0',
    boardingTotalFee: 0,
    boardingTotalFeeText: '0',
    pickupFee: 0,
    pickupFeeText: '0',
    pickupFeeStandard: '',
    pickupDistanceText: '',
    pickupFeeCalcText: '',
    pickupFeePendingText: '',
    pickupFeeStoreLocationMissing: false,
    pickupFeeReady: false,
    pickupDrivingDistanceKm: null,
    pickupDistanceMode: '',
    pickupDistanceError: '',
    grandTotalFee: 0,
    grandTotalFeeText: '0',
    baseFee: 0,
    feeReady: false,
    dailyBreakdown: [],
    chargeSummary: '',
    basePrice: 0,
    basePriceText: '0',
    billingMode: 'weight',
    roomType: '',
    roomOptions: [],
    extraList: [],
    specialNeeds: '',
    needPickup: false,
    pickupAddress: '',
    pickupLocationName: '',
    pickupLatitude: '',
    pickupLongitude: '',
    pickupContactPhone: '',
    pickupTime: '',
    pickupTimeDisplay: '选择接送时间',
    pickupLeg: 'both',
    pickupPricingSummary: '',
    pickupFeePending: false,
    pickupFeePendingText: '',
    totalDisplayReady: false,
    agreedToContract: false,
    signedContractDraft: null,
    contractModalVisible: false,
    oaFollowSheetVisible: false,
    contractModalSignable: false,
    contractDoc: {}
  },

  onLoad() {
    this._pickupTimeTouched = false;
    this._pageReady = false;
    this._choosingPickupLocation = false;
  },

  onShow() {
    app.ensureCloudAndLogin()
      .then(() => {
        if (this._choosingPickupLocation) {
          this._choosingPickupLocation = false;
          return;
        }
        return this._loadPage({ preserveForm: !!this._pageReady });
      });
  },

  _setRoomOptions(petWeight, extraPatch, roomType) {
    const rules = app.getStoreBillingRules();
    const roomOptions = buildRoomOptions(rules.roomPricing, petWeight);
    const patch = { ...(extraPatch || {}), roomOptions };
    if (roomType !== undefined) patch.roomType = roomType;
    this.setData(patch);
    return this._refreshRoomOptionPhotos(roomOptions);
  },

  _refreshRoomOptionPhotos(roomOptions) {
    const list = Array.isArray(roomOptions) ? roomOptions : [];
    const token = (this._roomPhotoToken = (this._roomPhotoToken || 0) + 1);
    return resolveRoomOptionsPhotos(list).then((resolved) => {
      if (token !== this._roomPhotoToken) return;
      const changed = resolved.some((room, i) => room.photo !== (list[i] && list[i].photo));
      if (changed) {
        this.setData({ roomOptions: resolved });
      }
    }).catch(() => {});
  },

  _applyPetSelection(pet) {
    this._invalidateSignedContract();
    const rules = app.getStoreBillingRules();
    let roomType = this.data.roomType;
    const selectedRoom = findRoom(rules.roomPricing, roomType);
    // 仅在已选宠物时按体重校验；未选宠物不因「超限」清空房间
    if (pet && (!selectedRoom || !supportsPetWeight(selectedRoom, pet.weight))) {
      roomType = '';
    } else if (!selectedRoom) {
      roomType = '';
    }
    this._setRoomOptions(pet && pet.weight, { selectedPet: pet }, roomType);
    this.calcFee();
  },

  _loadPage(options = {}) {
    const preserveForm = !!options.preserveForm;
    const prevForm = preserveForm ? {
      selectedPetId: this.data.selectedPet && this.data.selectedPet.id,
      startDate: this.data.startDate,
      endDate: this.data.endDate,
      startTime: this.data.startTime,
      endTime: this.data.endTime,
      roomType: this.data.roomType,
      needPickup: this.data.needPickup,
      pickupAddress: this.data.pickupAddress,
      pickupLocationName: this.data.pickupLocationName,
      pickupLatitude: this.data.pickupLatitude,
      pickupLongitude: this.data.pickupLongitude,
      pickupContactPhone: this.data.pickupContactPhone,
      pickupTime: this.data.pickupTime,
      pickupTimeDisplay: this.data.pickupTimeDisplay,
      pickupLeg: this.data.pickupLeg,
      specialNeeds: this.data.specialNeeds,
      emergencyPhone: this.data.emergencyPhone
    } : null;

    const cachedContact = loadReserveContact();
    const storeId = app.getStoreId();
    const loadStore = storeId && app.globalData.env
      ? app.bindStore(storeId, { force: !preserveForm, syncUser: false })
      : Promise.resolve();

    return loadStore.then(() => {
      const store = app.getUserStoreView();
      if (!store || !storeId) {
        this.setData({ store: null });
        wx.showModal({
          title: '暂无法预约',
          content: '您还未绑定店铺，请先通过商家分享链接进入店铺后再预约服务。',
          showCancel: false,
          confirmText: '我知道了',
          success: () => {
            wx.navigateBack({ fail: () => {} });
          }
        });
        return;
      }

      const rules = app.getStoreBillingRules();
      const extraList = preserveForm ? this.data.extraList : [];
      const chargeSummary = buildChargeSummary(rules);

      return app.loadPets().then((pets) => {
        let selectedPet = null;
        if (prevForm && prevForm.selectedPetId) {
          selectedPet = pets.find((p) => p.id === prevForm.selectedPetId) || null;
        }
        if (!selectedPet && pets.length > 0) {
          selectedPet = pets[0];
        }

        const roomOptions = buildRoomOptions(rules.roomPricing, selectedPet && selectedPet.weight);
        let roomType = preserveForm && prevForm ? prevForm.roomType : '';
        if (roomType) {
          const rawRoom = findRoom(rules.roomPricing, roomType);
          if (!rawRoom) {
            roomType = '';
          } else if (selectedPet && !supportsPetWeight(rawRoom, selectedPet.weight)) {
            roomType = '';
          }
        }

        const patch = {
          store,
          pets,
          extraList,
          billingMode: rules.billingMode || 'weight',
          pickupPricingSummary: formatPickupPricingSummary(store),
          chargeSummary,
          minDate: getTodayStr(),
          contactName: cachedContact.contactName || this.data.contactName,
          contactPhone: cachedContact.contactPhone || this.data.contactPhone,
          selectedPet,
          roomOptions,
          roomType
        };

        if (preserveForm && prevForm) {
          Object.assign(patch, {
            startDate: prevForm.startDate,
            endDate: prevForm.endDate,
            startTime: prevForm.startTime,
            endTime: prevForm.endTime,
            needPickup: prevForm.needPickup,
            pickupAddress: prevForm.pickupAddress,
            pickupLocationName: prevForm.pickupLocationName,
            pickupLatitude: prevForm.pickupLatitude,
            pickupLongitude: prevForm.pickupLongitude,
            pickupContactPhone: prevForm.pickupContactPhone,
            pickupTime: prevForm.pickupTime,
            pickupTimeDisplay: prevForm.pickupTimeDisplay,
            pickupLeg: prevForm.pickupLeg,
            specialNeeds: prevForm.specialNeeds,
            emergencyPhone: prevForm.emergencyPhone
          });
        }

        this.setData(patch);
        this._pageReady = true;
        this.calcFee();
        return this._refreshRoomOptionPhotos(roomOptions);
      });
    });
  },

  _getContractStore() {
    const raw = app.getCurrentStore() || {};
    const view = app.getUserStoreView() || {};
    return { ...raw, ...view };
  },

  _invalidateSignedContract() {
    if (!this.data.agreedToContract && !this.data.signedContractDraft) return;
    this.setData({ agreedToContract: false, signedContractDraft: null });
    app.globalData.signedContractDraft = null;
  },

  _persistContactCache() {
    saveReserveContact(this.data.contactName, this.data.contactPhone);
  },

  onContactNameInput(e) {
    this._invalidateSignedContract();
    this.setData({ contactName: (e.detail.value || '').trim() });
  },

  onContactPhoneInput(e) {
    this._invalidateSignedContract();
    this.setData({ contactPhone: (e.detail.value || '').trim() });
  },

  onEmergencyPhoneInput(e) {
    this.setData({ emergencyPhone: (e.detail.value || '').trim() });
  },

  onContactBlur() {
    this._persistContactCache();
  },

  onSelectPet(e) {
    const id = e.currentTarget.dataset.id;
    const pet = this.data.pets.find((p) => p.id === id);
    this._applyPetSelection(pet);
  },

  _formatPickupTimeDisplay(date, time) {
    if (!date || !time) return '选择接送时间';
    return `${date} ${time}`;
  },

  _syncDefaultPickupTime(startTime) {
    if (!this.data.needPickup || this._pickupTimeTouched) return {};
    const time = startTime || this.data.startTime;
    if (!time) return {};
    return {
      pickupTime: time,
      pickupTimeDisplay: this._formatPickupTimeDisplay(this.data.startDate, time)
    };
  },

  onDateSelect(e) {
    this._invalidateSignedContract();
    this._pickupTimeTouched = false;
    this.setData({
      startDate: e.detail.startDate,
      endDate: e.detail.endDate,
      startTime: '',
      endTime: '',
      pickupTime: '',
      pickupTimeDisplay: '选择接送时间'
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
    this._invalidateSignedContract();
    if (timePickerTarget === 'start') {
      this.setData({
        startTime: time,
        showTimePicker: false,
        ...this._syncDefaultPickupTime(time)
      });
    } else if (timePickerTarget === 'pickup') {
      this._pickupTimeTouched = true;
      this.setData({
        pickupTime: time,
        pickupTimeDisplay: this._formatPickupTimeDisplay(this.data.startDate, time),
        showTimePicker: false
      });
    } else {
      this.setData({ endTime: time, showTimePicker: false });
    }
    this.calcFee();
  },

  onCancelTimePicker() {
    this.setData({ showTimePicker: false });
  },

  onTimePanelTap() {},

  onExtraChange(e) {
    const key = e.currentTarget.dataset.key;
    const list = this.data.extraList.map((item) => (
      item.key === key ? { ...item, checked: !item.checked } : item
    ));
    this.setData({ extraList: list });
    this.calcFee();
  },

  onSpecialInput(e) {
    this.setData({ specialNeeds: e.detail.value });
  },

  onPickupChange(e) {
    const needPickup = e.detail.value;
    const patch = { needPickup };
    if (needPickup) {
      patch.pickupLeg = 'both';
      if (!this.data.pickupContactPhone && this.data.contactPhone) {
        patch.pickupContactPhone = this.data.contactPhone;
      }
      this._pickupTimeTouched = false;
      const defaultTime = this.data.startTime || '';
      if (defaultTime) {
        patch.pickupTime = defaultTime;
        patch.pickupTimeDisplay = this._formatPickupTimeDisplay(this.data.startDate, defaultTime);
      }
    } else {
      patch.pickupAddress = '';
      patch.pickupLocationName = '';
      patch.pickupLatitude = '';
      patch.pickupLongitude = '';
      patch.pickupContactPhone = '';
      patch.pickupTime = '';
      patch.pickupTimeDisplay = '选择接送时间';
      patch.pickupLeg = 'both';
      patch.pickupDrivingDistanceKm = null;
      patch.pickupDistanceMode = '';
      patch.pickupDistanceError = '';
      this._pickupTimeTouched = false;
    }
    this.setData(patch);
    this.calcFee();
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
          wx.showToast({ title: validationMsg, icon: 'none', duration: 2500 });
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

  onPickupPhoneInput(e) {
    this.setData({ pickupContactPhone: (e.detail.value || '').trim() });
  },

  onPickupLegChange(e) {
    this.setData({ pickupLeg: e.detail.value || 'both' }, () => this.calcFee());
  },

  onOpenPickupTimePicker() {
    if (!this.data.startTime) {
      wx.showToast({ title: '请先选择入住时间', icon: 'none' });
      return;
    }
    const defaultTime = this.data.pickupTime || this.data.startTime;
    const state = timePicker.buildPickerState(defaultTime, this.data.startTime || '10:00');
    this.setData({
      showTimePicker: true,
      timePickerTarget: 'pickup',
      timePickerTitle: '选择接送时间',
      timeHours: state.hours,
      timeMinutes: state.minutes,
      timePickerValue: state.timePickerValue
    });
  },

  _getPickupFlags() {
    const { pickupLeg } = this.data;
    return {
      pickupIncludeOutbound: pickupLeg === 'both' || pickupLeg === 'outbound',
      pickupIncludeReturn: pickupLeg === 'both' || pickupLeg === 'return'
    };
  },

  onRoomTypeSelect(e) {
    const roomType = e.currentTarget.dataset.type;
    const { roomOptions, selectedPet } = this.data;
    if (!selectedPet) {
      wx.showToast({ title: '请先选择宠物', icon: 'none' });
      return;
    }
    const room = roomOptions.find((item) => item.id === roomType);
    const rules = app.getStoreBillingRules();
    const rawRoom = findRoom(rules.roomPricing, roomType);
    if (!rawRoom || !supportsPetWeight(rawRoom, selectedPet.weight)) {
      wx.showToast({ title: '宠物体重超出该房间限制', icon: 'none' });
      return;
    }
    if (room && room.disabled) {
      wx.showToast({ title: '宠物体重超出该房间限制', icon: 'none' });
      return;
    }
    this.setData({ roomType });
    this._invalidateSignedContract();
    this.calcFee();
  },

  _resetFeeState(chargeSummary) {
    this.setData({
      feeReady: false,
      days: 0,
      daysText: '0',
      totalFee: 0,
      totalFeeText: '0',
      boardingTotalFee: 0,
      boardingTotalFeeText: '0',
      pickupFee: 0,
      pickupFeeText: '0',
      pickupFeeStandard: '',
      pickupDistanceText: '',
      pickupFeeCalcText: '',
      pickupFeePendingText: '',
      pickupFeeStoreLocationMissing: false,
      pickupFeeReady: false,
      pickupDrivingDistanceKm: null,
      pickupDistanceMode: '',
      pickupDistanceError: '',
      grandTotalFee: 0,
      grandTotalFeeText: '0',
      baseFee: 0,
      dailyBreakdown: [],
      chargeSummary: chargeSummary || '',
      basePrice: 0,
      basePriceText: '0',
      pickupFeePending: false,
      pickupFeePendingText: '',
      totalDisplayReady: false
    });
  },

  calcFee() {
    const {
      selectedPet, startDate, endDate, startTime, endTime, extraList, needPickup,
      roomType, billingMode, store, pickupLatitude, pickupLongitude,
      pickupDrivingDistanceKm, pickupDistanceMode
    } = this.data;
    const rules = app.getStoreBillingRules();
    const chargeSummary = buildChargeSummary(rules);
    const pickupFlags = this._getPickupFlags();
    const feeToken = (this._feeCalcToken = (this._feeCalcToken || 0) + 1);

    if (!selectedPet || !startDate || !endDate || !startTime || !endTime) {
      this._resetFeeState(chargeSummary);
      return;
    }

    if (billingMode === 'room' && !roomType) {
      this._resetFeeState(chargeSummary);
      return;
    }

    const basePrice = util.getPriceByMode(rules, selectedPet.weight, roomType);
    const breakdown = calcStayFeeBreakdown(
      startDate, endDate, startTime, endTime, rules, basePrice
    );

    let extrasFee = 0;
    extraList.filter((e) => e.checked).forEach((e) => {
      extrasFee += e.price * breakdown.days;
    });

    const storeView = store || app.getUserStoreView() || {};
    const boardingTotalFee = breakdown.baseFee + extrasFee;
    const isDistanceMode = storeView.pickupPricingMode === 'distance';
    const storeHasLocation = !!parseStoreCoords(storeView);
    const hasPickupCoords = !!(pickupLatitude && pickupLongitude);
    const needsDrivingDistance = !!(needPickup && isDistanceMode && storeHasLocation && hasPickupCoords);
    const drivingKm = needsDrivingDistance ? pickupDrivingDistanceKm : null;

    const applyFeeUi = (distanceKm, distanceError, distanceMode) => {
      if (feeToken !== this._feeCalcToken) return;
      const resolvedMode = distanceMode === 'straight' ? 'straight' : (distanceKm != null ? 'driving' : '');

      const pickupQuote = needPickup
        ? buildPickupFeeQuote(storeView, {
          ...pickupFlags,
          pickupLatitude,
          pickupLongitude,
          distanceKm,
          distanceMode: resolvedMode,
          stayDays: breakdown.days
        })
        : null;
      const freeByStay = !!(pickupQuote && pickupQuote.freeByStay);
      const pickupFeeStoreLocationMissing = !!(
        needPickup && isDistanceMode && !storeHasLocation && !freeByStay
      );
      const waitingDistance = !!(
        needsDrivingDistance && !freeByStay
        && (distanceKm == null || distanceKm === '') && !distanceError
      );
      const pickupFeePending = needPickup && isDistanceMode && !freeByStay && (
        pickupFeeStoreLocationMissing
        || !hasPickupCoords
        || waitingDistance
        || !!distanceError
        || !canCalcDistancePickupFee(
          storeView, pickupLatitude, pickupLongitude, distanceKm, breakdown.days
        )
      );
      const pickupFeeReady = needPickup && (
        freeByStay
        || !isDistanceMode
        || (!pickupFeeStoreLocationMissing
          && canCalcDistancePickupFee(
            storeView, pickupLatitude, pickupLongitude, distanceKm, breakdown.days
          ))
      );
      const pickupFee = pickupFeeReady && pickupQuote && pickupQuote.ready ? pickupQuote.fee : 0;
      const grandTotalFee = boardingTotalFee + (pickupFeeReady ? pickupFee : 0);
      const totalDisplayReady = breakdown.ready && (!needPickup || pickupFeeReady);

      let pickupFeeStandard = '';
      let pickupDistanceText = '';
      let pickupFeeCalcText = '';
      let pickupFeePendingText = '';

      if (needPickup) {
        if (pickupFeeStoreLocationMissing) {
          pickupFeePendingText = '店铺未设置地图位置，无法按距离计算接送费，请联系商家';
        } else if (distanceError) {
          pickupFeePendingText = distanceError;
        } else if (waitingDistance) {
          pickupFeePendingText = '正在计算驾车导航距离…';
        } else if (pickupFeePending) {
          pickupFeePendingText = '选择接送地址后可显示导航距离与接送费';
        }

        if (pickupQuote && pickupQuote.ready) {
          pickupFeeStandard = `收费标准：${pickupQuote.standardText}`;
          if (pickupQuote.mode === 'distance' && pickupQuote.distanceText) {
            pickupDistanceText = resolvedMode === 'straight'
              ? `${pickupQuote.distanceText}（导航暂不可用，已按直线距离估算）`
              : `${pickupQuote.distanceText}（店铺至接送地址驾车距离）`;
          }
          if (pickupQuote.freeByStay) {
            pickupFeeCalcText = pickupQuote.calcText;
          } else if (pickupQuote.mode === 'flat') {
            pickupFeeCalcText = pickupQuote.legCount > 1
              ? `单程 ¥${pickupQuote.perLegFeeText} × ${pickupQuote.legCount} 程`
              : `单程 ¥${pickupQuote.perLegFeeText}`;
          } else {
            pickupFeeCalcText = pickupQuote.calcText;
          }
        } else if (!isDistanceMode) {
          const flatQuote = buildPickupFeeQuote(storeView, {
            ...pickupFlags,
            stayDays: breakdown.days
          });
          if (flatQuote.ready) {
            pickupFeeStandard = `收费标准：${flatQuote.standardText}`;
          }
        } else if (isDistanceMode && !pickupFeeStoreLocationMissing) {
          const perKmSummary = formatPickupPricingSummary(storeView);
          if (perKmSummary) {
            pickupFeeStandard = perKmSummary.replace('接送收费：', '收费标准：');
          }
        }
      }

      this.setData({
        feeReady: breakdown.ready,
        pickupFeePending,
        pickupFeeReady,
        pickupFeeStoreLocationMissing,
        pickupDrivingDistanceKm: distanceKm != null ? distanceKm : null,
        pickupDistanceMode: resolvedMode,
        pickupDistanceError: distanceError || '',
        totalDisplayReady,
        days: breakdown.days,
        daysText: breakdown.daysText,
        baseFee: breakdown.baseFee,
        dailyBreakdown: breakdown.dailyBreakdown,
        chargeSummary: breakdown.chargeSummary,
        basePrice,
        basePriceText: formatMoney(basePrice),
        boardingTotalFee,
        boardingTotalFeeText: formatMoney(boardingTotalFee),
        pickupFee,
        pickupFeeText: formatMoney(pickupFee),
        pickupFeeStandard,
        pickupDistanceText,
        pickupFeeCalcText,
        pickupFeePendingText,
        grandTotalFee,
        grandTotalFeeText: formatMoney(grandTotalFee),
        totalFee: grandTotalFee,
        totalFeeText: formatMoney(grandTotalFee)
      });
    };

    if (!needsDrivingDistance) {
      applyFeeUi(null, '', '');
      return;
    }

    if (drivingKm != null && drivingKm !== '') {
      applyFeeUi(drivingKm, '', pickupDistanceMode || 'driving');
      return;
    }

    applyFeeUi(null, '', '');
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

  _validateContact() {
    return validateReserveContact(this.data.contactName, this.data.contactPhone);
  },

  _validateBeforeContract() {
    const store = this.data.store;
    const {
      selectedPet, startDate, endDate, startTime, endTime, billingMode, roomType, feeReady
    } = this.data;

    const contactErr = this._validateContact();
    if (contactErr) return contactErr;

    if (!store || !store.store_id) return '请先通过店铺分享链接进入';
    if (!store.isOpen) return '店铺当前不可预约';
    if (!selectedPet) return '请选择宠物';
    if (!startDate || !endDate) return '请选择寄养时间';
    if (startDate < getTodayStr()) return '不能选择过去的日期';
    if (!startTime || !endTime) return '请选择入住和离店时间';
    if (billingMode === 'room' && !roomType) return '请选择房间';
    if (billingMode === 'room') {
      const rules = app.getStoreBillingRules();
      const room = findRoom(rules.roomPricing, roomType);
      if (!room || !supportsPetWeight(room, selectedPet.weight)) {
        return '请选择适合宠物体重的房间';
      }
    }
    if (!feeReady) return '请完成时间和费用选择';
    if (this.data.needPickup && this.data.pickupFeePending) {
      return this.data.pickupFeePendingText || '请先在地图选择接送地址以计算运费';
    }

    const needPickup = store && store.hasPickup && this.data.needPickup;
    if (needPickup) {
      const pickupErr = validatePickupInfo({
        needPickup: true,
        pickupAddress: this.data.pickupAddress,
        pickupLatitude: this.data.pickupLatitude,
        pickupLongitude: this.data.pickupLongitude,
        pickupContactPhone: this.data.pickupContactPhone,
        pickupTime: this.data.pickupTime || this.data.startTime,
        ...this._getPickupFlags()
      });
      if (pickupErr) return pickupErr;
    }

    const emergencyPhone = String(this.data.emergencyPhone || '').trim();
    if (emergencyPhone && !/^1\d{10}$/.test(emergencyPhone)) {
      return '紧急联系电话需为11位手机号';
    }

    return '';
  },

  _buildContractDraft() {
    const {
      selectedPet, startDate, endDate, startTime, endTime, days, totalFee,
      specialNeeds, needPickup, roomType, billingMode, contactName, contactPhone
    } = this.data;
    const store = this._getContractStore();
    const rules = app.getStoreBillingRules();
    const room = findRoom(rules.roomPricing, roomType);

    return buildContractDraft({
      store,
      pet: selectedPet,
      startDate,
      endDate,
      startTime,
      endTime,
      days,
      totalFee,
      deposit: store.deposit != null ? store.deposit : 0,
      specialNeeds,
      needPickup: store.hasPickup && needPickup,
      roomName: room ? room.name : '',
      billingMode,
      contactName,
      contactPhone
    });
  },

  onSubmit() {
    const err = this._validateBeforeContract();
    if (err) {
      showValidationAlert(err);
      return;
    }

    if (!this.data.agreedToContract || !this.data.signedContractDraft) {
      showValidationAlert('请先勾选并确认《宠物寄养服务电子协议》', '需要确认协议');
      return;
    }

    this._persistContactCache();
    this._doSubmitOrder();
  },

  _doSubmitOrder() {
    const {
      store,
      selectedPet, startDate, endDate, startTime, endTime, days, baseFee,
      extraList, specialNeeds, needPickup, roomType, billingMode,
      signedContractDraft, contactName, contactPhone, emergencyPhone
    } = this.data;

    let extrasFee = 0;
    extraList.filter((e) => e.checked).forEach((e) => {
      extrasFee += e.price * days;
    });
    const storeView = store || app.getUserStoreView() || {};
    const pickupFee = (storeView.hasPickup && needPickup)
      ? calcPickupShippingFee({
        store: storeView,
        ...this._getPickupFlags(),
        pickupLatitude: this.data.pickupLatitude,
        pickupLongitude: this.data.pickupLongitude,
        distanceKm: this.data.pickupDrivingDistanceKm,
        distanceMode: this.data.pickupDistanceMode || 'driving',
        stayDays: days
      })
      : 0;
    const boardingFee = baseFee + extrasFee;
    const finalTotalFee = boardingFee + pickupFee;

    const contractId = `ctr_${Date.now()}`;
    const contractPayload = {
      ...signedContractDraft,
      id: contractId,
      petName: selectedPet.name,
      petType: selectedPet.type,
      signed: true,
      signTime: signedContractDraft.signTime || new Date().toLocaleString('zh-CN'),
      signMethod: 'electronic'
    };

    const pickupPayload = buildPickupPayload({
      needPickup: store.hasPickup && needPickup,
      pickupAddress: this.data.pickupAddress,
      pickupLocationName: this.data.pickupLocationName,
      pickupLatitude: this.data.pickupLatitude,
      pickupLongitude: this.data.pickupLongitude,
      pickupContactPhone: this.data.pickupContactPhone,
      pickupTime: this.data.pickupTime || this.data.startTime,
      ...this._getPickupFlags()
    });

    const order = {
      petName: selectedPet.name,
      petType: selectedPet.type,
      petGender: selectedPet.gender,
      petAge: selectedPet.age,
      petId: selectedPet.id,
      petWeight: selectedPet.weight,
      petBreed: selectedPet.breed || '',
      petPhoto: selectedPet.photo || '',
      petSnapshot: buildPetSnapshot(selectedPet),
      contactName,
      contactPhone,
      emergencyPhone: String(emergencyPhone || '').trim(),
      ...pickupPayload,
      startDate,
      endDate,
      startTime,
      endTime,
      days,
      boardingFee,
      shippingFee: pickupFee,
      totalFee: finalTotalFee,
      basePrice: this.data.basePrice,
      deposit: store.deposit != null ? parseFloat(store.deposit) || 0 : 0,
      feeSnapshot: {
        basePrice: this.data.basePrice,
        dailyBreakdown: this.data.dailyBreakdown,
        chargeSummary: this.data.chargeSummary,
        daysText: this.data.daysText,
        pickupDistanceKm: this.data.pickupDrivingDistanceKm != null
          ? this.data.pickupDrivingDistanceKm
          : undefined,
        pickupDistanceMode: storeView.pickupPricingMode === 'distance'
          ? (this.data.pickupDistanceMode || 'driving')
          : undefined
      },
      extras: extraList.filter((e) => e.checked).map((e) => e.key),
      needPickup: store.hasPickup ? needPickup : false,
      specialNeeds,
      billingMode,
      roomType,
      roomName: (findRoom(app.getStoreBillingRules().roomPricing, roomType) || {}).name || '',
      serviceType: '寄养预约',
      status: 'pending',
      store_id: store.store_id,
      storeName: store.name || '',
      storeLogo: store.logo || '',
      storeAddress: store.address || '',
      contractId,
      contractSigned: true,
      contractSignTime: contractPayload.signTime,
      contractSnapshot: contractPayload
    };
    wx.showLoading({ title: '提交中' });
    app.saveOrder(order)
      .then((savedOrder) => {
        app.saveContract({
          ...contractPayload,
          orderId: savedOrder.id
        });
        return savedOrder;
      })
      .then(() => {
        wx.hideLoading();
        this.setData({ agreedToContract: false, signedContractDraft: null });
        app.globalData.signedContractDraft = null;
        app.globalData.contractSignDraft = null;
        this._afterReserveSuccess();
      })
      .catch((err) => {
        wx.hideLoading();
        const message = (err && err.message) || '提交失败';
        console.error('[预约] 提交订单失败', err);
        wx.showToast({ title: message, icon: 'none', duration: 3000 });
      });
  },

  _goOrdersAfterReserve() {
    wx.switchTab({ url: '/pages/orders/orders' });
  },

  _afterReserveSuccess() {
    const user = (app.globalData && app.globalData.userInfo) || {};
    if (isOaBound(user)) {
      wx.showToast({ title: '预约成功', icon: 'success' });
      setTimeout(() => this._goOrdersAfterReserve(), 700);
      return;
    }
    this.setData({ oaFollowSheetVisible: true });
  },

  onCloseOaFollowSheet() {
    this.setData({ oaFollowSheetVisible: false });
    this._goOrdersAfterReserve();
  },

  onOaFollowSheetFollowed() {
    // 从服务号返回后保留半屏，由用户点关闭再进订单
  },

  _openContractModal(signable) {
    const err = this._validateBeforeContract();
    if (err) {
      showValidationAlert(err, signable ? '无法确认协议' : '无法查看协议');
      return;
    }

    const contractDoc = this._buildContractDraft();
    app.globalData.contractSignDraft = contractDoc;
    this.setData({
      contractModalVisible: true,
      contractModalSignable: signable,
      contractDoc
    });
  },

  onOpenContractPreview() {
    this._openContractModal(false);
  },

  onOpenContractSign() {
    this._openContractModal(true);
  },

  onCloseContractModal() {
    this.setData({ contractModalVisible: false, contractModalSignable: false });
  },

  onConfirmContractSign() {
    this._persistContactCache();
    const doc = {
      ...this.data.contractDoc,
      signed: true,
      signTime: new Date().toLocaleString('zh-CN'),
      signMethod: 'electronic'
    };
    app.globalData.signedContractDraft = doc;
    this.setData({
      contractModalVisible: false,
      contractModalSignable: false,
      contractDoc: doc,
      agreedToContract: true,
      signedContractDraft: doc
    });
    wx.showToast({ title: '已确认协议', icon: 'success' });
  },

  onTapAgreeRow() {
    if (this.data.agreedToContract) {
      this.setData({ agreedToContract: false, signedContractDraft: null });
      app.globalData.signedContractDraft = null;
      return;
    }
    this.onOpenContractSign();
  },

  onPreviewRoomPhoto(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    const urls = (this.data.roomOptions || [])
      .map((room) => room && room.photo)
      .filter(Boolean);
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url]
    });
  },

  onPreviewNoticePhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.store && this.data.store.noticePhotos) || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onGoPets() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  }
});
