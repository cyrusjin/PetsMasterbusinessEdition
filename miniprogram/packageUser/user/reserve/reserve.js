const app = getApp();
const { formatMoney, buildChargeSummary } = require('../../../utils/billing');
const { buildRoomOptions, resolveRoomOptionsPhotos, findRoom, supportsPetWeight } = require('../../../utils/roomPricing');
const {
  buildCustomParentOptions,
  buildCustomChildOptions,
  resolveCustomOptionsPhotos,
  findCustomOption,
  normalizeCustomPricing
} = require('../../../utils/customPricing');
const timePicker = require('../../utils/timePicker');
const { buildPetSnapshot } = require('../../../utils/petSnapshot');
const { formatAgeText } = require('../../../utils/petAge');
const { buildContractDraft } = require('../../../utils/boardingContract');
const { showValidationAlert } = require('../../../utils/formAlert');
const {
  loadReserveContact,
  saveReserveContact,
  validateReserveContact,
  validateContactIdCard
} = require('../../utils/reserveContact');
const { validatePickupInfo, buildPickupPayload } = require('../../utils/pickupInfo');
const {
  calcPickupShippingFee,
  formatPickupPricingSummary,
  canCalcDistancePickupFee,
  buildPickupFeeQuote,
  parseStoreCoords,
  meetsPickupFreeStayDays
} = require('../../../utils/pickupPricing');
const {
  formatWashPricingSummary,
  calcWashFee,
  calcWashFeeForPets
} = require('../../../utils/washPricing');
const { resolveStorePickupDrivingDistance } = require('../../utils/mapDistance');
const {
  choosePickupLocation,
  formatLocationAddress,
  getPickupLocationValidationMessage
} = require('../../../utils/location');
const { isOaBound } = require('../../../utils/officialAccount');
const { calcMultiPetBoardingFees } = require('../../../utils/multiPetPricing');
const { findFirstPetsBookingConflict } = require('../../utils/bookingOverlap');
const {
  buildValueAddedSelectList,
  calcValueAddedFee,
  snapshotValueAddedServices,
  resolveValueAddedSelectPhotos,
  resolveStoreValueAddedServices
} = require('../../../utils/valueAddedServices');
const {
  normalizeReceptionRange,
  formatReceptionRangeText,
  isPetAllowedByReceptionRange,
  getReceptionRangeRejectMessage
} = require('../../../utils/receptionRange');

/** 超过该字数时预览截断，点击查看完整 */
const NOTICE_EXPAND_CHARS = 90;

function annotatePetsByReceptionRange(pets, receptionRange) {
  const allowed = normalizeReceptionRange(receptionRange);
  const hasRestriction = allowed.length > 0;
  return (pets || []).map((pet) => {
    const receptionAllowed = isPetAllowedByReceptionRange(pet && pet.type, allowed);
    return {
      ...pet,
      receptionAllowed,
      receptionBlocked: hasRestriction && !receptionAllowed
    };
  });
}

function findReceptionRejectError(pets, receptionRange) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  for (let i = 0; i < list.length; i += 1) {
    const pet = list[i];
    if (isPetAllowedByReceptionRange(pet.type, receptionRange)) continue;
    const rangeText = formatReceptionRangeText(receptionRange);
    const name = pet.name || '宠物';
    const type = pet.type || '该类型';
    if (rangeText) {
      return `「${name}」为${type}，本店仅接待：${rangeText}`;
    }
    return `「${name}」不在本店接待范围内`;
  }
  return '';
}

function isNoticeExpandable(text) {
  return String(text || '').trim().length > NOTICE_EXPAND_CHARS;
}

const SPECIAL_NEED_GUIDE_LABELS = ['日常喂食习惯', '遛弯习惯', '宠物性格', '特殊行为习惯'];

function buildSpecialNeedGuides(specialNeeds) {
  const text = String(specialNeeds || '');
  return SPECIAL_NEED_GUIDE_LABELS.map((label) => {
    const prefix = `${label}：`;
    const active = text.split('\n').some((line) => {
      const trimmed = line.trim();
      return trimmed === label || trimmed.indexOf(prefix) === 0 || trimmed.indexOf(`${label}:`) === 0;
    });
    return { label, active };
  });
}

function appendSpecialNeedGuide(specialNeeds, label) {
  const prefix = `${label}：`;
  const text = String(specialNeeds || '');
  const exists = text.split('\n').some((line) => {
    const trimmed = line.trim();
    return trimmed === label || trimmed.indexOf(prefix) === 0 || trimmed.indexOf(`${label}:`) === 0;
  });
  if (exists) return text;
  if (!text.trim()) return prefix;
  return `${text.endsWith('\n') ? text : `${text}\n`}${prefix}`;
}

function getTodayStr() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSelectedPetIds(selectedPets) {
  const ids = {};
  (selectedPets || []).forEach((p) => {
    if (p && p.id) ids[p.id] = true;
  });
  return ids;
}

function findBillingOption(rules, optionId) {
  const mode = (rules && rules.billingMode) || '';
  if (mode === 'custom') {
    return findCustomOption((rules && rules.customPricing) || [], optionId);
  }
  return findRoom((rules && rules.roomPricing) || [], optionId);
}

function prunePetRoomTypes(pets, petRoomTypes, rules) {
  const src = petRoomTypes && typeof petRoomTypes === 'object' ? petRoomTypes : {};
  const next = {};
  const mode = (rules && rules.billingMode) || '';
  (pets || []).forEach((pet) => {
    if (!pet || !pet.id) return;
    const roomType = src[pet.id];
    if (!roomType) return;
    if (mode === 'custom') {
      const option = findCustomOption((rules && rules.customPricing) || [], roomType);
      if (option) next[pet.id] = roomType;
      return;
    }
    const room = findRoom((rules && rules.roomPricing) || [], roomType);
    if (room && supportsPetWeight(room, pet.weight)) {
      next[pet.id] = roomType;
    }
  });
  return next;
}

function prunePetCustomParents(pets, petCustomParents, petRoomTypes, rules) {
  const src = petCustomParents && typeof petCustomParents === 'object' ? petCustomParents : {};
  const types = petRoomTypes && typeof petRoomTypes === 'object' ? petRoomTypes : {};
  const next = {};
  const pricing = (rules && rules.customPricing) || [];
  const parents = normalizeCustomPricing(pricing);
  (pets || []).forEach((pet) => {
    if (!pet || !pet.id) return;
    let parentId = String(src[pet.id] || '').trim();
    if (!parentId && types[pet.id]) {
      const option = findCustomOption(pricing, types[pet.id]);
      if (option && option.parentId) parentId = option.parentId;
      else if (option && !option.isChild) parentId = option.id;
    }
    if (!parentId) return;
    const parent = parents.find((item) => item.id === parentId);
    if (parent) next[pet.id] = parentId;
  });
  return next;
}

function buildPetRoomSections(pets, petRoomTypes, petCustomParents, rules) {
  const map = petRoomTypes && typeof petRoomTypes === 'object' ? petRoomTypes : {};
  const parentMap = petCustomParents && typeof petCustomParents === 'object' ? petCustomParents : {};
  const mode = (rules && rules.billingMode) || '';
  const pricing = (rules && rules.customPricing) || [];
  return (pets || []).filter(Boolean).map((pet) => {
    const base = {
      petId: pet.id,
      petName: pet.name || '',
      petMeta: `${pet.type || ''} · ${formatAgeText(pet) || '—'} · ${pet.weight != null ? pet.weight : '—'}kg`,
      roomType: map[pet.id] || ''
    };
    if (mode !== 'custom') {
      return {
        ...base,
        parentId: '',
        selectedParentName: '',
        showChildren: false,
        needsTwoStep: false,
        parentOptions: [],
        childOptions: [],
        roomOptions: buildRoomOptions((rules && rules.roomPricing) || [], pet.weight)
      };
    }

    const parentOptions = buildCustomParentOptions(pricing);
    let parentId = String(parentMap[pet.id] || '').trim();
    if (!parentId && map[pet.id]) {
      const selected = findCustomOption(pricing, map[pet.id]);
      if (selected && selected.parentId) parentId = selected.parentId;
      else if (selected && !selected.isChild) parentId = selected.id;
    }
    const parent = parentOptions.find((item) => item.id === parentId) || null;
    const childOptions = parent && parent.hasChildren
      ? buildCustomChildOptions(pricing, parentId)
      : [];
    const needsTwoStep = parentOptions.some((item) => item.hasChildren);
    const parentNames = parentOptions.map((item) => item.name);
    const parentIndex = parent
      ? parentOptions.findIndex((item) => item.id === parent.id)
      : -1;
    const selectedLeaf = parent && !parent.hasChildren
      ? findCustomOption(pricing, parent.id)
      : null;
    return {
      ...base,
      parentId,
      selectedParentName: parent ? parent.name : '',
      selectedParentPrice: selectedLeaf ? selectedLeaf.price : null,
      showChildren: !!(parent && parent.hasChildren),
      needsTwoStep,
      parentNames,
      parentIndex: parentIndex >= 0 ? parentIndex : 0,
      parentSelected: parentIndex >= 0,
      parentOptions,
      childOptions,
      // 兼容旧照片解析：合并大项+子项
      roomOptions: parentOptions.concat(childOptions)
    };
  });
}

function allPetsHaveRoom(pets, petRoomTypes) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  const map = petRoomTypes && typeof petRoomTypes === 'object' ? petRoomTypes : {};
  return list.length > 0 && list.every((p) => !!map[p.id]);
}

function needsOptionSelect(billingMode) {
  return billingMode === 'room' || billingMode === 'custom';
}

function formatPetRoomSummary(pets, petRoomTypes, rules) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  const map = petRoomTypes && typeof petRoomTypes === 'object' ? petRoomTypes : {};
  return list.map((pet) => {
    const option = findBillingOption(rules, map[pet.id]);
    const roomName = option ? option.name : '';
    if (!roomName) return '';
    return list.length > 1 ? `${pet.name}：${roomName}` : roomName;
  }).filter(Boolean).join('；');
}

function resolveOptionPhotos(options, billingMode) {
  if (billingMode === 'custom') {
    return resolveCustomOptionsPhotos(options);
  }
  return resolveRoomOptionsPhotos(options);
}

Page({
  data: {
    store: null,
    pets: [],
    receptionRangeText: '',
    hasReceptionRestriction: false,
    selectablePetCount: 0,
    selectedPets: [],
    selectedPetIds: {},
    selectedPet: null,
    multiPetFeeItems: [],
    multiPetDiscountTip: '',
    hasMultiPetDiscount: false,
    multiPetDiscountTotalText: '',
    feeBreakdownTitle: '费用明细',
    contactName: '',
    contactPhone: '',
    contactIdCard: '',
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
    petRoomTypes: {},
    petCustomParents: {},
    petRoomSections: [],
    roomsReady: false,
    valueAddedList: [],
    specialNeeds: '',
    specialNeedGuides: buildSpecialNeedGuides(''),
    needPickup: false,
    needWash: false,
    washFee: 0,
    washFeeText: '0',
    washFeeReady: false,
    washFeeCalcText: '',
    washPricingSummary: '',
    valueAddedFee: 0,
    valueAddedFeeText: '0',
    hasValueAddedSelected: false,
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
    contractDoc: {},
    pickupNoticeExpandable: false,
    washNoticeExpandable: false,
    boardingNoticeExpandable: false,
    noticePreviewVisible: false,
    noticePreviewTitle: '',
    noticePreviewContent: ''
  },

  onLoad(options) {
    this._pickupTimeTouched = false;
    this._pageReady = false;
    this._choosingPickupLocation = false;
    const storeId = String((options && options.store_id) || '').trim();
    this._entryStoreId = storeId;
  },

  onShow() {
    app.ensureCloudAndLogin()
      .then(() => {
        if (this._choosingPickupLocation) {
          this._choosingPickupLocation = false;
          return;
        }
        const entryStoreId = this._entryStoreId;
        if (entryStoreId) {
          this._entryStoreId = '';
          return app.enterUserStore(entryStoreId, { forceData: true })
            .then(() => this._loadPage({ preserveForm: !!this._pageReady }));
        }
        return this._loadPage({ preserveForm: !!this._pageReady });
      });
  },

  _setPetRoomSections(pets, petRoomTypes, extraPatch) {
    const rules = app.getStoreBillingRules();
    const pruned = prunePetRoomTypes(pets, petRoomTypes, rules);
    const parents = prunePetCustomParents(
      pets,
      (extraPatch && extraPatch.petCustomParents != null)
        ? extraPatch.petCustomParents
        : this.data.petCustomParents,
      pruned,
      rules
    );
    const petRoomSections = buildPetRoomSections(pets, pruned, parents, rules);
    const patch = {
      ...(extraPatch || {}),
      petRoomTypes: pruned,
      petCustomParents: parents,
      petRoomSections,
      roomsReady: allPetsHaveRoom(pets, pruned)
    };
    this.setData(patch);
    return this._refreshPetRoomSectionPhotos(petRoomSections, rules.billingMode);
  },

  _refreshPetRoomSectionPhotos(petRoomSections, billingMode) {
    const sections = Array.isArray(petRoomSections) ? petRoomSections : [];
    const mode = billingMode || this.data.billingMode;
    const token = (this._roomPhotoToken = (this._roomPhotoToken || 0) + 1);
    return Promise.all(sections.map((section) => {
      if (mode === 'custom') {
        return Promise.all([
          resolveOptionPhotos(section.parentOptions || [], mode),
          resolveOptionPhotos(section.childOptions || [], mode)
        ]).then(([parentOptions, childOptions]) => ({
          ...section,
          parentOptions,
          childOptions,
          roomOptions: parentOptions.concat(childOptions)
        }));
      }
      return resolveOptionPhotos(section.roomOptions || [], mode).then((resolved) => ({
        ...section,
        roomOptions: resolved
      }));
    })).then((resolvedSections) => {
      if (token !== this._roomPhotoToken) return;
      this.setData({ petRoomSections: resolvedSections });
    }).catch(() => {});
  },

  _applyPetsSelection(selectedPets) {
    this._invalidateSignedContract();
    const list = Array.isArray(selectedPets) ? selectedPets.filter(Boolean) : [];
    const selectedPet = list[0] || null;
    const selectedPetIds = buildSelectedPetIds(list);
    this._setPetRoomSections(list, this.data.petRoomTypes, {
      selectedPets: list,
      selectedPet,
      selectedPetIds
    });
    this.calcFee();
  },

  _loadPage(options = {}) {
    const preserveForm = !!options.preserveForm;
    const prevForm = preserveForm ? {
      selectedPetIds: (this.data.selectedPets || []).map((p) => p.id),
      startDate: this.data.startDate,
      endDate: this.data.endDate,
      startTime: this.data.startTime,
      endTime: this.data.endTime,
      petRoomTypes: { ...(this.data.petRoomTypes || {}) },
      petCustomParents: { ...(this.data.petCustomParents || {}) },
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
      emergencyPhone: this.data.emergencyPhone,
      contactIdCard: this.data.contactIdCard
    } : null;

    const cachedContact = loadReserveContact();
    const userInfo = app.globalData.userInfo || {};
    const storeId = app.getStoreId();
    const loadStore = storeId && app.globalData.env
      ? app.bindStore(storeId, { force: true, syncUser: false })
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
      const valueAddedList = buildValueAddedSelectList(
        resolveStoreValueAddedServices(store) || rules.valueAddedServices,
        preserveForm ? this.data.valueAddedList : []
      );
      const chargeSummary = buildChargeSummary(rules);

      return app.loadPets().then((rawPets) => {
        const receptionRange = normalizeReceptionRange(store.receptionRange || store.range);
        const receptionRangeText = formatReceptionRangeText(receptionRange)
          || store.receptionRangeText
          || '';
        const hasReceptionRestriction = receptionRange.length > 0;
        const pets = annotatePetsByReceptionRange(
          (rawPets || []).map((pet) => ({
            ...pet,
            ageText: formatAgeText(pet) || (pet.age != null ? `${pet.age}岁` : '—')
          })),
          receptionRange
        );
        const selectablePets = pets.filter((pet) => !pet.receptionBlocked);
        let selectedPets = [];
        if (prevForm && prevForm.selectedPetIds && prevForm.selectedPetIds.length) {
          selectedPets = prevForm.selectedPetIds
            .map((id) => selectablePets.find((p) => p.id === id))
            .filter(Boolean);
        }
        if (!selectedPets.length && selectablePets.length > 0) {
          selectedPets = [selectablePets[0]];
        }
        const selectedPet = selectedPets[0] || null;
        const selectedPetIds = buildSelectedPetIds(selectedPets);

        const petRoomTypes = prunePetRoomTypes(
          selectedPets,
          preserveForm && prevForm ? prevForm.petRoomTypes : {},
          rules
        );
        const petCustomParents = prunePetCustomParents(
          selectedPets,
          preserveForm && prevForm ? (prevForm.petCustomParents || {}) : {},
          petRoomTypes,
          rules
        );
        const petRoomSections = buildPetRoomSections(
          selectedPets,
          petRoomTypes,
          petCustomParents,
          rules
        );

        const patch = {
          store,
          pets,
          receptionRangeText,
          hasReceptionRestriction,
          selectablePetCount: selectablePets.length,
          valueAddedList,
          billingMode: rules.billingMode || 'weight',
          pickupPricingSummary: formatPickupPricingSummary(store),
          washPricingSummary: formatWashPricingSummary(store),
          pickupNoticeExpandable: isNoticeExpandable(store.pickupNotice),
          washNoticeExpandable: isNoticeExpandable(store.washNotice),
          boardingNoticeExpandable: isNoticeExpandable(store.notice),
          chargeSummary,
          minDate: getTodayStr(),
          contactName: cachedContact.contactName || this.data.contactName,
          contactPhone: cachedContact.contactPhone || this.data.contactPhone,
          contactIdCard: cachedContact.contactIdCard || this.data.contactIdCard || userInfo.idCard || '',
          selectedPets,
          selectedPetIds,
          selectedPet,
          petRoomTypes,
          petCustomParents,
          petRoomSections,
          roomsReady: allPetsHaveRoom(selectedPets, petRoomTypes)
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
            emergencyPhone: prevForm.emergencyPhone,
            contactIdCard: prevForm.contactIdCard
          });
        }
        patch.specialNeedGuides = buildSpecialNeedGuides(patch.specialNeeds || this.data.specialNeeds);

        this.setData(patch);
        this._pageReady = true;
        this.calcFee();
        return Promise.all([
          this._refreshPetRoomSectionPhotos(petRoomSections, rules.billingMode),
          this._refreshValueAddedPhotos(valueAddedList)
        ]);
      });
    });
  },

  _refreshValueAddedPhotos(list) {
    return resolveValueAddedSelectPhotos(list).then((resolved) => {
      if (!resolved || !resolved.length) return;
      this.setData({ valueAddedList: resolved });
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
    saveReserveContact(this.data.contactName, this.data.contactPhone, this.data.contactIdCard);
  },

  onContactNameInput(e) {
    this._invalidateSignedContract();
    this.setData({ contactName: (e.detail.value || '').trim() });
  },

  onContactPhoneInput(e) {
    this._invalidateSignedContract();
    this.setData({ contactPhone: (e.detail.value || '').trim() });
  },

  onContactIdCardInput(e) {
    this._invalidateSignedContract();
    this.setData({ contactIdCard: (e.detail.value || '').trim() });
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
    if (!pet) return;
    if (pet.receptionBlocked) {
      const store = this.data.store || {};
      const msg = getReceptionRangeRejectMessage(
        pet.type,
        store.receptionRange || store.range || this.data.receptionRangeText
      );
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
      return;
    }
    let selectedPets = [...(this.data.selectedPets || [])];
    const idx = selectedPets.findIndex((p) => p.id === id);
    if (idx >= 0) {
      selectedPets.splice(idx, 1);
    } else {
      selectedPets.push(pet);
    }
    this._applyPetsSelection(selectedPets);
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

  onValueAddedChange(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.valueAddedList.map((item) => (
      item.id === id ? { ...item, checked: !!e.detail.value } : item
    ));
    this.setData({ valueAddedList: list });
    this.calcFee();
  },

  onSpecialInput(e) {
    const specialNeeds = e.detail.value;
    this.setData({
      specialNeeds,
      specialNeedGuides: buildSpecialNeedGuides(specialNeeds)
    });
  },

  onTapSpecialGuide(e) {
    const label = e.currentTarget.dataset.label;
    if (!label) return;
    const specialNeeds = appendSpecialNeedGuide(this.data.specialNeeds, label);
    this.setData({
      specialNeeds,
      specialNeedGuides: buildSpecialNeedGuides(specialNeeds)
    });
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

  onWashChange(e) {
    this.setData({ needWash: !!e.detail.value });
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

  onCustomParentChange(e) {
    const petId = e.currentTarget.dataset.petId;
    const index = Number(e.detail.value);
    const { selectedPets, petRoomSections } = this.data;
    if (!selectedPets || !selectedPets.length) {
      wx.showToast({ title: '请先选择宠物', icon: 'none' });
      return;
    }
    const section = (petRoomSections || []).find((item) => item.petId === petId);
    const parent = section && (section.parentOptions || [])[index];
    if (!parent) {
      wx.showToast({ title: '请选择有效的收费项目', icon: 'none' });
      return;
    }
    this._applyCustomParent(petId, parent.id);
  },

  _applyCustomParent(petId, parentId) {
    const { selectedPets, petRoomTypes, petCustomParents } = this.data;
    const rules = app.getStoreBillingRules();
    const pricing = rules.customPricing || [];
    const parents = buildCustomParentOptions(pricing);
    const parent = parents.find((item) => item.id === parentId);
    if (!parent) {
      wx.showToast({ title: '请选择有效的收费项目', icon: 'none' });
      return;
    }
    const nextParents = { ...(petCustomParents || {}), [petId]: parent.id };
    const nextTypes = { ...(petRoomTypes || {}) };
    if (parent.hasChildren) {
      const current = findCustomOption(pricing, nextTypes[petId]);
      if (!current || current.parentId !== parent.id) {
        delete nextTypes[petId];
      }
    } else {
      nextTypes[petId] = parent.id;
    }
    this._setPetRoomSections(selectedPets, nextTypes, { petCustomParents: nextParents });
    this._invalidateSignedContract();
    this.calcFee();
  },

  onRoomTypeSelect(e) {
    const roomType = e.currentTarget.dataset.type;
    const petId = e.currentTarget.dataset.petId;
    const level = e.currentTarget.dataset.level || 'option';
    const { selectedPets, petRoomTypes, petCustomParents, petRoomSections, billingMode } = this.data;
    if (!selectedPets || !selectedPets.length) {
      wx.showToast({ title: '请先选择宠物', icon: 'none' });
      return;
    }
    const pet = (selectedPets || []).find((p) => p.id === petId);
    if (!pet) {
      wx.showToast({ title: '请先选择宠物', icon: 'none' });
      return;
    }
    const section = (petRoomSections || []).find((item) => item.petId === petId);
    const rules = app.getStoreBillingRules();

    if (billingMode === 'custom') {
      if (level === 'parent') {
        this._applyCustomParent(petId, roomType);
        return;
      }

      const option = findCustomOption(rules.customPricing || [], roomType);
      if (!option) {
        wx.showToast({ title: '请选择有效的子项目', icon: 'none' });
        return;
      }
      const nextTypes = { ...(petRoomTypes || {}), [petId]: roomType };
      const nextParents = { ...(petCustomParents || {}) };
      if (option.parentId) nextParents[petId] = option.parentId;
      this._setPetRoomSections(selectedPets, nextTypes, { petCustomParents: nextParents });
      this._invalidateSignedContract();
      this.calcFee();
      return;
    }

    const roomOption = section && (section.roomOptions || []).find((item) => item.id === roomType);
    const rawRoom = findRoom(rules.roomPricing, roomType);
    if (!rawRoom || !supportsPetWeight(rawRoom, pet.weight)) {
      wx.showToast({ title: '宠物体重超出该房间限制', icon: 'none' });
      return;
    }
    if (roomOption && roomOption.disabled) {
      wx.showToast({ title: '宠物体重超出该房间限制', icon: 'none' });
      return;
    }
    const nextTypes = { ...(petRoomTypes || {}), [petId]: roomType };
    this._setPetRoomSections(selectedPets, nextTypes);
    this._invalidateSignedContract();
    this.calcFee();
  },

  _resetFeeState(chargeSummary) {
    this._multiPetFeeResult = null;
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
      washFee: 0,
      washFeeText: '0',
      washFeeReady: false,
      washFeeCalcText: '',
      valueAddedFee: 0,
      valueAddedFeeText: '0',
      hasValueAddedSelected: false,
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
      totalDisplayReady: false,
      multiPetFeeItems: [],
      multiPetDiscountTip: '',
      hasMultiPetDiscount: false,
      multiPetDiscountTotalText: '',
      feeBreakdownTitle: '费用明细'
    });
  },

  calcFee() {
    const {
      selectedPets, startDate, endDate, startTime, endTime, valueAddedList, needPickup, needWash,
      petRoomTypes, billingMode, store, pickupLatitude, pickupLongitude,
      pickupDrivingDistanceKm, pickupDistanceMode
    } = this.data;
    const rules = app.getStoreBillingRules();
    const chargeSummary = buildChargeSummary(rules);
    const pickupFlags = this._getPickupFlags();
    const feeToken = (this._feeCalcToken = (this._feeCalcToken || 0) + 1);
    const pets = Array.isArray(selectedPets) ? selectedPets.filter(Boolean) : [];

    if (!pets.length || !startDate || !endDate || !startTime || !endTime) {
      this._resetFeeState(chargeSummary);
      return;
    }

    if (needsOptionSelect(billingMode) && !allPetsHaveRoom(pets, petRoomTypes)) {
      this._resetFeeState(chargeSummary);
      return;
    }

    let extrasFeePerDay = 0;

    const multiResult = calcMultiPetBoardingFees({
      pets,
      rules,
      startDate,
      endDate,
      startTime,
      endTime,
      petRoomTypes,
      extrasFeePerDay
    });
    this._multiPetFeeResult = multiResult;

    const primaryItem = multiResult.items.find((item) => item.isPrimary) || multiResult.items[0];
    const breakdown = primaryItem.breakdown;
    const boardingTotalFee = multiResult.boardingTotal;
    const basePrice = primaryItem.basePrice;
    const multiPetFeeItems = multiResult.items.map((item) => {
      const option = findBillingOption(rules, item.roomType);
      return {
        petId: item.pet.id,
        name: item.pet.name,
        roomName: option ? option.name : '',
        boardingFeeText: formatMoney(item.boardingFee),
        discountAmountText: item.discountAmount > 0 ? formatMoney(item.discountAmount) : '',
        isPrimary: item.isPrimary
      };
    });
    const feeBreakdownTitle = multiResult.items.length > 1
      ? '费用明细'
      : `费用明细（¥${formatMoney(basePrice)}/天）`;
    const storeView = store || app.getUserStoreView() || {};
    const isDistanceMode = storeView.pickupPricingMode === 'distance';
    const storeHasLocation = !!parseStoreCoords(storeView);
    const hasPickupCoords = !!(pickupLatitude && pickupLongitude);
    const stayMayFree = !!(needPickup && meetsPickupFreeStayDays(storeView, breakdown.days));
    const needsDrivingDistance = !!(
      needPickup && storeHasLocation && hasPickupCoords && (isDistanceMode || stayMayFree)
    );
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
      const needsDistanceForFee = !!(isDistanceMode || stayMayFree);
      const pickupFeeStoreLocationMissing = !!(
        needPickup && needsDistanceForFee && !storeHasLocation && !freeByStay
      );
      const waitingDistance = !!(
        needsDrivingDistance && !freeByStay
        && (distanceKm == null || distanceKm === '') && !distanceError
      );
      const pickupFeePending = needPickup && needsDistanceForFee && !freeByStay && (
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
        || !needsDistanceForFee
        || (!pickupFeeStoreLocationMissing
          && canCalcDistancePickupFee(
            storeView, pickupLatitude, pickupLongitude, distanceKm, breakdown.days
          ))
      );
      const pickupFee = pickupFeeReady && pickupQuote && pickupQuote.ready ? pickupQuote.fee : 0;
      const washQuote = calcWashFeeForPets({
        store: storeView,
        pets,
        stayDays: breakdown.days,
        needWash: !!(needWash && storeView.hasWash)
      });
      const washFee = washQuote.ready ? washQuote.fee : 0;
      const washFeeReady = !!(needWash && storeView.hasWash && washQuote.ready);
      const washFeeCalcText = washFeeReady ? (washQuote.text || '') : '';
      const valueAddedQuote = calcValueAddedFee(valueAddedList);
      const valueAddedFee = valueAddedQuote.fee;
      const hasValueAddedSelected = valueAddedQuote.items.length > 0;
      const grandTotalFee = boardingTotalFee
        + (pickupFeeReady ? pickupFee : 0)
        + (washFeeReady ? washFee : 0)
        + valueAddedFee;
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
          if (pickupQuote.distanceText) {
            pickupDistanceText = resolvedMode === 'straight'
              ? `${pickupQuote.distanceText}（导航暂不可用，已按直线距离估算）`
              : `${pickupQuote.distanceText}（店铺至接送地址驾车距离）`;
          }
          if (pickupQuote.freeByStay || pickupQuote.freePartial) {
            pickupFeeCalcText = pickupQuote.calcText;
          } else if (pickupQuote.mode === 'flat') {
            pickupFeeCalcText = pickupQuote.legCount > 1
              ? `单程 ¥${pickupQuote.perLegFeeText} × ${pickupQuote.legCount} 程`
              : `单程 ¥${pickupQuote.perLegFeeText}`;
          } else {
            pickupFeeCalcText = pickupQuote.calcText;
          }
        } else if (!needsDistanceForFee) {
          const flatQuote = buildPickupFeeQuote(storeView, {
            ...pickupFlags,
            stayDays: breakdown.days
          });
          if (flatQuote.ready) {
            pickupFeeStandard = `收费标准：${flatQuote.standardText}`;
          }
        } else if (needsDistanceForFee && !pickupFeeStoreLocationMissing) {
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
        washFee,
        washFeeText: formatMoney(washFee),
        washFeeReady,
        washFeeCalcText,
        valueAddedFee,
        valueAddedFeeText: formatMoney(valueAddedFee),
        hasValueAddedSelected,
        grandTotalFee,
        grandTotalFeeText: formatMoney(grandTotalFee),
        totalFee: grandTotalFee,
        totalFeeText: formatMoney(grandTotalFee),
        multiPetFeeItems,
        multiPetDiscountTip: multiResult.discountTip || '',
        hasMultiPetDiscount: multiResult.hasDiscount,
        multiPetDiscountTotalText: multiResult.hasDiscount ? multiResult.discountTotalText : '',
        feeBreakdownTitle
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
    const contactErr = validateReserveContact(this.data.contactName, this.data.contactPhone);
    if (contactErr) return contactErr;
    return validateContactIdCard(this.data.contactIdCard);
  },

  _validateBeforeContract() {
    const store = this.data.store;
    const {
      selectedPets, startDate, endDate, startTime, endTime, billingMode, petRoomTypes, feeReady
    } = this.data;
    const pets = Array.isArray(selectedPets) ? selectedPets.filter(Boolean) : [];

    const contactErr = this._validateContact();
    if (contactErr) return contactErr;

    if (!store || !store.store_id) return '请先通过店铺分享链接进入';
    if (!store.isOpen) return '店铺当前不可预约';
    if (!pets.length) return '请选择宠物';
    const receptionErr = findReceptionRejectError(
      pets,
      store.receptionRange || store.range || this.data.receptionRangeText
    );
    if (receptionErr) return receptionErr;
    if (!startDate || !endDate) return '请选择寄养时间';
    if (startDate < getTodayStr()) return '不能选择过去的日期';
    if (!startTime || !endTime) return '请选择入住和离店时间';
    if (startDate === endDate && endTime <= startTime) {
      return '当日寄养的离店时间需晚于入住时间';
    }
    if (needsOptionSelect(billingMode)) {
      if (!allPetsHaveRoom(pets, petRoomTypes)) {
        if (billingMode === 'custom') {
          const waitingChild = (this.data.petRoomSections || []).some(
            (section) => section && section.showChildren && !section.roomType
          );
          if (waitingChild) {
            return pets.length > 1 ? '请为每只宠物选择子项目' : '请选择子项目';
          }
          return pets.length > 1 ? '请为每只宠物选择收费项目' : '请选择收费项目';
        }
        return pets.length > 1 ? '请为每只宠物选择房间' : '请选择房间';
      }
      const rules = app.getStoreBillingRules();
      for (let i = 0; i < pets.length; i += 1) {
        const pet = pets[i];
        if (billingMode === 'custom') {
          const option = findCustomOption(rules.customPricing, petRoomTypes[pet.id]);
          if (!option) {
            return `请为「${pet.name || '宠物'}」选择收费项目`;
          }
        } else {
          const room = findRoom(rules.roomPricing, petRoomTypes[pet.id]);
          if (!room || !supportsPetWeight(room, pet.weight)) {
            return `请为「${pet.name || '宠物'}」选择适合体重的房间`;
          }
        }
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

    const overlapErr = findFirstPetsBookingConflict(
      typeof app.getOrders === 'function' ? app.getOrders() : [],
      pets,
      { startDate, endDate, startTime, endTime }
    );
    if (overlapErr) return overlapErr;

    return '';
  },

  _buildContractDraft() {
    const {
      selectedPets, selectedPet, startDate, endDate, startTime, endTime, days, grandTotalFee,
      specialNeeds, needPickup, petRoomTypes, billingMode, contactName, contactPhone, contactIdCard
    } = this.data;
    const store = this._getContractStore();
    const rules = app.getStoreBillingRules();
    const pets = Array.isArray(selectedPets) ? selectedPets.filter(Boolean) : [];

    return buildContractDraft({
      store,
      pet: selectedPet || pets[0] || null,
      pets,
      startDate,
      endDate,
      startTime,
      endTime,
      days,
      totalFee: grandTotalFee,
      deposit: store.deposit != null ? store.deposit : 0,
      specialNeeds,
      needPickup: store.hasPickup && needPickup,
      roomName: formatPetRoomSummary(pets, petRoomTypes, rules),
      billingMode,
      contactName,
      contactPhone,
      contactIdCard
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
    const { selectedPets, startDate, endDate, startTime, endTime } = this.data;

    const refreshOrders = typeof app.loadOrders === 'function'
      ? app.loadOrders({ force: true }).catch(() => (typeof app.getOrders === 'function' ? app.getOrders() : []))
      : Promise.resolve(typeof app.getOrders === 'function' ? app.getOrders() : []);

    refreshOrders.then((orders) => {
      const pets = Array.isArray(selectedPets) ? selectedPets.filter(Boolean) : [];
      const overlapErr = findFirstPetsBookingConflict(
        orders || [],
        pets,
        { startDate, endDate, startTime, endTime }
      );
      if (overlapErr) {
        showValidationAlert(overlapErr);
        return;
      }
      this._submitOrdersAfterOverlapCheck();
    });
  },

  _submitOrdersAfterOverlapCheck() {
    const {
      store,
      selectedPets, startDate, endDate, startTime, endTime, days,
      valueAddedList, specialNeeds, needPickup, needWash, petRoomTypes, billingMode,
      signedContractDraft, contactName, contactPhone, contactIdCard, emergencyPhone
    } = this.data;

    const rules = app.getStoreBillingRules();
    let multiResult = this._multiPetFeeResult;
    if (!multiResult) {
      multiResult = calcMultiPetBoardingFees({
        pets: selectedPets,
        rules,
        startDate,
        endDate,
        startTime,
        endTime,
        petRoomTypes,
        extrasFeePerDay: 0
      });
      this._multiPetFeeResult = multiResult;
    }

    const items = multiResult.items || [];
    const orderGroupId = `og_${Date.now()}`;
    const petCountInGroup = items.length;
    const storeView = store || app.getUserStoreView() || {};
    const deposit = store.deposit != null ? parseFloat(store.deposit) || 0 : 0;
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
    const signTime = signedContractDraft.signTime || new Date().toLocaleString('zh-CN');
    const valueAddedQuote = calcValueAddedFee(valueAddedList);
    const valueAddedSnapshot = snapshotValueAddedServices(valueAddedList);
    const valueAddedFeeTotal = valueAddedQuote.fee;

    const buildOrderForItem = (item, index) => {
      const pet = item.pet;
      const isPrimary = item.isPrimary;
      // 接送/增值只挂主单，同组多宠只收一次接送费
      const shippingFee = isPrimary ? pickupFee : 0;
      const orderNeedWash = !!(storeView.hasWash && needWash);
      const washQuote = calcWashFee({
        store: storeView,
        petWeight: pet.weight,
        stayDays: days,
        needWash: orderNeedWash
      });
      const washFee = orderNeedWash ? washQuote.fee : 0;
      const valueAddedFee = isPrimary ? valueAddedFeeTotal : 0;
      const orderValueAddedServices = isPrimary ? valueAddedSnapshot : [];
      const orderBoardingFee = item.boardingFee;
      const orderTotalFee = orderBoardingFee + shippingFee + washFee + valueAddedFee;
      const contractId = `ctr_${Date.now()}_${index}`;
      const roomType = item.roomType || (petRoomTypes && petRoomTypes[pet.id]) || '';
      const roomName = (findBillingOption(rules, roomType) || {}).name || '';

      const contractPayload = {
        ...buildContractDraft({
          store: this._getContractStore(),
          pet,
          pets: [pet],
          startDate,
          endDate,
          startTime,
          endTime,
          days,
          totalFee: orderTotalFee,
          deposit,
          specialNeeds,
          needPickup: isPrimary && store.hasPickup && needPickup,
          roomName,
          billingMode,
          contactName,
          contactPhone,
          contactIdCard
        }),
        id: contractId,
        petName: pet.name,
        petType: pet.type,
        signed: true,
        signTime,
        signMethod: 'electronic'
      };

      const pickupPayload = isPrimary
        ? buildPickupPayload({
          needPickup: store.hasPickup && needPickup,
          pickupAddress: this.data.pickupAddress,
          pickupLocationName: this.data.pickupLocationName,
          pickupLatitude: this.data.pickupLatitude,
          pickupLongitude: this.data.pickupLongitude,
          pickupContactPhone: this.data.pickupContactPhone,
          pickupTime: this.data.pickupTime || this.data.startTime,
          ...this._getPickupFlags()
        })
        : { needPickup: false };

      return {
        orderGroupId,
        petCountInGroup,
        isGroupPrimary: isPrimary,
        petName: pet.name,
        petType: pet.type,
        petGender: pet.gender,
        petAge: pet.age,
        petAgeYears: pet.ageYears,
        petAgeMonths: pet.ageMonths,
        petId: pet.id,
        petWeight: pet.weight,
        petBreed: pet.breed || '',
        petPhoto: pet.photo || '',
        petSnapshot: buildPetSnapshot(pet),
        contactName,
        contactPhone,
        contactIdCard: String(contactIdCard || '').trim(),
        emergencyPhone: String(emergencyPhone || '').trim(),
        ...pickupPayload,
        startDate,
        endDate,
        startTime,
        endTime,
        days,
        boardingFee: orderBoardingFee,
        shippingFee,
        washFee,
        needWash: orderNeedWash,
        valueAddedFee,
        valueAddedServices: orderValueAddedServices,
        totalFee: orderTotalFee,
        basePrice: item.basePrice,
        deposit,
        feeSnapshot: {
          basePrice: item.basePrice,
          dailyBreakdown: item.breakdown.dailyBreakdown,
          chargeSummary: item.breakdown.chargeSummary,
          daysText: item.breakdown.daysText,
          multiPetDiscount: multiResult.discount,
          longTermDiscount: multiResult.longTermDiscount,
          originalBoardingFee: item.originalBoardingFee,
          discountAmount: item.discountAmount,
          multiPetDiscountAmount: item.multiPetDiscountAmount,
          longTermDiscountAmount: item.longTermDiscountAmount,
          petIndex: index,
          petCount: petCountInGroup,
          pickupDistanceKm: isPrimary && this.data.pickupDrivingDistanceKm != null
            ? this.data.pickupDrivingDistanceKm
            : undefined,
          pickupDistanceMode: isPrimary && (
            storeView.pickupPricingMode === 'distance'
            || meetsPickupFreeStayDays(storeView, item.breakdown.days)
          )
            ? (this.data.pickupDistanceMode || 'driving')
            : undefined,
          wash: orderNeedWash
            ? {
              unitPrice: washQuote.unitPrice,
              fee: washFee,
              freeByStay: washQuote.freeByStay,
              freeMinDays: washQuote.freeMinDays,
              text: washQuote.text
            }
            : undefined,
          valueAdded: orderValueAddedServices.length
            ? { fee: valueAddedFee, items: orderValueAddedServices }
            : undefined
        },
        extras: [],
        needPickup: store.hasPickup ? (isPrimary && needPickup) : false,
        specialNeeds,
        billingMode,
        roomType,
        roomName,
        serviceType: '寄养预约',
        status: 'pending',
        store_id: store.store_id,
        storeName: store.name || '',
        storeLogo: store.logo || '',
        storeAddress: store.address || '',
        contractId,
        contractSigned: true,
        contractSignTime: signTime,
        contractSnapshot: contractPayload
      };
    };

    wx.showLoading({ title: '提交中' });
    const submitNext = (index) => {
      if (index >= items.length) return Promise.resolve();
      const order = buildOrderForItem(items[index], index);
      const contractPayload = order.contractSnapshot;
      return app.saveOrder(order)
        .then((savedOrder) => {
          app.saveContract({
            ...contractPayload,
            orderId: savedOrder.id
          });
          return submitNext(index + 1);
        });
    };

    submitNext(0)
      .then(() => {
        wx.hideLoading();
        this.setData({ agreedToContract: false, signedContractDraft: null });
        app.globalData.signedContractDraft = null;
        app.globalData.contractSignDraft = null;
        this._multiPetFeeResult = null;
        const toastTitle = items.length > 1
          ? `已提交${items.length}只宠物预约`
          : '预约成功';
        wx.showToast({ title: toastTitle, icon: 'success' });
        setTimeout(() => this._afterReserveSuccess(), 700);
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
    const urls = [];
    (this.data.petRoomSections || []).forEach((section) => {
      (section.roomOptions || []).forEach((room) => {
        if (room && room.photo && urls.indexOf(room.photo) < 0) {
          urls.push(room.photo);
        }
      });
    });
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url]
    });
  },

  onPreviewValueAddedPhoto(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    const urls = (this.data.valueAddedList || [])
      .map((item) => item && item.photo)
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

  onPreviewWashNoticePhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.store && this.data.store.washNoticePhotos) || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onOpenNoticePreview(e) {
    const expandable = e.currentTarget.dataset.expandable;
    if (!(expandable === true || expandable === 'true')) return;
    const title = e.currentTarget.dataset.title || '须知';
    const store = this.data.store || {};
    let content = '';
    if (title === '接送须知') content = store.pickupNotice || '';
    else if (title === '洗护须知') content = store.washNotice || '';
    else content = store.notice || '';
    if (!String(content).trim()) return;
    this.setData({
      noticePreviewVisible: true,
      noticePreviewTitle: title,
      noticePreviewContent: content
    });
  },

  onCloseNoticePreview() {
    this.setData({
      noticePreviewVisible: false,
      noticePreviewTitle: '',
      noticePreviewContent: ''
    });
  },

  onNoticePreviewTouchMove() {},

  onNoticePreviewSheetTap() {},

  onGoPets() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  }
});
