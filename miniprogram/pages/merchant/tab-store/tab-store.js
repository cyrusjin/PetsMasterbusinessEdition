const app = getApp();
const { STORAGE_KEYS } = require('../../../utils/constants');
const { hideHomeButton } = require('../../../utils/navBar');
const { handlePageSecretTap } = require('../../../utils/hiddenAdmin');
const { redirectToUserIfMerchantUiBlocked, ensureMerchantPageAllowed } = require('../../../utils/shell');
const storeApi = require('../../../utils/store');
const merchantDemo = require('../../../utils/merchantDemo');
const {
  validateApplyForm,
  createEmptyApplyShop,
  pickApplyShopFields
} = require('../../../utils/storeApply');
const { preserveOutgoingShopFields, hydrateShopProfileFromCoop } = require('../../../utils/storeSync');
const { resolveImageUrls } = require('../../../utils/imageCache');
const {
  DEFAULT_DEPARTURE_CHARGE,
  buildChargeSummary,
  normalizeDepartureCharge
} = require('../../../utils/billing');
const {
  WEEKDAY_OPTIONS,
  DEFAULT_BUSINESS_HOURS,
  normalizeBusinessHours,
  formatBusinessHoursText,
  isWeekdaySelected,
  toggleWeekday
} = require('../../../utils/businessHours');
const {
  normalizeStoreStatus,
  getStatusConfirmContent,
  STATUS_INCOMPLETE,
  STATUS_OPEN
} = require('../../../utils/storeStatus');
const { showValidationAlert } = require('../../../utils/formAlert');
const { copyText } = require('../../../utils/clipboard');
const { buildMerchantCoopContract } = require('../../../utils/merchantCoopContract');
const { isMerchantRejected, isMerchantDisabled } = require('../../../utils/role');
const { isAuthorizedNickName, getNickNameCapability } = require('../../../utils/userAuth');
const { isOaBound } = require('../../../utils/officialAccount');
const {
  enableStoreShareMenu,
  buildMerchantShareConfig,
  buildMerchantTimelineShareConfig,
  redirectGuestShareToReserve,
  prefetchStoreShareImage
} = require('../../../utils/storeShare');
const { normalizePhone, validateMobilePhone } = require('../../../utils/phone');

const {
  markForceOpenSuccessPromo,
  isForceOpenSuccessStore
} = require('../../../utils/openSuccessPromo');
const {
  normalizeReceptionRange,
  formatReceptionRangeText,
  buildReceptionRangeOptions
} = require('../../../utils/receptionRange');
const {
  MAX_STORE_PHOTOS,
  MAX_INTRO_PHOTOS,
  MAX_NOTICE_PHOTOS,
  MAX_INTRO_TEXT,
  MAX_NOTICE_TEXT,
  MAX_PICKUP_NOTICE_TEXT,
  normalizeStorePhotos,
  normalizeIntroPhotos,
  normalizeNoticePhotos,
  reorderStorePhotos,
  reorderPhotoList,
  uploadStorePhotos,
  uploadIntroPhotos,
  uploadNoticePhotos,
  uploadWashNoticePhotos,
  uploadStoreLogo,
  normalizeBusinessLicense,
  uploadBusinessLicense
} = require('../../../utils/storePhotos');
const { chooseStoreLocation, formatLocationAddress, isValidLocationResult, getLocationValidationMessage } = require('../../../utils/location');
const {
  normalizeWeightPricing,
  addWeightRange,
  removeWeightRange,
  updateWeightRangeField
} = require('../../../utils/weightPricing');
const { normalizeDeposit, validateStoreForm, validateBasicStoreForm, validateAdvancedStoreForm, validateBillingRules, isBoardingPricingComplete, isHomeFeedingPricingComplete, OPEN_NEED_SERVICE_LINE } = require('../../../utils/storeForm');
const {
  emptyHomeFeeding,
  normalizeHomeFeeding,
  validateHomeFeedingAdvanced
} = require('../../../utils/homeFeeding');
const {
  normalizeDogPricingForUi,
  updateDogField,
  updateDogSurchargeField,
  addDogSurchargeTier,
  removeDogSurchargeTier,
  toggleDogSurchargeEnabled,
  toggleDogSurchargePerKm,
  validateHomeVisitPricing,
  deriveLegacyPricingFromItems,
  compactVisitSurcharge,
  isSurchargeEnabled
} = require('../../../utils/homeVisitPricing');
const {
  normalizeVisitServicesForUi,
  compactVisitServices,
  addVisitService,
  removeVisitService,
  updateVisitServiceField,
  toggleVisitServicePetType,
  refreshVisitServicePetTypeOptions,
  updateVisitServiceVasField,
  addVisitServiceVas,
  removeVisitServiceVas,
  patchVisitServiceSurcharge
} = require('../../../utils/homeVisitServices');
const {
  normalizePickupPricing,
  PICKUP_PRICING_MODE,
  normalizePickupFreeTiers,
  normalizePickupFreeTiersForEdit,
  createDefaultPickupFreeTiersForEdit,
  addPickupFreeTier,
  removePickupFreeTier,
  updatePickupFreeTierField,
  setPickupFreeTierTripType,
  validatePickupFreeTiers,
  hasPickupFreeOffer
} = require('../../../utils/pickupPricing');
const {
  normalizeWashPricing,
  normalizeWashFields,
  parseWashFreeMinDays,
  getDefaultWashPricing,
  addWashRange,
  removeWashRange,
  updateWashRangeField
} = require('../../../utils/washPricing');
const {
  MAX_WASH_TITLE,
  MAX_WASH_BODY,
  normalizeWashProducts,
  normalizeWashProductsForUi,
  addWashProduct,
  removeWashProduct,
  updateWashProductField,
  toggleWashProductPetType,
  validateWashProducts,
  isWashProductsComplete,
  compactWashProducts,
  uploadWashProductPhotos
} = require('../../../utils/washProducts');
const {
  MAX_ROOM_DESCRIPTION,
  normalizeRoomPricing,
  addRoom,
  removeRoom,
  updateRoomField,
  uploadRoomPricingPhotos
} = require('../../../utils/roomPricing');
const {
  MAX_CUSTOM_DESCRIPTION,
  MAX_CUSTOM_NAME,
  getDefaultCustomPricing,
  normalizeCustomPricing,
  normalizeCustomPricingForUi,
  addCustomOption,
  removeCustomOption,
  updateCustomOptionField,
  addCustomChild,
  removeCustomChild,
  updateCustomChildField,
  uploadCustomPricingPhotos
} = require('../../../utils/customPricing');
const {
  MAX_VALUE_ADDED_DESCRIPTION,
  MAX_VALUE_ADDED_NAME,
  normalizeValueAddedServices,
  resolveStoreValueAddedServices,
  addValueAddedService,
  removeValueAddedService,
  updateValueAddedServiceField,
  uploadValueAddedServicePhotos
} = require('../../../utils/valueAddedServices');
const {
  getDefaultClauseEditText,
  getStoredClauseEditText,
  isCustomContractSettings
} = require('../../../utils/boardingContract');
const {
  formatHolidayPricingSummary,
  getDefaultHolidayPricing,
  normalizeHolidayPricing
} = require('../../../utils/legalHolidays');
const { normalizeMultiPetDiscount } = require('../../../utils/multiPetPricing');
const {
  normalizeLongTermDiscount,
  normalizeLongTermTiersForEdit,
  addLongTermTier,
  removeLongTermTier,
  updateLongTermTierField,
  parseZhe,
  formatZhe,
  sanitizeZheInput
} = require('../../../utils/longTermDiscount');
const {
  EMPTY_SERVICE_LINES,
  normalizeServiceLines,
  hasOtherEnabledServiceLine,
  pickServiceLineView
} = require('../../../utils/serviceLines');

/** 本地 UI 预览：空店铺，不拉线上店、不写回云端。测完改回 false */
const UI_EMPTY_SHOP_PREVIEW = false;
/** 测试模式本地保存缓存，页面重进时还原，不写入真实店铺存储 */
let previewShopCache = null;

function pickReceptionRangeState(shop) {
  const receptionRange = normalizeReceptionRange(shop.receptionRange || shop.range);
  return {
    receptionRange,
    receptionRangeOptions: buildReceptionRangeOptions(receptionRange),
    receptionRangeSummary: formatReceptionRangeText(receptionRange)
  };
}

function buildWeekdayOptions(weekdays) {
  return WEEKDAY_OPTIONS.map((item) => ({
    ...item,
    selected: isWeekdaySelected(weekdays, item.value)
  }));
}

function pickBusinessHoursState(shop) {
  const businessHours = normalizeBusinessHours(shop.businessHours, shop.hours);
  return {
    businessHours,
    weekdayOptions: buildWeekdayOptions(businessHours.weekdays),
    hoursSummary: formatBusinessHoursText(businessHours)
  };
}

function pickBillingState(rules) {
  const departureCharge = normalizeDepartureCharge(
    (rules && rules.departureCharge) || DEFAULT_DEPARTURE_CHARGE
  );
  const checkInDayCharge = (rules && rules.checkInDayCharge) || 'full';
  const departureDayCharge = (rules && rules.departureDayCharge) || 'full';
  const multiPetDiscount = normalizeMultiPetDiscount(
    (rules && rules.multiPetDiscount) || {}
  );
  const multiPetDiscountEnabled = multiPetDiscount.enabled === true;
  const multiPetZheText = formatZhe(multiPetDiscount.zhe);
  const multiPetAmount = multiPetDiscount.amount;
  const longTermDiscount = (rules && rules.longTermDiscount) || {};
  const longTermDiscountEnabled = longTermDiscount.enabled === true;
  const billingState = {
    checkInDayCharge,
    departureDayCharge,
    departureCharge
  };
  const holidayPricing = normalizeHolidayPricing(
    (rules && rules.holidayPricing) || getDefaultHolidayPricing()
  );
  return {
    billingMode: (rules && rules.billingMode) || 'weight',
    weightPricing: normalizeWeightPricing((rules && rules.weightPricing) || []),
    roomPricing: normalizeRoomPricing((rules && rules.roomPricing) || []),
    customPricing: (() => {
      const list = normalizeCustomPricingForUi((rules && rules.customPricing) || []);
      return list.length ? list : normalizeCustomPricingForUi(getDefaultCustomPricing());
    })(),
    multiPetDiscountEnabled,
    multiPetDiscountMode: multiPetDiscount.mode,
    multiPetDiscountPercent: multiPetZheText,
    multiPetDiscountAmount: multiPetDiscountEnabled && multiPetAmount != null && multiPetAmount !== ''
      ? String(multiPetAmount)
      : (multiPetAmount != null && multiPetAmount !== '' ? String(multiPetAmount) : ''),
    longTermDiscountEnabled,
    longTermDiscountTiers: normalizeLongTermTiersForEdit(longTermDiscount),
    ...billingState,
    chargeSummary: buildChargeSummary({ ...rules, ...billingState }),
    holidayPricingSummary: formatHolidayPricingSummary(holidayPricing)
  };
}

function emptyVisitOfferForm() {
  return {
    multiPetDiscountEnabled: false,
    multiPetDiscountMode: 'fromSecondPercent',
    multiPetDiscountPercent: '',
    multiPetDiscountAmount: '',
    holidayPricingSummary: '默认不加价'
  };
}

function pickVisitOfferForm(pricing) {
  const mp = normalizeMultiPetDiscount((pricing && pricing.multiPetDiscount) || {});
  const holiday = normalizeHolidayPricing(
    (pricing && pricing.holidayPricing) || getDefaultHolidayPricing()
  );
  const amount = mp.amount;
  return {
    multiPetDiscountEnabled: mp.enabled === true,
    multiPetDiscountMode: mp.mode === 'fromSecondFixedPerDay' ? 'fromSecondFixedPerDay' : 'fromSecondPercent',
    multiPetDiscountPercent: formatZhe(mp.zhe),
    multiPetDiscountAmount: amount != null && amount !== '' ? String(amount) : '',
    holidayPricingSummary: formatHolidayPricingSummary(holiday)
  };
}

function buildMultiPetDiscountFromForm(form, applyTo) {
  const src = form || {};
  const zheRaw = String(src.multiPetDiscountPercent || '').trim();
  const zhe = parseZhe(zheRaw);
  const amountRaw = String(src.multiPetDiscountAmount || '').trim();
  const amount = /^\d+(\.\d{1,2})?$/.test(amountRaw) ? Number(amountRaw) : NaN;
  const multiPetMode = src.multiPetDiscountMode === 'fromSecondFixedPerDay'
    ? 'fromSecondFixedPerDay'
    : 'fromSecondPercent';
  if (multiPetMode === 'fromSecondFixedPerDay') {
    const enabled = !!src.multiPetDiscountEnabled && Number.isFinite(amount);
    return {
      enabled,
      mode: multiPetMode,
      zhe: 0,
      percent: 0,
      amount: enabled ? amount : 0,
      applyTo
    };
  }
  if (!src.multiPetDiscountEnabled || !zheRaw) {
    return {
      enabled: false,
      mode: multiPetMode,
      zhe: 0,
      percent: 0,
      amount: 0,
      applyTo
    };
  }
  if (zhe == null) {
    return {
      enabled: true,
      mode: multiPetMode,
      zhe: zheRaw,
      percent: 0,
      amount: 0,
      applyTo
    };
  }
  return {
    enabled: true,
    mode: multiPetMode,
    zhe,
    percent: Math.round((10 - zhe) * 10 * 100) / 100,
    amount: 0,
    applyTo
  };
}

Page({
  data: {
    isDemoMode: false,
    isAdminDisabled: false,
    adminDisableReason: '',
    settingsTab: 'shop',
    moduleSubTab: 'basic',
    basicSaveText: '开始营业',
    showBasicSaveButton: false,
    activeServiceTab: 'boarding',
    currentModuleCard: null,
    serviceLines: { ...EMPTY_SERVICE_LINES },
    serviceLineCards: pickServiceLineView({ serviceLines: EMPTY_SERVICE_LINES }, { boardingComplete: false }).serviceLineCards,
    boardingEnabled: false,
    washLineEnabled: false,
    homeFeedingEnabled: false,
    basicServiceLinesTip: '三个板块价格各自独立。资料完善后才能打开开关，至少开通一项后才能开始营业。',
    advancedServiceLinesTip: '点选板块查看对应高级设置。收费规则、优惠、交通费、协议、押金按板块分别生效。',
    submitting: false,
    shop: {},
    billingMode: 'weight',
    weightPricing: [],
    roomPricing: [],
    customPricing: normalizeCustomPricingForUi(getDefaultCustomPricing()),
    checkInDayCharge: 'full',
    departureDayCharge: 'full',
    departureCharge: { ...DEFAULT_DEPARTURE_CHARGE },
    chargeSummary: '',
    businessHours: { ...DEFAULT_BUSINESS_HOURS },
    weekdayOptions: buildWeekdayOptions(DEFAULT_BUSINESS_HOURS.weekdays),
    hoursSummary: '',
    businessStatus: '未营业',
    receptionRange: [],
    receptionRangeOptions: buildReceptionRangeOptions([]),
    receptionRangeSummary: '',
    storePhotos: [],
    introPhotos: [],
    noticePhotos: [],
    washNoticePhotos: [],
    maxStorePhotos: MAX_STORE_PHOTOS,
    maxIntroPhotos: MAX_INTRO_PHOTOS,
    maxNoticePhotos: MAX_NOTICE_PHOTOS,
    maxIntroText: MAX_INTRO_TEXT,
    maxNoticeText: MAX_NOTICE_TEXT,
    maxPickupNoticeText: MAX_PICKUP_NOTICE_TEXT,
    maxRoomDescription: MAX_ROOM_DESCRIPTION,
    maxCustomDescription: MAX_CUSTOM_DESCRIPTION,
    maxCustomName: MAX_CUSTOM_NAME,
    maxValueAddedDescription: MAX_VALUE_ADDED_DESCRIPTION,
    maxValueAddedName: MAX_VALUE_ADDED_NAME,
    valueAddedServices: [],
    photoDrag: {
      active: false,
      listKey: '',
      fromIndex: -1,
      targetIndex: -1,
      ghostUrl: '',
      ghostX: 0,
      ghostY: 0,
      ghostSize: 100
    },
    hideMerchantTabBar: false,
    keyboardVisible: false,
    oaFollowSheetVisible: false,
    pickupFreeMode: 'none',
    pickupFreeTiers: createDefaultPickupFreeTiersForEdit(),
    washPricing: [],
    washProducts: [],
    washValueAddedServices: [],
    maxWashTitle: MAX_WASH_TITLE,
    maxWashBody: MAX_WASH_BODY,
    washFreeMode: 'none',
    multiPetDiscountEnabled: false,
    multiPetDiscountMode: 'fromSecondPercent',
    multiPetDiscountPercent: '',
    multiPetDiscountAmount: '',
    longTermDiscountEnabled: false,
    longTermDiscountTiers: [{ minDays: '', zhe: '' }],
    holidayPricingSummary: '默认不加价',
    hf: {
      billingMode: 'weight',
      weightPricing: [],
      roomPricing: [],
      customPricing: normalizeCustomPricingForUi(getDefaultCustomPricing()),
      checkInDayCharge: 'full',
      departureDayCharge: 'full',
      departureCharge: { ...DEFAULT_DEPARTURE_CHARGE },
      chargeSummary: '',
      multiPetDiscountEnabled: false,
      multiPetDiscountMode: 'fromSecondPercent',
      multiPetDiscountPercent: '',
      multiPetDiscountAmount: '',
      longTermDiscountEnabled: false,
      longTermDiscountTiers: [{ minDays: '', zhe: '' }],
      holidayPricingSummary: '默认不加价',
      pickupFreeMode: 'none',
      pickupFreeTiers: createDefaultPickupFreeTiersForEdit(),
      washPricing: [],
      washFreeMode: 'none',
      valueAddedServices: [],
      noticePhotos: [],
      washNoticePhotos: [],
      contractClauseCustomized: false,
      contractClauseSummary: '使用平台默认条款',
      serviceItems: normalizeVisitServicesForUi(),
      includedKm: '3',
      surchargeEnabled: false,
      surchargeTiers: normalizeDogPricingForUi().surchargeTiers,
      offer: emptyVisitOfferForm()
    },
    contractEditLine: 'boarding',
    contractModalTitle: '编辑到店寄养协议条款',
    showContractModal: false,
    showCoopContractModal: false,
    coopContractMode: 'preview',
    coopContractDoc: null,
    contractClauseDraft: '',
    contractClauseCustomized: false,
    membership: {
      active: false,
      freeDogLimit: 5,
      boardingCount: 0,
      priceYuan: '9.9',
      expireAtText: ''
    },
    savingContractClause: false,
    merchantUiReady: false,
    applyDisabledTitle: '',
    applyDisabledTip: '',
  },

  onLoad(options) {
    this._formDirty = false;
    if (app.globalData) {
      app.globalData.uiEmptyShopPreview = UI_EMPTY_SHOP_PREVIEW === true;
    }
    this._keyboardHeightChangeHandler = (res) => {
      const keyboardVisible = Number(res && res.height) > 0;
      if (keyboardVisible === this.data.keyboardVisible) return;
      this.setData({ keyboardVisible });
    };
    if (typeof wx.onKeyboardHeightChange === 'function') {
      wx.onKeyboardHeightChange(this._keyboardHeightChangeHandler);
    }
    const storeId = String((options && options.store_id) || '').trim();
    if (storeId && redirectGuestShareToReserve(storeId, options && options.serviceLine)) {
      return;
    }
    if (app.globalData && app.globalData.storeSettingsTab === 'advanced') {
      app.globalData.storeSettingsTab = '';
      this.setData({ settingsTab: 'boarding', moduleSubTab: 'advanced', activeServiceTab: 'boarding' });
    }
  },

  onUnload() {
    if (
      this._keyboardHeightChangeHandler
      && typeof wx.offKeyboardHeightChange === 'function'
    ) {
      wx.offKeyboardHeightChange(this._keyboardHeightChangeHandler);
    }
    this._keyboardHeightChangeHandler = null;
  },

  onShareAppMessage(res) {
    const shareType = res && res.target && res.target.dataset && res.target.dataset.shareType;
    const serviceLine = res && res.target && res.target.dataset && res.target.dataset.serviceLine;
    if (shareType === 'open-success' || shareType === 'customer' || !shareType) {
      return buildMerchantShareConfig(this, { serviceLine });
    }
    return buildMerchantShareConfig(this, { serviceLine });
  },

  onShareTimeline() {
    return buildMerchantTimelineShareConfig(this);
  },

  _unlockMerchantCopy() {
    this.setData({
      applyDisabledTitle: '店铺已关闭',
      applyDisabledTip: '您的店铺已被平台关闭，如有疑问请联系客服。'
    });
  },

  _isEmptyShopPreview() {
    return UI_EMPTY_SHOP_PREVIEW === true;
  },

  _isHomeFeedingForm() {
    return this.data.settingsTab === 'homeFeeding';
  },

  _form() {
    return this._isHomeFeedingForm() ? (this.data.hf || {}) : this.data;
  },

  _setForm(patch, cb) {
    if (this._isHomeFeedingForm()) {
      this.setData({ hf: { ...(this.data.hf || {}), ...patch } }, cb);
      return;
    }
    this.setData(patch, cb);
  },

  _getServiceShop() {
    if (this._isHomeFeedingForm()) {
      return this.data.shop.homeFeeding || emptyHomeFeeding();
    }
    return this.data.shop;
  },

  _setServiceShop(patch) {
    if (this._isHomeFeedingForm()) {
      const homeFeeding = { ...(this.data.shop.homeFeeding || emptyHomeFeeding()), ...patch };
      this.setData({ shop: { ...this.data.shop, homeFeeding } });
      return;
    }
    this.setData({ shop: { ...this.data.shop, ...patch } });
  },

  _buildHomeFeedingForm(homeFeeding) {
    const hf = normalizeHomeFeeding(homeFeeding);
    return {
      noticePhotos: normalizeNoticePhotos(hf.noticePhotos),
      contractClauseCustomized: !!(hf.contractClauseText || '').trim(),
      contractClauseSummary: (hf.contractClauseText || '').trim() ? '已自定义协议条款' : '使用平台默认条款',
      serviceItems: this._decorateVisitSurchargeList(
        normalizeVisitServicesForUi(hf.serviceItems, this.data.receptionRange)
      ),
      offer: pickVisitOfferForm(hf)
    };
  },

  _applyEmptyShopPreview() {
    this.setData({
      isDemoMode: false,
      isAdminDisabled: false,
      merchantUiReady: true
    });
    if (!this._formDirty) {
      if (app.globalData && app.globalData.previewShopCache) {
        previewShopCache = app.globalData.previewShopCache;
      }
      this._applyShopToForm(previewShopCache || this._createEmptyShop());
    }
    this._syncApplyShellChrome();
    this._syncBasicSaveText();
    return Promise.resolve();
  },

  _cachePreviewShop(shop) {
    previewShopCache = this._normalizeShop(shop || {});
    if (app.globalData) app.globalData.previewShopCache = previewShopCache;
    return previewShopCache;
  },

  _finishLocalPreviewSave(shop, toastTitle) {
    const saved = this._cachePreviewShop(shop);
    this._applyShopToForm(saved);
    this._formDirty = false;
    wx.hideLoading();
    this._syncApplyShellChrome();
    this._syncBasicSaveText();
    if (toastTitle !== '') {
      wx.showToast({
        title: toastTitle || '已保存到本地',
        icon: 'success'
      });
    }
    return saved;
  },

  _syncBasicSaveText() {
    const incomplete = normalizeStoreStatus(this.data.businessStatus || this.data.shop.status) === STATUS_INCOMPLETE;
    const signed = !!(this.data.shop && this.data.shop.coopContractSigned);
    // 未营业：必须先签署协议才显示「开始营业」；已营业：始终可保存店铺资料
    this.setData({
      basicSaveText: incomplete ? '开始营业' : '保存店铺资料',
      showBasicSaveButton: incomplete ? signed : true
    });
  },

  _isBasicSetupReady() {
    try {
      return !!(app.hasCompletedBasicStoreSetup && app.hasCompletedBasicStoreSetup());
    } catch (err) {
      return false;
    }
  },

  _shouldHideMerchantTabBar() {
    if (app.isMerchantDisabled && app.isMerchantDisabled()) return true;
    // 未完成基础设置（含无店铺申请入驻）：隐藏底部 Tab
    return !this._isBasicSetupReady();
  },

  _syncNavTitle() {
    const title = this._isBasicSetupReady() ? '我的门店' : '申请入驻';
    wx.setNavigationBarTitle({ title });
  },

  _syncApplyShellChrome() {
    this.setData({ hideMerchantTabBar: this._shouldHideMerchantTabBar() });
    this._syncNavTitle();
  },

  _syncDisabledState(shop) {
    const isAdminDisabled = app.isMerchantDisabled();
    this.setData({
      isAdminDisabled,
      adminDisableReason: isAdminDisabled
        ? ((shop && shop.adminDisableReason) || '')
        : ''
    });
  },

  _hydrateFromCache() {
    if (this._isEmptyShopPreview()) {
      this._applyEmptyShopPreview();
      return;
    }
    if (app.isMerchantDisabled()) {
      this.setData({ isDemoMode: false, isAdminDisabled: true, hideMerchantTabBar: true });
      const cachedShop = app.getShop();
      if (cachedShop && cachedShop.store_id) {
        app.globalData.merchantStoreId = cachedShop.store_id;
        this._syncDisabledState(cachedShop);
      }
      return;
    }

    this.setData({
      isDemoMode: false,
      isAdminDisabled: false
    });
    const cachedShop = app.getShop();
    if (cachedShop && cachedShop.store_id && !merchantDemo.isDemoEntityId(cachedShop.store_id)) {
      app.globalData.merchantStoreId = cachedShop.store_id;
      if (!this._formDirty) {
        this._applyShopToForm(cachedShop);
      }
    } else if (!this._formDirty) {
      this._applyShopToForm(this._createEmptyShop());
    }
    this._syncApplyShellChrome();
  },

  _createEmptyShop() {
    return {
      name: '',
      logo: '',
      address: '',
      contactPhone: '',
      legalName: '',
      businessLicense: '',
      intro: '',
      introPhotos: [],
      storePhotos: [],
      receptionRange: [],
      businessHours: { ...DEFAULT_BUSINESS_HOURS },
      status: STATUS_INCOMPLETE,
      pickupService: 'no',
      washService: 'no',
      washProducts: [],
      washValueAddedServices: [],
      homeFeeding: emptyHomeFeeding(),
      serviceLines: { ...EMPTY_SERVICE_LINES },
      deposit: 0,
      coopContractSigned: false,
      coopContractSnapshot: null,
      coopContractSignTime: ''
    };
  },

  _hydrateApplyFormFromCache() {
    if (this._applyFormDirty) return;

    const pending = app.isMerchantPending();
    const rejected = isMerchantRejected(app.globalData.userInfo);
    if (pending || rejected) {
      const cachedShop = app.getShop();
      if (cachedShop && cachedShop.store_id && !merchantDemo.isDemoEntityId(cachedShop.store_id)) {
        app.globalData.merchantStoreId = cachedShop.store_id;
        const wasRejected = this.data.applyStatus === 'rejected';
        this._applyFormFromShop(cachedShop, pending ? 'pending' : 'rejected');
        if (rejected) {
          const patch = {
            applyRejectReason: (cachedShop && cachedShop.rejectReason) || ''
          };
          // 仅从非拒绝态切入时要求重签协议，避免 onShow 反复清空导致无法提交
          if (!wasRejected) {
            patch.agreedToCoopContract = false;
            patch.signedCoopContractDraft = null;
          }
          this.setData(patch);
        }
      }
      return;
    }

    const draft = merchantDemo.getDemoApplyDraft();
    if (draft) {
      this._applyFormFromShop(draft.shop, '');
      this.setData({
        applyStorePhotos: normalizeStorePhotos(draft.storePhotos),
        applyBusinessLicense: normalizeBusinessLicense(
          draft.businessLicense || (draft.shop && draft.shop.businessLicense)
        )
      });
      return;
    }

    this._applyFormFromShop(createEmptyApplyShop(), '');
  },

  _needsForceUserRefresh() {
    return false;
  },

  _reloadStorePage(options = {}) {
    if (this._isEmptyShopPreview()) {
      return this._applyEmptyShopPreview();
    }
    const forceUser = !!(options && options.forceUser);
    return app.ensureCloudAndLogin(forceUser ? { force: true } : {}).then(() => {
      if (app.isMerchantDisabled()) {
        this.setData({ isDemoMode: false, isAdminDisabled: true, hideMerchantTabBar: true });
        return app.ensureMerchantStore({ force: true }).then((shop) => {
          if (shop && shop.store_id) {
            this._syncDisabledState(shop);
          }
        });
      }

      this.setData({
        isDemoMode: false,
        isAdminDisabled: false
      });
      this._syncApplyShellChrome();

      if (this._formDirty && !forceUser) return;
      const storeOpts = (forceUser || !this.data.shop || !this.data.shop.store_id)
        ? { force: true }
        : {};
      return app.ensureMerchantStore(storeOpts).then((shop) => {
        if (!shop || !shop.store_id) {
          if (this._formDirty) return;
          this._applyShopToForm(this._createEmptyShop());
          this._syncApplyShellChrome();
          return;
        }
        if (this._formDirty) return;
        this._applyShopToForm(shop);
        this._syncApplyShellChrome();
      });
    });
  },

  onShow() {
    hideHomeButton();
    this._syncTabBar();
    if (redirectToUserIfMerchantUiBlocked()) return;
    ensureMerchantPageAllowed().then((blocked) => {
      if (blocked) return;
      this._unlockMerchantCopy();
      this.setData({ merchantUiReady: true });
      if (app.isUserClientMode && app.isUserClientMode()) {
        wx.switchTab({ url: '/pages/index/index' });
        return;
      }
      this._reloadStorePage({ forceUser: this._needsForceUserRefresh() })
        .then(() => {
          this._syncApplyShellChrome();
          this._syncTabBar();
          this._syncBasicSaveText();
          this._refreshHolidayPricingSummary();
          if (app.globalData && app.globalData.storeSettingsTab === 'advanced') {
            app.globalData.storeSettingsTab = '';
            this.setData({ settingsTab: 'boarding', moduleSubTab: 'advanced', activeServiceTab: 'boarding' });
          }
          this._maybeForceOpenSuccessSheet();
        });
    });
  },

  _maybeForceOpenSuccessSheet() {
    if (!isForceOpenSuccessStore(this.data.shop || app.getShop())) return;
    const tryShow = () => {
      const bar = this.selectComponent('#merchantTabBar');
      if (bar && typeof bar.showOpenSuccessPromo === 'function') {
        bar.showOpenSuccessPromo({ force: true, allowRepeat: true });
        return true;
      }
      return false;
    };
    if (!tryShow()) {
      markForceOpenSuccessPromo(app);
      setTimeout(() => {
        tryShow();
      }, 80);
    }
  },

  _syncTabBar() {},

  onSwitchToUser() {
    if (app.enterUserMode) {
      app.enterUserMode();
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  _setMerchantTabHidden(_hidden) {
    this._syncApplyShellChrome();
  },

  onPullDownRefresh() {
    if (this._formDirty) {
      wx.stopPullDownRefresh();
      return;
    }
    this._reloadStorePage({ forceUser: true })
      .then(() => {
        this._syncBasicSaveText();
        wx.showToast({ title: '已刷新', icon: 'success' });
      })
      .finally(() => wx.stopPullDownRefresh());
  },

  _loadApplyForm() {
    if (this._applyFormDirty) return;

    const pending = app.isMerchantPending();
    const rejected = isMerchantRejected(app.globalData.userInfo);
    if (pending || rejected) {
      return app.ensureMerchantStore({ force: true }).then((shop) => {
        if (this._applyFormDirty) return;
        // 以最新用户状态为准，避免闭包里的旧 pending 把已通过界面写回审核中
        const stillPending = app.isMerchantPending();
        const stillRejected = isMerchantRejected(app.globalData.userInfo);
        if (!stillPending && !stillRejected) {
          this.setData({ isDemoMode: false, applyStatus: '' });
          if (shop && shop.store_id) {
            this._applyShopToForm(shop);
          }
          return;
        }
        if (!shop || !shop.store_id || merchantDemo.isDemoEntityId(shop.store_id)) {
          return;
        }
        const wasRejected = this.data.applyStatus === 'rejected';
        this._applyFormFromShop(shop, stillPending ? 'pending' : 'rejected');
        if (stillRejected) {
          const patch = {
            applyRejectReason: (shop && shop.rejectReason) || ''
          };
          if (!wasRejected) {
            patch.agreedToCoopContract = false;
            patch.signedCoopContractDraft = null;
          }
          this.setData(patch);
        }
      });
    }

    const draft = merchantDemo.getDemoApplyDraft();
    if (draft) {
      this._applyFormFromShop(draft.shop, '');
      this.setData({
        applyStorePhotos: normalizeStorePhotos(draft.storePhotos),
        applyBusinessLicense: normalizeBusinessLicense(
          draft.businessLicense || (draft.shop && draft.shop.businessLicense)
        )
      });
      return;
    }

    this._applyFormFromShop(createEmptyApplyShop(), '');
  },

  _applyFormFromShop(shop, applyStatus) {
    const user = app.globalData.userInfo || {};
    const wxNickName = isAuthorizedNickName(user.nickName) ? String(user.nickName).trim() : (this.data.wxNickName || '');
    this.setData({
      applyStatus: applyStatus || '',
      applyShop: pickApplyShopFields(shop),
      applyStorePhotos: normalizeStorePhotos(shop && shop.storePhotos),
      applyBusinessLicense: normalizeBusinessLicense(shop && shop.businessLicense),
      wxNickName
    });
  },

  onWxNickInput(e) {
    if (this.data.applyStatus === 'pending') return;
    // 仅旧版/手输模式使用；新版 nickname 不要绑 input，否则会截成首字母
    this.setData({ wxNickName: ((e.detail && e.detail.value) || '').trim() });
  },

  onWxNickChange(e) {
    if (this.data.applyStatus === 'pending') return;
    // 新版仅在 change/blur 取完整值
    const wxNickName = ((e.detail && e.detail.value) || this.data.wxNickName || '').trim();
    if (!isAuthorizedNickName(wxNickName)) return;
    if (wxNickName !== (this.data.wxNickName || '')) {
      this.setData({ wxNickName });
    }
    app.updateProfile({ nickName: wxNickName }).catch(() => {});
  },

  onWxNickReview(e) {
    if (e && e.detail && e.detail.pass === false) {
      this.setData({ wxNickName: '' });
    }
  },

  /** 旧版微信：getUserProfile 弹窗（新版会返回「微信用户」，不可用） */
  onGetWxNickProfile() {
    if (this.data.applyStatus === 'pending') return;
    if (typeof wx.getUserProfile !== 'function') {
      wx.showToast({ title: '当前微信过旧，请升级或手动输入昵称', icon: 'none' });
      return;
    }
    wx.getUserProfile({
      desc: '用于商家入驻审核识别申请人',
      success: (res) => {
        const wxNickName = ((res && res.userInfo && res.userInfo.nickName) || '').trim();
        if (!isAuthorizedNickName(wxNickName)) {
          wx.showToast({
            title: '当前微信已不返回真实昵称，请升级微信后使用输入框点选，或手动输入',
            icon: 'none',
            duration: 3500
          });
          return;
        }
        this.setData({ wxNickName });
        app.updateProfile({ nickName: wxNickName }).catch(() => {});
        wx.showToast({ title: '昵称已获取', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '未授权昵称，可手动输入', icon: 'none' });
      }
    });
  },

  /** 从原生 input 回读昵称（选微信昵称时 data 可能未及时同步） */
  _readWxNickNameFromInput() {
    return new Promise((resolve) => {
      try {
        wx.createSelectorQuery()
          .in(this)
          .select('#applyWxNickInput')
          .fields({ properties: ['value'], dataset: true })
          .exec((res) => {
            const fromDom = res && res[0] && res[0].value;
            const nick = String(fromDom != null ? fromDom : (this.data.wxNickName || '')).trim();
            resolve(nick);
          });
      } catch (err) {
        resolve(String(this.data.wxNickName || '').trim());
      }
    });
  },

  _saveApplyDraft() {
    merchantDemo.saveDemoApplyDraft({
      shop: this.data.applyShop,
      storePhotos: normalizeStorePhotos(this.data.applyStorePhotos),
      businessLicense: normalizeBusinessLicense(this.data.applyBusinessLicense)
    });
  },

  _markApplyDirty() {
    this._applyFormDirty = true;
    this._saveApplyDraft();
  },

  onApplyField(e) {
    if (this.data.applyStatus === 'pending') return;
    this._markApplyDirty();
    const field = e.currentTarget.dataset.field;
    const applyShop = { ...this.data.applyShop, [field]: e.detail.value };
    this.setData({ applyShop });
    this._saveApplyDraft();
  },

  onApplyPhoneInput(e) {
    if (this.data.applyStatus === 'pending') return;
    this._markApplyDirty();
    const contactPhone = normalizePhone(e.detail.value);
    const applyShop = { ...this.data.applyShop, contactPhone };
    this.setData({ applyShop });
    this._saveApplyDraft();
  },

  onApplyPhoneBlur() {
    if (this.data.applyStatus === 'pending') return;
    const phone = this.data.applyShop.contactPhone;
    if (!phone) return;
    const phoneError = validateMobilePhone(phone, {
      emptyMsg: '请填写联系电话',
      invalidMsg: '联系电话需为标准的11位手机号'
    });
    if (phoneError) {
      wx.showToast({ title: phoneError, icon: 'none' });
    }
  },

  onApplyChooseAddress() {
    if (this.data.applyStatus === 'pending') return;
    this._markApplyDirty();
    chooseStoreLocation(this.data.applyShop)
      .then((res) => {
        const validationMsg = getLocationValidationMessage(res);
        if (validationMsg) {
          wx.showToast({ title: validationMsg, icon: 'none', duration: 2500 });
          return;
        }
        if (!isValidLocationResult(res)) return;
        const applyShop = {
          ...this.data.applyShop,
          address: formatLocationAddress(res),
          locationName: (res.name || '').trim(),
          addressRegion: (res.address || '').trim(),
          latitude: res.latitude,
          longitude: res.longitude
        };
        this.setData({ applyShop });
        this._saveApplyDraft();
      })
      .catch(() => {});
  },

  onChooseApplyPhotos() {
    if (this.data.applyStatus === 'pending') return;
    if (this._choosingApplyPhotos) return;
    this._markApplyDirty();
    const current = normalizeStorePhotos(this.data.applyStorePhotos);
    const remain = MAX_STORE_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_STORE_PHOTOS}张`, icon: 'none' });
      return;
    }
    this._choosingApplyPhotos = true;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const picked = (res.tempFiles || []).map((file) => file.tempFilePath);
        if (!picked.length) return;
        const applyStorePhotos = normalizeStorePhotos(current.concat(picked).slice(0, MAX_STORE_PHOTOS));
        this.setData({ applyStorePhotos });
        this._saveApplyDraft();
      },
      complete: () => {
        this._choosingApplyPhotos = false;
      }
    });
  },

  onDeleteApplyPhoto(e) {
    if (this.data.applyStatus === 'pending') return;
    this._markApplyDirty();
    const index = e.currentTarget.dataset.index;
    const applyStorePhotos = [...this.data.applyStorePhotos];
    applyStorePhotos.splice(index, 1);
    this.setData({ applyStorePhotos: normalizeStorePhotos(applyStorePhotos) });
    this._saveApplyDraft();
  },

  onPreviewApplyPhoto(e) {
    if (this.data.photoDrag && this.data.photoDrag.active) return;
    const url = e.currentTarget.dataset.url;
    const urls = this.data.applyStorePhotos || [];
    if (!url || !urls.length) return;
    resolveImageUrls(urls).then((resolved) => {
      const list = resolved.filter(Boolean);
      if (!list.length) return;
      const current = list[urls.indexOf(url)] || list[0];
      wx.previewImage({ current, urls: list });
    });
  },

  onChooseApplyLicense() {
    if (this.data.applyStatus === 'pending') return;
    this._markApplyDirty();
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this.setData({ applyBusinessLicense: file.tempFilePath });
        this._saveApplyDraft();
      }
    });
  },

  onDeleteApplyLicense() {
    if (this.data.applyStatus === 'pending') return;
    this._markApplyDirty();
    this.setData({ applyBusinessLicense: '' });
    this._saveApplyDraft();
  },

  onPreviewApplyLicense() {
    const url = normalizeBusinessLicense(this.data.applyBusinessLicense);
    if (!url) return;
    resolveImageUrls([url]).then((resolved) => {
      const current = (resolved && resolved[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
  },

  _getPhotoList(listKey) {
    if (listKey === 'apply') return normalizeStorePhotos(this.data.applyStorePhotos);
    if (listKey === 'intro') return normalizeIntroPhotos(this.data.introPhotos);
    if (listKey === 'notice') return normalizeNoticePhotos(this.data.noticePhotos);
    if (listKey === 'hfNotice') return normalizeNoticePhotos((this.data.hf || {}).noticePhotos);
    if (listKey === 'washNotice') return normalizeNoticePhotos(this.data.washNoticePhotos);
    if (listKey === 'hfWashNotice') return normalizeNoticePhotos((this.data.hf || {}).washNoticePhotos);
    return normalizeStorePhotos(this.data.storePhotos);
  },

  _setPhotoList(listKey, photos) {
    if (listKey === 'apply') {
      const next = normalizeStorePhotos(photos);
      this._markApplyDirty();
      this.setData({ applyStorePhotos: next });
      this._saveApplyDraft();
      return;
    }
    this._markDirty();
    if (listKey === 'intro') {
      this._applyIntroPhotos(photos);
      return;
    }
    if (listKey === 'notice') {
      this._applyNoticePhotos(photos);
      return;
    }
    if (listKey === 'hfNotice') {
      const normalized = normalizeNoticePhotos(photos);
      const homeFeeding = { ...(this.data.shop.homeFeeding || {}), noticePhotos: normalized };
      this.setData({
        shop: { ...this.data.shop, homeFeeding },
        hf: { ...(this.data.hf || {}), noticePhotos: normalized }
      });
      return;
    }
    if (listKey === 'washNotice') {
      this._applyWashNoticePhotos(photos);
      return;
    }
    if (listKey === 'hfWashNotice') {
      const normalized = normalizeNoticePhotos(photos);
      const homeFeeding = { ...(this.data.shop.homeFeeding || {}), washNoticePhotos: normalized };
      this.setData({
        shop: { ...this.data.shop, homeFeeding },
        hf: { ...(this.data.hf || {}), washNoticePhotos: normalized }
      });
      return;
    }
    this._applyStorePhotos(photos);
  },

  _clearPhotoDrag() {
    this._dragState = null;
    this._pendingDragFrame = null;
    this.setData({
      photoDrag: {
        active: false,
        listKey: '',
        fromIndex: -1,
        targetIndex: -1,
        ghostUrl: '',
        ghostX: 0,
        ghostY: 0,
        ghostSize: 100
      }
    });
  },

  _findDropIndex(clientX, clientY, rects, fallbackIndex) {
    if (!rects || !rects.length) return fallbackIndex;
    let bestIndex = fallbackIndex;
    let bestDist = Infinity;
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i];
      if (!rect) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = (clientX - cx) * (clientX - cx) + (clientY - cy) * (clientY - cy);
      if (
        clientX >= rect.left - 8
        && clientX <= rect.right + 8
        && clientY >= rect.top - 8
        && clientY <= rect.bottom + 8
      ) {
        return i;
      }
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    return bestIndex;
  },

  _flushPhotoDragFrame() {
    this._pendingDragFrame = null;
    const drag = this._dragState;
    if (!drag || !drag.active) return;
    const updates = {
      'photoDrag.ghostX': drag.ghostX,
      'photoDrag.ghostY': drag.ghostY
    };
    if (drag.targetIndex !== this.data.photoDrag.targetIndex) {
      updates['photoDrag.targetIndex'] = drag.targetIndex;
    }
    this.setData(updates);
  },

  onPhotoTouchStart(e) {
    const touch = (e.touches && e.touches[0]) || null;
    if (touch) {
      this._lastPhotoTouch = {
        clientX: touch.clientX,
        clientY: touch.clientY
      };
    }
  },

  onPhotoLongPress(e) {
    const listKey = e.currentTarget.dataset.list;
    const index = Number(e.currentTarget.dataset.index);
    if (listKey === 'apply' && this.data.applyStatus === 'pending') return;
    const photos = this._getPhotoList(listKey);
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) return;

    const touch = (e.touches && e.touches[0])
      || (e.changedTouches && e.changedTouches[0])
      || this._lastPhotoTouch
      || null;

    const query = wx.createSelectorQuery();
    query.select(`#store-photo-${listKey}-${index}`).boundingClientRect();
    query.selectAll(`.store-photo-item-${listKey}`).boundingClientRect();
    query.exec((res) => {
      const itemRect = res && res[0];
      const rects = (res && res[1]) || [];
      if (!itemRect) return;

      const clientX = touch ? touch.clientX : (itemRect.left + itemRect.width / 2);
      const clientY = touch ? touch.clientY : (itemRect.top + itemRect.height / 2);
      const offsetX = clientX - itemRect.left;
      const offsetY = clientY - itemRect.top;
      const ghostUrl = photos[index];

      this._dragState = {
        active: true,
        listKey,
        fromIndex: index,
        targetIndex: index,
        offsetX,
        offsetY,
        rects,
        ghostX: itemRect.left,
        ghostY: itemRect.top,
        ghostSize: itemRect.width
      };

      this.setData({
        photoDrag: {
          active: true,
          listKey,
          fromIndex: index,
          targetIndex: index,
          ghostUrl,
          ghostX: itemRect.left,
          ghostY: itemRect.top,
          ghostSize: itemRect.width
        }
      });

      if (wx.vibrateShort) {
        wx.vibrateShort({ type: 'light' });
      }

      // 云文件等异步解析，不阻塞抬起动画
      if (ghostUrl && String(ghostUrl).indexOf('cloud://') === 0) {
        resolveImageUrls([ghostUrl]).then((resolved) => {
          if (!this._dragState || !this._dragState.active) return;
          const url = resolved && resolved[0];
          if (url) this.setData({ 'photoDrag.ghostUrl': url });
        });
      }
    });
  },

  onPhotoTouchMove(e) {
    const drag = this._dragState;
    if (!drag || !drag.active) return;
    const touch = (e.touches && e.touches[0]) || null;
    if (!touch) return;

    this._lastPhotoTouch = {
      clientX: touch.clientX,
      clientY: touch.clientY
    };
    drag.ghostX = touch.clientX - drag.offsetX;
    drag.ghostY = touch.clientY - drag.offsetY;
    drag.targetIndex = this._findDropIndex(
      touch.clientX,
      touch.clientY,
      drag.rects,
      drag.fromIndex
    );

    if (this._pendingDragFrame) return;
    this._pendingDragFrame = true;
    setTimeout(() => this._flushPhotoDragFrame(), 16);
  },

  onPhotoTouchEnd() {
    const drag = this._dragState;
    if (!drag || !drag.active) {
      this._clearPhotoDrag();
      return;
    }

    const { listKey, fromIndex, targetIndex } = drag;
    if (fromIndex !== targetIndex) {
      const photos = this._getPhotoList(listKey);
      if (listKey === 'intro') {
        this._setPhotoList(listKey, reorderPhotoList(photos, fromIndex, targetIndex, MAX_INTRO_PHOTOS));
      } else if (listKey === 'notice') {
        this._setPhotoList(listKey, reorderPhotoList(photos, fromIndex, targetIndex, MAX_NOTICE_PHOTOS));
      } else if (listKey === 'hfNotice') {
        this._setPhotoList(listKey, reorderPhotoList(photos, fromIndex, targetIndex, MAX_NOTICE_PHOTOS));
      } else if (listKey === 'washNotice') {
        this._setPhotoList(listKey, reorderPhotoList(photos, fromIndex, targetIndex, MAX_NOTICE_PHOTOS));
      } else if (listKey === 'hfWashNotice') {
        this._setPhotoList(listKey, reorderPhotoList(photos, fromIndex, targetIndex, MAX_NOTICE_PHOTOS));
      } else {
        this._setPhotoList(listKey, reorderStorePhotos(photos, fromIndex, targetIndex));
      }
    }
    this._clearPhotoDrag();
  },

  onSubmitApply() {
    if (this.data.submitting || this.data.applyStatus === 'pending') return;
    const shop = { ...this.data.applyShop };
    const storePhotos = normalizeStorePhotos(this.data.applyStorePhotos);
    const formError = validateApplyForm({ shop, storePhotos });
    if (formError) {
      showValidationAlert(formError);
      return;
    }

    if (!this.data.agreedToCoopContract || !this.data.signedCoopContractDraft) {
      showValidationAlert('请先阅读并签署《商家入驻平台合作协议》', '需要签署协议');
      return;
    }

    const signedCoopContractDraft = this.data.signedCoopContractDraft;
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });

    this._readWxNickNameFromInput()
      .then((nick) => {
        const wxNickName = nick;
        if (!isAuthorizedNickName(wxNickName)) {
          const err = new Error('请先获取微信昵称，便于平台审核识别申请人');
          err.__validation = true;
          err.title = '需要微信昵称';
          throw err;
        }
        this.setData({ wxNickName });
        return app.updateProfile({ nickName: wxNickName }).then(() => wxNickName);
      })
      .then((wxNickName) => Promise.all([
        uploadStorePhotos(storePhotos),
        uploadBusinessLicense(this.data.applyBusinessLicense)
      ]).then(([uploadedPhotos, businessLicense]) => ({ wxNickName, uploadedPhotos, businessLicense })))
      .then(({ wxNickName, uploadedPhotos, businessLicense }) => storeApi.submitMerchantApply({
        ...shop,
        storePhotos: uploadedPhotos,
        businessLicense: businessLicense || '',
        coopContractSigned: true,
        coopContractSignTime: signedCoopContractDraft.signTime,
        coopContractSnapshot: signedCoopContractDraft
      }).then((res) => ({ res, wxNickName, uploadedPhotos, businessLicense })))
      .then(({ res, wxNickName, uploadedPhotos, businessLicense }) => {
        if (!res || !res.success || !res.store) {
          throw new Error((res && res.errMsg) || '提交失败');
        }
        const store = {
          ...res.store,
          storePhotos: (res.store.storePhotos && res.store.storePhotos.length)
            ? res.store.storePhotos
            : uploadedPhotos,
          businessLicense: res.store.businessLicense || businessLicense || ''
        };
        // 先切到 pending，避免 rejected 态下店铺写入被体验模式逻辑干扰
        const user = {
          ...(app.globalData.userInfo || {}),
          nickName: wxNickName,
          store_id: store.store_id,
          visitStoreId: store.store_id,
          merchantStoreId: store.store_id,
          merchantStatus: 'pending',
          isMerchant: false,
          role: 'user'
        };
        app.globalData.userInfo = user;
        app.globalData.isMerchant = false;
        app.globalData.role = 'user';
        app.setData(STORAGE_KEYS.USER, user);
        app.saveShop(store);
        if (app._bindOwnStoreAsVisit) {
          app._bindOwnStoreAsVisit(store.store_id);
        }
        return app.refreshUserRole().then(() => store);
      })
      .then((store) => {
        wx.hideLoading();
        this._applyFormDirty = false;
        wx.removeStorageSync(STORAGE_KEYS.DEMO_APPLY_DRAFT);
        this.setData({
          agreedToCoopContract: false,
          signedCoopContractDraft: null,
          applyRejectReason: '',
          applyBusinessLicense: normalizeBusinessLicense(store.businessLicense)
        });
        app.globalData.signedCoopContractDraft = null;
        this._applyFormFromShop(store, 'pending');
        this._afterApplySuccess();
      })
      .catch((err) => {
        wx.hideLoading();
        if (err && err.__validation) {
          showValidationAlert(err.message, err.title || '提示');
          return;
        }
        wx.showToast({
          title: (err && err.message) || '提交失败',
          icon: 'none',
          duration: 3000
        });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },

  _afterApplySuccess() {
    wx.showToast({ title: '申请已提交', icon: 'success', duration: 1500 });
    const user = (app.globalData && app.globalData.userInfo) || {};
    if (isOaBound(user)) return;
    setTimeout(() => {
      this.setData({ oaFollowSheetVisible: true });
    }, 800);
  },

  onCloseOaFollowSheet() {
    this.setData({ oaFollowSheetVisible: false });
  },

  onOaFollowSheetFollowed() {},

  _buildCoopContractDraft() {
    const user = app.globalData.userInfo || {};
    return buildMerchantCoopContract({
      user,
      shop: this.data.shop
    });
  },

  _validateBeforeCoopContract() {
    const shop = this.data.shop || {};
    if (!(shop.name || '').trim()) return '请先填写店铺名称';
    if (!(shop.address || '').trim()) return '请先选择营业地址';
    if (!(shop.contactPhone || '').trim()) return '请先填写联系电话';
    if (!(shop.legalName || '').trim()) return '请先填写负责人姓名';
    return '';
  },

  onViewCoopContract() {
    const formError = this._validateBeforeCoopContract();
    if (formError) {
      showValidationAlert(formError, '无法预览协议');
      return;
    }
    const doc = this.data.shop.coopContractSigned && this.data.shop.coopContractSnapshot
      ? this.data.shop.coopContractSnapshot
      : this._buildCoopContractDraft();
    this.setData({
      showCoopContractModal: true,
      coopContractMode: 'preview',
      coopContractDoc: doc
    });
    this._setTabBarVisible(false);
  },

  onGoSignCoopContract() {
    const formError = this._validateBeforeCoopContract();
    if (formError) {
      showValidationAlert(formError, '无法签署协议');
      return;
    }
    this.setData({
      showCoopContractModal: true,
      coopContractMode: 'sign',
      coopContractDoc: this._buildCoopContractDraft()
    });
    this._setTabBarVisible(false);
  },

  onCloseCoopContractModal() {
    this.setData({
      showCoopContractModal: false,
      coopContractMode: 'preview',
      coopContractDoc: null
    });
    this._setTabBarVisible(true);
  },

  onConfirmCoopSign() {
    const base = this.data.coopContractDoc || this._buildCoopContractDraft();
    const doc = {
      ...base,
      signed: true,
      signTime: new Date().toLocaleString('zh-CN'),
      signMethod: 'electronic'
    };
    this._markDirty();
    const shop = {
      ...this.data.shop,
      coopContractSigned: true,
      coopContractSignTime: doc.signTime,
      coopContractSnapshot: doc
    };
    this.setData({
      shop,
      showCoopContractModal: false,
      coopContractMode: 'preview',
      coopContractDoc: null
    });
    this._setTabBarVisible(true);
    this._syncBasicSaveText();
    wx.showToast({ title: '签署成功', icon: 'success' });
  },

  _markDirty() {
    this._formDirty = true;
  },

  _applyShopToForm(storeShop) {
    const normalizedShop = this._normalizeShop(storeShop);
    prefetchStoreShareImage(normalizedShop);
    const cloudRules = normalizedShop.billingRules || {};
    const hasCloudRules = !!(cloudRules && Object.keys(cloudRules).length);
    // 无云端计费时用默认，禁止把上一店本地 pet_billing_rules 带回新店
    const rules = hasCloudRules
      ? { ...app._defaultBillingRules(), ...cloudRules }
      : app._defaultBillingRules();
    if (!this._isEmptyShopPreview()) {
      app.saveBillingRules(rules);
    }
    const receptionState = pickReceptionRangeState(normalizedShop);
    const billingState = pickBillingState(rules);
    const serviceLineState = this._pickServiceLineState(normalizedShop, {
      activeServiceTab: this.data.activeServiceTab || 'boarding',
      settingsTab: this.data.settingsTab,
      billingRules: rules
    });
    this.setData({
      shop: normalizedShop,
      businessStatus: normalizeStoreStatus(normalizedShop.status),
      storePhotos: normalizeStorePhotos(normalizedShop.storePhotos),
      introPhotos: normalizeIntroPhotos(normalizedShop.introPhotos),
      noticePhotos: normalizeNoticePhotos(normalizedShop.noticePhotos),
      washNoticePhotos: normalizeNoticePhotos(normalizedShop.washNoticePhotos),
      pickupFreeMode: hasPickupFreeOffer(normalizedShop) ? 'minDays' : 'none',
      pickupFreeTiers: normalizePickupFreeTiersForEdit(normalizedShop),
      washPricing: normalizeWashPricing(normalizedShop.washPricing || []),
      washProducts: normalizeWashProductsForUi(normalizedShop.washProducts),
      washValueAddedServices: normalizeWashProductsForUi(normalizedShop.washValueAddedServices),
      washFreeMode: parseWashFreeMinDays(normalizedShop.washFreeMinDays) > 0 ? 'minDays' : 'none',
      valueAddedServices: resolveStoreValueAddedServices(normalizedShop),
      membership: normalizedShop.membership || this.data.membership,
      hf: this._buildHomeFeedingForm(normalizedShop.homeFeeding),
      ...billingState,
      ...pickBusinessHoursState(normalizedShop),
      ...receptionState,
      ...serviceLineState,
      ...this._pickContractClauseState(normalizedShop)
    });
    this._syncBasicSaveText();
  },

  onGoMembership() {
    wx.navigateTo({ url: '/packageExtra/membership/membership' });
  },

  onGoHolidayPricing(e) {
    const line = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.line;
    if (line === 'homeFeeding') {
      wx.navigateTo({
        url: '/packageBiz/holiday-pricing/holiday-pricing?serviceLine=homeFeeding'
      });
      return;
    }
    wx.navigateTo({ url: '/packageBiz/holiday-pricing/holiday-pricing?serviceLine=boarding' });
  },

  _refreshHolidayPricingSummary() {
    const shop = this._isEmptyShopPreview()
      ? (previewShopCache || this.data.shop || {})
      : (app.getShop() || {});
    const boardingRules = {
      ...app.getBillingRules(),
      ...(shop.billingRules || {})
    };
    const hf = normalizeHomeFeeding(
      (shop.homeFeeding || (this.data.shop && this.data.shop.homeFeeding) || {})
    );
    const hfForm = this.data.hf || {};
    this.setData({
      holidayPricingSummary: formatHolidayPricingSummary(boardingRules.holidayPricing),
      hf: {
        ...hfForm,
        offer: {
          ...(hfForm.offer || emptyVisitOfferForm()),
          holidayPricingSummary: formatHolidayPricingSummary(hf.holidayPricing)
        }
      }
    });
  },

  _pickContractClauseState(shop) {
    const customized = isCustomContractSettings(shop);
    return {
      contractClauseCustomized: customized,
      contractClauseSummary: customized ? '已自定义协议条款' : '使用平台默认条款'
    };
  },

  _normalizeShop(shop) {
    const source = hydrateShopProfileFromCoop(shop || {});
    const businessHours = normalizeBusinessHours(source.businessHours, source.hours);
    const status = normalizeStoreStatus(source.status);
    const receptionRange = normalizeReceptionRange(source.receptionRange || source.range);
    const storePhotos = normalizeStorePhotos(source.storePhotos);
    const introPhotos = normalizeIntroPhotos(source.introPhotos);
    const noticePhotos = normalizeNoticePhotos(source.noticePhotos);
    const locationName = (source.locationName || '').trim();
    const addressRegion = (source.addressRegion || '').trim();
    const address = formatLocationAddress({
      name: locationName,
      address: addressRegion || source.address
    }) || (source.address || '').trim();
    return {
      ...source,
      businessHours,
      hours: formatBusinessHoursText(businessHours),
      status,
      receptionRange,
      range: formatReceptionRangeText(receptionRange),
      storePhotos,
      introPhotos,
      noticePhotos,
      name: source.name || '',
      intro: source.intro || '',
      notice: source.notice || '',
      locationName,
      addressRegion,
      address,
      pickupService: source.pickupService === 'yes' ? 'yes' : 'no',
      pickupNotice: source.pickupNotice || '',
      serviceLines: normalizeServiceLines(source.serviceLines),
      washProducts: normalizeWashProducts(source.washProducts),
      washValueAddedServices: normalizeWashProducts(source.washValueAddedServices),
      homeFeeding: normalizeHomeFeeding(source.homeFeeding),
      wechatId: (source.wechatId || '').trim(),
      contactPhone: normalizePhone(source.contactPhone || ''),
      legalName: (source.legalName || '').trim(),
      businessLicense: normalizeBusinessLicense(source.businessLicense),
      coopContractSigned: !!source.coopContractSigned,
      coopContractSignTime: source.coopContractSignTime || '',
      coopContractSnapshot: source.coopContractSnapshot || null,
      ...normalizePickupPricing(source),
      ...normalizeWashFields(source),
      valueAddedServices: resolveStoreValueAddedServices(source),
      washNoticePhotos: normalizeNoticePhotos(source.washNoticePhotos),
      deposit: normalizeDeposit(source.deposit),
      compensationLimit: source.compensationLimit != null && source.compensationLimit !== ''
        ? String(source.compensationLimit)
        : '',
      boardingContractClauseText: source.boardingContractClauseText || ''
    };
  },

  _applyStorePhotos(storePhotos) {
    const normalized = normalizeStorePhotos(storePhotos);
    const shop = { ...this.data.shop, storePhotos: normalized };
    this.setData({ shop, storePhotos: normalized });
  },

  _applyIntroPhotos(introPhotos) {
    const normalized = normalizeIntroPhotos(introPhotos);
    const shop = { ...this.data.shop, introPhotos: normalized };
    this.setData({ shop, introPhotos: normalized });
  },

  _applyNoticePhotos(noticePhotos) {
    const normalized = normalizeNoticePhotos(noticePhotos);
    const shop = { ...this.data.shop, noticePhotos: normalized };
    this.setData({ shop, noticePhotos: normalized });
  },

  _applyWashNoticePhotos(washNoticePhotos) {
    const normalized = normalizeNoticePhotos(washNoticePhotos);
    const shop = { ...this.data.shop, washNoticePhotos: normalized };
    this.setData({ shop, washNoticePhotos: normalized });
  },

  _applyReceptionRange(receptionRange) {
    const normalized = normalizeReceptionRange(receptionRange);
    const shop = {
      ...this.data.shop,
      receptionRange: normalized,
      range: formatReceptionRangeText(normalized)
    };
    this.setData({
      shop,
      receptionRange: normalized,
      receptionRangeOptions: buildReceptionRangeOptions(normalized),
      receptionRangeSummary: formatReceptionRangeText(normalized),
      hf: {
        ...(this.data.hf || {}),
        serviceItems: refreshVisitServicePetTypeOptions(
          (this.data.hf && this.data.hf.serviceItems) || [],
          normalized
        )
      }
    });
  },

  onSettingsTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.settingsTab) return;
    const patch = { settingsTab: tab };
    if (tab === 'boarding' || tab === 'wash' || tab === 'homeFeeding') {
      this._syncServiceLineView({
        settingsTab: tab,
        moduleSubTab: 'basic',
        activeServiceTab: tab
      });
      return;
    }
    this.setData(patch);
  },

  onModuleSubTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.moduleSubTab) return;
    this.setData({ moduleSubTab: tab });
  },

  _pickServiceLineState(shop, extra) {
    const opts = extra || {};
    const src = shop || {};
    const billingRules = opts.billingRules
      || src.billingRules
      || this._getBillingRulesPayload();
    const homeFeeding = src.homeFeeding || emptyHomeFeeding();
    return pickServiceLineView(src, {
      boardingComplete: isBoardingPricingComplete(src, billingRules),
      washComplete: isWashProductsComplete(src.washProducts),
      homeFeedingComplete: isHomeFeedingPricingComplete(
        { ...src, homeFeeding },
        homeFeeding.billingRules || {}
      ),
      activeServiceTab: opts.activeServiceTab != null ? opts.activeServiceTab : this.data.activeServiceTab,
      settingsTab: opts.settingsTab != null ? opts.settingsTab : this.data.settingsTab
    });
  },

  _syncServiceLineView(patch) {
    const extra = patch || {};
    const shop = extra.shop || this.data.shop;
    this.setData({
      ...extra,
      ...this._pickServiceLineState(shop, extra)
    });
  },

  onSelectServiceLine(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.setData({
      settingsTab: key,
      moduleSubTab: 'basic',
      activeServiceTab: key,
      currentModuleCard: (this.data.serviceLineCards || []).find((item) => item.key === key) || null
    });
  },

  _isServiceLineDataComplete(key) {
    const shop = this.data.shop || {};
    if (key === 'boarding') {
      return isBoardingPricingComplete(shop, this._getBillingRulesPayload());
    }
    if (key === 'wash') {
      return isWashProductsComplete(shop.washProducts);
    }
    if (key === 'homeFeeding') {
      const homeFeeding = shop.homeFeeding || emptyHomeFeeding();
      return isHomeFeedingPricingComplete(
        { ...shop, homeFeeding },
        homeFeeding.billingRules || {}
      );
    }
    return false;
  },

  _serviceLineIncompleteTip(key) {
    if (key === 'boarding') return '请先完善并保存到店寄养设置后再开通';
    if (key === 'wash') return '请先完善并保存美容洗护设置后再开通';
    if (key === 'homeFeeding') return '请先完善并保存上门服务项目后再开通';
    return '请先完善并保存服务设置后再开通';
  },

  onToggleServiceLine(e) {
    const key = e.currentTarget.dataset.key;
    const enabled = !!(e.detail && e.detail.value);
    const current = normalizeServiceLines(this.data.shop.serviceLines);
    const isNewShop = normalizeStoreStatus(this.data.businessStatus || this.data.shop.status) === STATUS_INCOMPLETE;
    if (!enabled && current[key] && !isNewShop && !hasOtherEnabledServiceLine(current, key)) {
      wx.showToast({ title: '至少保留一个已开通的服务', icon: 'none' });
      this._syncServiceLineView();
      return;
    }
    if (enabled && !this._isServiceLineDataComplete(key)) {
      wx.showToast({ title: this._serviceLineIncompleteTip(key), icon: 'none' });
      this._syncServiceLineView();
      return;
    }
    this._markDirty();
    const serviceLines = { ...current, [key]: enabled };
    const shop = { ...this.data.shop, serviceLines };
    this._syncServiceLineView({
      shop,
      activeServiceTab: enabled ? key : this.data.activeServiceTab
    });
  },

  onContactPhoneInput(e) {
    this._markDirty();
    const contactPhone = normalizePhone(e.detail.value);
    this.setData({ shop: { ...this.data.shop, contactPhone } });
  },

  onContactPhoneBlur() {
    const phone = this.data.shop.contactPhone;
    if (!phone) return;
    const err = validateMobilePhone(phone, {
      emptyMsg: '',
      invalidMsg: '联系电话需为标准的11位手机号'
    });
    if (err) showValidationAlert(err);
  },

  onChooseBusinessLicense() {
    if (this._choosingLicense) return;
    this._choosingLicense = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = (((res.tempFiles || [])[0] || {}).tempFilePath) || '';
        if (!path) return;
        this._markDirty();
        this.setData({
          shop: { ...this.data.shop, businessLicense: path }
        });
      },
      complete: () => {
        this._choosingLicense = false;
      }
    });
  },

  onDeleteBusinessLicense() {
    this._markDirty();
    this.setData({
      shop: { ...this.data.shop, businessLicense: '' }
    });
  },

  onPreviewBusinessLicense() {
    const url = this.data.shop.businessLicense;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onBillingMode(e) {
    this._markDirty();
    const billingMode = e.detail.value;
    const patch = { billingMode };
    if (billingMode === 'custom') {
      const list = normalizeCustomPricingForUi(this._form().customPricing);
      if (!list.length) patch.customPricing = normalizeCustomPricingForUi(getDefaultCustomPricing());
    }
    this._setForm(patch);
  },

  _applyBusinessHours(businessHours) {
    const normalized = normalizeBusinessHours(businessHours);
    const shop = {
      ...this.data.shop,
      businessHours: normalized,
      hours: formatBusinessHoursText(normalized)
    };
    this.setData({
      shop,
      businessHours: normalized,
      weekdayOptions: buildWeekdayOptions(normalized.weekdays),
      hoursSummary: formatBusinessHoursText(normalized)
    });
  },

  _updateChargeSummary() {
    const form = this._form();
    this._setForm({
      chargeSummary: buildChargeSummary({
        checkInDayCharge: form.checkInDayCharge,
        departureDayCharge: form.departureDayCharge,
        departureCharge: form.departureCharge
      })
    });
  },

  _getPickupFreePayload() {
    if (this.data.pickupFreeMode !== 'minDays') {
      return {
        pickupFreeTiers: [],
        pickupFreeMinDays: '',
        pickupFreeMaxKm: ''
      };
    }
    const pickupFreeTiers = normalizePickupFreeTiers(this.data.pickupFreeTiers);
    const legacy = pickupFreeTiers[0] || null;
    return {
      pickupFreeTiers,
      pickupFreeMinDays: legacy ? legacy.minDays : '',
      pickupFreeMaxKm: legacy ? legacy.maxKm : ''
    };
  },

  _getStoreFormPayload() {
    const billingRules = this._getBillingRulesPayload();
    const pickupFree = this._getPickupFreePayload();
    const washService = this.data.shop.washService === 'yes' ? 'yes' : 'no';
    const washFreeMinDays = washService === 'yes' && this.data.washFreeMode === 'minDays'
      ? (this.data.shop.washFreeMinDays || '')
      : '';
    return {
      shop: {
        ...this.data.shop,
        ...pickupFree,
        serviceLines: normalizeServiceLines(this.data.shop.serviceLines),
        washService,
        washPricing: washService === 'yes'
          ? normalizeWashPricing(this.data.washPricing)
          : (this.data.shop.washPricing || getDefaultWashPricing()),
        washFreeMinDays,
        businessHours: this.data.businessHours,
        receptionRange: this.data.receptionRange,
        storePhotos: this.data.storePhotos,
        introPhotos: this.data.introPhotos,
        noticePhotos: this.data.noticePhotos,
        washNotice: washService === 'yes' ? (this.data.shop.washNotice || '') : '',
        washNoticePhotos: washService === 'yes'
          ? normalizeNoticePhotos(this.data.washNoticePhotos)
          : [],
        washProducts: compactWashProducts(this.data.washProducts),
        washValueAddedServices: compactWashProducts(this.data.washValueAddedServices),
        homeFeeding: this._getHomeFeedingPayload(),
        valueAddedServices: normalizeValueAddedServices(this.data.valueAddedServices)
      },
      businessHours: this.data.businessHours,
      receptionRange: this.data.receptionRange,
      storePhotos: this.data.storePhotos,
      introPhotos: this.data.introPhotos,
      noticePhotos: this.data.noticePhotos,
      washNoticePhotos: this.data.washNoticePhotos,
      washProducts: this.data.washProducts,
      washValueAddedServices: this.data.washValueAddedServices,
      homeFeeding: this.data.shop.homeFeeding,
      valueAddedServices: this.data.valueAddedServices,
      billingRules,
      checkInDayCharge: this.data.checkInDayCharge,
      departureDayCharge: this.data.departureDayCharge,
      departureCharge: this.data.departureCharge
    };
  },

  _validateWashForm() {
    return validateWashProducts(this.data.washProducts, { required: true })
      || validateWashProducts(this.data.washValueAddedServices, { required: false, noun: '洗护增值服务' });
  },

  _validateHomeFeedingBasicForm() {
    return validateHomeFeedingAdvanced(this._getHomeFeedingPayload())
      || validateHomeVisitPricing(this._getHomeFeedingPayload(), { required: true });
  },

  _validateStoreForm() {
    const error = validateStoreForm(this._getStoreFormPayload());
    if (error) return error;
    if (this.data.shop.pickupService === 'yes' && this.data.pickupFreeMode === 'minDays') {
      const freeErr = validatePickupFreeTiers(this.data.pickupFreeTiers);
      if (freeErr) return freeErr;
    }
    if (this.data.shop.washService === 'yes' && this.data.washFreeMode === 'minDays') {
      if (!parseWashFreeMinDays(this.data.shop.washFreeMinDays)) {
        return '请填写住几天及以上免费洗护';
      }
    }
    return '';
  },

  _validateBasicForm(options) {
    return validateBasicStoreForm(this._getStoreFormPayload(), options);
  },

  _validateBoardingBasicForm() {
    return validateBillingRules(this._getBillingRulesPayload()) || '';
  },

  _serviceLineKeyForSave(mode) {
    if (mode === 'wash') return 'wash';
    if (mode === 'homeFeeding') return 'homeFeeding';
    if (mode === 'advanced') return 'boarding';
    if (mode === 'basic' && this.data.settingsTab === 'boarding') return 'boarding';
    return '';
  },

  _guideToBoardingService() {
    this._syncServiceLineView({
      settingsTab: 'boarding',
      moduleSubTab: 'basic',
      activeServiceTab: 'boarding'
    });
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop: 0, duration: 280 });
    }, 80);
  },

  _validateAdvancedForm() {
    if (this._isHomeFeedingForm()) {
      return this._validateHomeFeedingBasicForm();
    }
    const error = validateAdvancedStoreForm(this._getStoreFormPayload());
    if (error) return error;
    if (this.data.shop.pickupService === 'yes' && this.data.pickupFreeMode === 'minDays') {
      const freeErr = validatePickupFreeTiers(this.data.pickupFreeTiers);
      if (freeErr) return freeErr;
    }
    if (this.data.shop.washService === 'yes' && this.data.washFreeMode === 'minDays') {
      if (!parseWashFreeMinDays(this.data.shop.washFreeMinDays)) {
        return '请填写住几天及以上免费洗护';
      }
    }
    if (this.data.homeFeedingEnabled) {
      const hfErr = validateHomeFeedingAdvanced(this._getHomeFeedingPayload());
      if (hfErr) return hfErr;
    }
    return '';
  },

  _buildBillingRulesFromForm(form, existing, shopRules, applyTo) {
    const zheRaw = String(form.multiPetDiscountPercent || '').trim();
    const zhe = parseZhe(zheRaw);
    const amountRaw = String(form.multiPetDiscountAmount || '').trim();
    const amount = /^\d+(\.\d{1,2})?$/.test(amountRaw) ? Number(amountRaw) : NaN;
    const multiPetMode = form.multiPetDiscountMode === 'fromSecondFixedPerDay'
      ? 'fromSecondFixedPerDay'
      : 'fromSecondPercent';
    const holidayPricing = normalizeHolidayPricing(
      (shopRules && shopRules.holidayPricing)
        || (existing && existing.holidayPricing)
        || getDefaultHolidayPricing()
    );
    const valueAddedServices = normalizeValueAddedServices(form.valueAddedServices);
    return {
      ...existing,
      billingMode: form.billingMode,
      weightPricing: normalizeWeightPricing(form.weightPricing),
      roomPricing: normalizeRoomPricing(form.roomPricing),
      customPricing: (() => {
        const list = normalizeCustomPricing(form.customPricing).map((item) => ({
          ...item,
          children: (item.children || []).filter((child) => !!(child.name || '').trim())
        }));
        return list.length ? list : getDefaultCustomPricing();
      })(),
      valueAddedServices,
      checkInDayCharge: form.checkInDayCharge,
      departureDayCharge: form.departureDayCharge,
      departureCharge: normalizeDepartureCharge(form.departureCharge),
      holidayPricing,
      multiPetDiscount: (() => {
        if (multiPetMode === 'fromSecondFixedPerDay') {
          const enabled = !!form.multiPetDiscountEnabled && Number.isFinite(amount);
          return {
            enabled,
            mode: multiPetMode,
            zhe: 0,
            percent: 0,
            amount: enabled ? amount : 0,
            applyTo
          };
        }
        if (!form.multiPetDiscountEnabled || !zheRaw) {
          return {
            enabled: false,
            mode: multiPetMode,
            zhe: 0,
            percent: 0,
            amount: 0,
            applyTo
          };
        }
        if (zhe == null) {
          return {
            enabled: true,
            mode: multiPetMode,
            zhe: zheRaw,
            percent: 0,
            amount: 0,
            applyTo
          };
        }
        return {
          enabled: true,
          mode: multiPetMode,
          zhe,
          percent: Math.round((10 - zhe) * 10 * 100) / 100,
          amount: 0,
          applyTo
        };
      })(),
      longTermDiscount: (() => {
        const draft = {
          enabled: !!form.longTermDiscountEnabled,
          tiers: form.longTermDiscountTiers || [],
          applyTo
        };
        if (!draft.enabled) return { enabled: false, tiers: [], applyTo };
        const hasInvalid = (draft.tiers || []).some((tier) => {
          const item = tier || {};
          const daysEmpty = item.minDays === '' || item.minDays == null;
          const zheEmpty = item.zhe === '' || item.zhe == null;
          if (daysEmpty && zheEmpty) return false;
          if (daysEmpty || zheEmpty) return true;
          return parseZhe(item.zhe) == null;
        });
        if (hasInvalid) return draft;
        const normalized = normalizeLongTermDiscount(draft);
        if (!normalized.tiers.length) {
          return { enabled: false, tiers: [], applyTo };
        }
        return { ...normalized, applyTo };
      })()
    };
  },

  _getBillingRulesPayload() {
    return this._buildBillingRulesFromForm(
      this.data,
      app.getBillingRules() || {},
      (this.data.shop && this.data.shop.billingRules) || {},
      'boarding'
    );
  },

  _getHomeFeedingPayload() {
    const hfForm = this.data.hf || {};
    const src = this.data.shop.homeFeeding || emptyHomeFeeding();
    const liveShop = this._isEmptyShopPreview()
      ? (previewShopCache || this.data.shop || {})
      : (app.getShop() || this.data.shop || {});
    const liveHf = normalizeHomeFeeding(liveShop.homeFeeding || src);
    const srcNorm = normalizeHomeFeeding(src);
    const holidayPricing = liveHf.holidayPricing
      || (liveHf.dogPricing && liveHf.dogPricing.holidayPricing)
      || (liveHf.catPricing && liveHf.catPricing.holidayPricing)
      || (srcNorm.holidayPricing)
      || getDefaultHolidayPricing();
    const multiPetDiscount = buildMultiPetDiscountFromForm(hfForm.offer, 'homeFeeding');
    const serviceItems = compactVisitServices(hfForm.serviceItems).map((item) => ({
      ...item,
      ...compactVisitSurcharge(item)
    }));
    const primarySurcharge = serviceItems.find((item) => isSurchargeEnabled(item)) || serviceItems[0] || {};
    const draft = {
      serviceItems,
      includedKm: primarySurcharge.includedKm,
      surchargeEnabled: !!primarySurcharge.surchargeEnabled,
      surchargeTiers: primarySurcharge.surchargeTiers,
      multiPetDiscount,
      holidayPricing
    };
    const legacy = deriveLegacyPricingFromItems(draft);
    const catPricing = {
      ...legacy.catPricing,
      multiPetDiscount,
      holidayPricing,
      enabled: !!(legacy.catPricing && (legacy.catPricing.packages || []).length)
    };
    const dogPricing = {
      ...legacy.dogPricing,
      multiPetDiscount,
      holidayPricing,
      enabled: !!(legacy.dogPricing && (legacy.dogPricing.packages || []).length)
    };
    return normalizeHomeFeeding({
      ...srcNorm,
      pickupService: 'no',
      pickupNotice: '',
      pickupFreeTiers: [],
      pickupFreeMinDays: '',
      pickupFreeMaxKm: '',
      washService: 'no',
      washPricing: [],
      washFreeMinDays: '',
      washNotice: '',
      washNoticePhotos: [],
      valueAddedServices: [],
      serviceItems,
      includedKm: primarySurcharge.includedKm || 0,
      surchargeEnabled: !!primarySurcharge.surchargeEnabled,
      surchargeTiers: primarySurcharge.surchargeTiers || [],
      multiPetDiscount,
      holidayPricing,
      deposit: 0,
      noticePhotos: hfForm.noticePhotos,
      catPricing,
      dogPricing
    });
  },

  onMultiPetDiscountSwitch(e) {
    this._markDirty();
    const enabled = !!(e.detail && e.detail.value);
    const form = this._form();
    this._setForm({
      multiPetDiscountEnabled: enabled,
      multiPetDiscountPercent: enabled ? (form.multiPetDiscountPercent || '') : form.multiPetDiscountPercent
    });
  },

  onMultiPetDiscountPercentInput(e) {
    this._markDirty();
    const value = sanitizeZheInput((e.detail && e.detail.value) || '');
    this._setForm({ multiPetDiscountPercent: value });
  },

  onMultiPetDiscountModeChange(e) {
    this._markDirty();
    const value = e.detail && e.detail.value;
    this._setForm({
      multiPetDiscountMode: value === 'fromSecondFixedPerDay'
        ? 'fromSecondFixedPerDay'
        : 'fromSecondPercent'
    });
  },

  onMultiPetDiscountAmountInput(e) {
    this._markDirty();
    let value = String((e.detail && e.detail.value) || '').replace(/[^\d.]/g, '');
    const dot = value.indexOf('.');
    if (dot >= 0) {
      value = `${value.slice(0, dot + 1)}${value.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
    }
    this._setForm({ multiPetDiscountAmount: value });
  },

  _visitOfferKey() {
    return 'offer';
  },

  _patchVisitOffer(pet, patch) {
    this._markDirty();
    const hf = this.data.hf || {};
    this.setData({
      hf: {
        ...hf,
        offer: { ...(hf.offer || emptyVisitOfferForm()), ...patch }
      }
    });
  },

  onVisitOfferSwitch(e) {
    const enabled = !!(e.detail && e.detail.value);
    const offer = ((this.data.hf || {}).offer) || emptyVisitOfferForm();
    this._patchVisitOffer('', {
      multiPetDiscountEnabled: enabled,
      multiPetDiscountPercent: enabled ? (offer.multiPetDiscountPercent || '') : offer.multiPetDiscountPercent
    });
  },

  onVisitOfferPercentInput(e) {
    this._patchVisitOffer('', {
      multiPetDiscountPercent: sanitizeZheInput((e.detail && e.detail.value) || '')
    });
  },

  onVisitOfferModeChange(e) {
    const value = e.detail && e.detail.value;
    this._patchVisitOffer('', {
      multiPetDiscountMode: value === 'fromSecondFixedPerDay'
        ? 'fromSecondFixedPerDay'
        : 'fromSecondPercent'
    });
  },

  onVisitOfferAmountInput(e) {
    let value = String((e.detail && e.detail.value) || '').replace(/[^\d.]/g, '');
    const dot = value.indexOf('.');
    if (dot >= 0) {
      value = `${value.slice(0, dot + 1)}${value.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
    }
    this._patchVisitOffer('', { multiPetDiscountAmount: value });
  },

  onLongTermDiscountSwitch(e) {
    this._markDirty();
    const form = this._form();
    const enabled = !!(e.detail && e.detail.value);
    const tiers = (form.longTermDiscountTiers && form.longTermDiscountTiers.length)
      ? form.longTermDiscountTiers
      : [{ minDays: '', zhe: '' }];
    this._setForm({
      longTermDiscountEnabled: enabled,
      longTermDiscountTiers: tiers
    });
  },

  onLongTermTierField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    if (!Number.isInteger(index) || (field !== 'minDays' && field !== 'zhe')) return;
    this._setForm({
      longTermDiscountTiers: updateLongTermTierField(
        this._form().longTermDiscountTiers,
        index,
        field,
        e.detail.value
      )
    });
  },

  onAddLongTermTier() {
    this._markDirty();
    this._setForm({
      longTermDiscountTiers: addLongTermTier(this._form().longTermDiscountTiers)
    });
  },

  onRemoveLongTermTier(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this._setForm({
      longTermDiscountTiers: removeLongTermTier(this._form().longTermDiscountTiers, index)
    });
  },

  onField(e) {
    this._markDirty();
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const value = e.detail && e.detail.value;
    // 店铺信息用 wx:if 切走时，微信可能给销毁的 input 回写空值。
    // 这时 settingsTab 已不是 shop，绝不能把名称/介绍冲掉，也不能写到上门对象上。
    const profileFields = {
      name: true,
      intro: true,
      legalName: true,
      contactPhone: true,
      wechatId: true
    };
    if (this.data.settingsTab !== 'shop' && profileFields[field]) return;
    if (this._isHomeFeedingForm()) {
      this.setData({ [`shop.homeFeeding.${field}`]: value });
      return;
    }
    this.setData({ [`shop.${field}`]: value });
  },

  onChooseLogo() {
    if (this._choosingLogo) return;
    this._choosingLogo = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) {
          wx.showToast({ title: '未选择到图片', icon: 'none' });
          return;
        }
        this._markDirty();
        const shop = { ...this.data.shop, logo: path };
        this.setData({ shop });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
      complete: () => {
        this._choosingLogo = false;
      }
    });
  },

  onChooseAddress() {
    chooseStoreLocation(this.data.shop)
      .then((res) => {
        const validationMsg = getLocationValidationMessage(res);
        if (validationMsg) {
          wx.showToast({ title: validationMsg, icon: 'none', duration: 2500 });
          return;
        }
        if (!isValidLocationResult(res)) return;
        this._markDirty();
        const shop = {
          ...this.data.shop,
          address: formatLocationAddress(res),
          locationName: (res.name || '').trim(),
          addressRegion: (res.address || '').trim(),
          latitude: res.latitude,
          longitude: res.longitude
        };
        this.setData({ shop });
      })
      .catch(() => {});
  },

  onCheckInDayCharge(e) {
    this._markDirty();
    this._setForm({ checkInDayCharge: e.detail.value }, () => this._updateChargeSummary());
  },

  onDepartureDayCharge(e) {
    this._markDirty();
    this._setForm({ departureDayCharge: e.detail.value }, () => this._updateChargeSummary());
  },

  onDepartureTimeChange(e) {
    this._markDirty();
    const field = e.currentTarget.dataset.field;
    const departureCharge = normalizeDepartureCharge({
      ...this._form().departureCharge,
      [field]: e.detail.value
    });
    this._setForm({ departureCharge }, () => this._updateChargeSummary());
  },

  onPickupServiceChange(e) {
    this._markDirty();
    const pickupService = e.detail.value;
    const current = this._getServiceShop();
    this._setServiceShop({
      pickupService,
      pickupPricingMode: pickupService === 'yes'
        ? (current.pickupPricingMode || PICKUP_PRICING_MODE.FLAT)
        : current.pickupPricingMode
    });
  },

  onPickupPricingModeChange(e) {
    this._markDirty();
    const mode = e.detail.value === PICKUP_PRICING_MODE.DISTANCE
      ? PICKUP_PRICING_MODE.DISTANCE
      : PICKUP_PRICING_MODE.FLAT;
    this._setServiceShop({ pickupPricingMode: mode });
  },

  onPickupFreeModeChange(e) {
    this._markDirty();
    const pickupFreeMode = e.detail.value === 'minDays' ? 'minDays' : 'none';
    const form = this._form();
    const patch = { pickupFreeMode };
    if (pickupFreeMode === 'minDays') {
      const tiers = (form.pickupFreeTiers && form.pickupFreeTiers.length)
        ? form.pickupFreeTiers
        : createDefaultPickupFreeTiersForEdit();
      patch.pickupFreeTiers = tiers;
    }
    this._setForm(patch);
  },

  onPickupFreeTierField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    if (!Number.isInteger(index) || (field !== 'minDays' && field !== 'maxKm')) return;
    this._setForm({
      pickupFreeTiers: updatePickupFreeTierField(
        this._form().pickupFreeTiers,
        index,
        field,
        e.detail.value
      )
    });
  },

  onAddPickupFreeTier() {
    this._markDirty();
    this._setForm({
      pickupFreeTiers: addPickupFreeTier(this._form().pickupFreeTiers)
    });
  },

  onRemovePickupFreeTier(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this._setForm({
      pickupFreeTiers: removePickupFreeTier(this._form().pickupFreeTiers, index)
    });
  },

  onSetPickupFreeTierTripType(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const tripType = e.currentTarget.dataset.trip;
    if (!Number.isInteger(index) || (tripType !== 'oneWay' && tripType !== 'roundTrip')) return;
    this._setForm({
      pickupFreeTiers: setPickupFreeTierTripType(this._form().pickupFreeTiers, index, tripType)
    });
  },

  onWashServiceChange(e) {
    this._markDirty();
    const washService = e.detail.value;
    this._setServiceShop({ washService });
    if (washService === 'yes' && !(this._form().washPricing && this._form().washPricing.length)) {
      this._setForm({ washPricing: getDefaultWashPricing() });
    }
  },

  onWashFreeModeChange(e) {
    this._markDirty();
    const washFreeMode = e.detail.value === 'minDays' ? 'minDays' : 'none';
    const current = this._getServiceShop();
    const patch = {};
    if (washFreeMode === 'none') patch.washFreeMinDays = '';
    else if (!parseWashFreeMinDays(current.washFreeMinDays)) patch.washFreeMinDays = '7';
    if (Object.keys(patch).length) this._setServiceShop(patch);
    this._setForm({ washFreeMode });
  },

  onWashRangeField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    this._setForm({
      washPricing: updateWashRangeField(this._form().washPricing, index, field, e.detail.value)
    });
  },

  onAddWashRange() {
    this._markDirty();
    this._setForm({ washPricing: addWashRange(this._form().washPricing) });
  },

  onRemoveWashRange(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    this._setForm({ washPricing: removeWashRange(this._form().washPricing, index) });
  },

  onBusinessStatusChange(e) {
    const nextStatus = e.detail.value;
    const currentStatus = this.data.businessStatus;
    if (nextStatus === currentStatus) return;

    if (nextStatus === STATUS_OPEN) {
      const formError = this._validateStoreForm();
      if (formError) {
        showValidationAlert(`${formError}。请完善店铺信息并保存后再营业。`, '无法营业');
        this.setData({ businessStatus: currentStatus });
        return;
      }
    }

    wx.showModal({
      title: '确认切换营业状态',
      content: getStatusConfirmContent(nextStatus),
      confirmColor: '#E98657',
      success: (res) => {
        if (res.confirm) {
          this._markDirty();
          const shop = { ...this.data.shop, status: nextStatus };
          this.setData({ shop, businessStatus: nextStatus });
        } else {
          this.setData({ businessStatus: currentStatus });
        }
      }
    });
  },

  onReceptionRangeChange(e) {
    this._markDirty();
    this._applyReceptionRange(e.detail.value);
  },

  onChooseStorePhotos() {
    if (this._choosingStorePhotos) return;
    const current = normalizeStorePhotos(this.data.storePhotos);
    const remain = MAX_STORE_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_STORE_PHOTOS}张`, icon: 'none' });
      return;
    }

    this._choosingStorePhotos = true;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this._markDirty();
        const picked = (res.tempFiles || []).map((file) => file.tempFilePath);
        this._applyStorePhotos(current.concat(picked).slice(0, MAX_STORE_PHOTOS));
      },
      complete: () => {
        this._choosingStorePhotos = false;
      }
    });
  },

  onDeleteStorePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const storePhotos = [...normalizeStorePhotos(this.data.storePhotos)];
    storePhotos.splice(index, 1);
    this._markDirty();
    this._applyStorePhotos(storePhotos);
  },

  onPreviewStorePhoto(e) {
    if (this.data.photoDrag && this.data.photoDrag.active) return;
    const url = e.currentTarget.dataset.url;
    const urls = normalizeStorePhotos(this.data.storePhotos);
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onChooseIntroPhotos() {
    if (this._choosingIntroPhotos) return;
    const current = normalizeIntroPhotos(this.data.introPhotos);
    const remain = MAX_INTRO_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_INTRO_PHOTOS}张`, icon: 'none' });
      return;
    }
    this._choosingIntroPhotos = true;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this._markDirty();
        const picked = (res.tempFiles || []).map((file) => file.tempFilePath);
        this._applyIntroPhotos(current.concat(picked).slice(0, MAX_INTRO_PHOTOS));
      },
      complete: () => {
        this._choosingIntroPhotos = false;
      }
    });
  },

  onDeleteIntroPhoto(e) {
    const index = e.currentTarget.dataset.index;
    const introPhotos = [...normalizeIntroPhotos(this.data.introPhotos)];
    introPhotos.splice(index, 1);
    this._markDirty();
    this._applyIntroPhotos(introPhotos);
  },

  onPreviewIntroPhoto(e) {
    if (this.data.photoDrag && this.data.photoDrag.active) return;
    const url = e.currentTarget.dataset.url;
    const urls = normalizeIntroPhotos(this.data.introPhotos);
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onChooseNoticePhotos() {
    if (this._choosingNoticePhotos) return;
    const current = this._isHomeFeedingForm()
      ? normalizeNoticePhotos((this.data.hf || {}).noticePhotos)
      : normalizeNoticePhotos(this.data.noticePhotos);
    const remain = MAX_NOTICE_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_NOTICE_PHOTOS}张`, icon: 'none' });
      return;
    }
    this._choosingNoticePhotos = true;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this._markDirty();
        const picked = (res.tempFiles || []).map((file) => file.tempFilePath);
        this._setPhotoList(
          this._isHomeFeedingForm() ? 'hfNotice' : 'notice',
          current.concat(picked).slice(0, MAX_NOTICE_PHOTOS)
        );
      },
      complete: () => {
        this._choosingNoticePhotos = false;
      }
    });
  },

  onDeleteNoticePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const listKey = this._isHomeFeedingForm() ? 'hfNotice' : 'notice';
    const noticePhotos = [...this._getPhotoList(listKey)];
    noticePhotos.splice(index, 1);
    this._markDirty();
    this._setPhotoList(listKey, noticePhotos);
  },

  onPreviewNoticePhoto(e) {
    if (this.data.photoDrag && this.data.photoDrag.active) return;
    const url = e.currentTarget.dataset.url;
    const urls = this._getPhotoList(this._isHomeFeedingForm() ? 'hfNotice' : 'notice');
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onChooseWashNoticePhotos() {
    if (this._choosingWashNoticePhotos) return;
    const listKey = this._isHomeFeedingForm() ? 'hfWashNotice' : 'washNotice';
    const current = this._getPhotoList(listKey);
    const remain = MAX_NOTICE_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_NOTICE_PHOTOS}张`, icon: 'none' });
      return;
    }
    this._choosingWashNoticePhotos = true;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this._markDirty();
        const picked = (res.tempFiles || []).map((file) => file.tempFilePath);
        this._setPhotoList(listKey, current.concat(picked).slice(0, MAX_NOTICE_PHOTOS));
      },
      complete: () => {
        this._choosingWashNoticePhotos = false;
      }
    });
  },

  onDeleteWashNoticePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const listKey = this._isHomeFeedingForm() ? 'hfWashNotice' : 'washNotice';
    const washNoticePhotos = [...this._getPhotoList(listKey)];
    washNoticePhotos.splice(index, 1);
    this._markDirty();
    this._setPhotoList(listKey, washNoticePhotos);
  },

  onPreviewWashNoticePhoto(e) {
    if (this.data.photoDrag && this.data.photoDrag.active) return;
    const url = e.currentTarget.dataset.url;
    const urls = this._getPhotoList(this._isHomeFeedingForm() ? 'hfWashNotice' : 'washNotice');
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  onToggleWeekday(e) {
    this._markDirty();
    const value = e.currentTarget.dataset.value;
    const weekdays = toggleWeekday(this.data.businessHours.weekdays, value);
    this._applyBusinessHours({ ...this.data.businessHours, weekdays });
  },

  onBusinessTimeChange(e) {
    this._markDirty();
    const field = e.currentTarget.dataset.field;
    this._applyBusinessHours({
      ...this.data.businessHours,
      [field]: e.detail.value
    });
  },

  onWeightPrice(e) {
    this._markDirty();
    const idx = e.currentTarget.dataset.index;
    this._setForm({
      weightPricing: updateWeightRangeField(this._form().weightPricing, idx, 'price', e.detail.value)
    });
  },

  onWeightRangeField(e) {
    this._markDirty();
    const idx = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    this._setForm({
      weightPricing: updateWeightRangeField(this._form().weightPricing, idx, field, e.detail.value)
    });
  },

  onAddWeightRange() {
    this._markDirty();
    this._setForm({ weightPricing: addWeightRange(this._form().weightPricing) });
  },

  onRemoveWeightRange(e) {
    this._markDirty();
    const index = e.currentTarget.dataset.index;
    this._setForm({ weightPricing: removeWeightRange(this._form().weightPricing, index) });
  },

  _decorateVisitSurchargeList(list) {
    return (Array.isArray(list) ? list : []).map((item) => {
      const dog = normalizeDogPricingForUi({
        includedKm: item.includedKm,
        surchargeEnabled: item.surchargeEnabled,
        surchargeTiers: item.surchargeTiers,
        packages: [{ name: 'x', durationMin: '1', basePrice: '1' }]
      });
      return {
        ...item,
        includedKm: dog.includedKm,
        surchargeEnabled: dog.surchargeEnabled,
        surchargeTiers: dog.surchargeTiers
      };
    });
  },

  _surchargeDogForm(index) {
    const item = ((this.data.hf || {}).serviceItems || [])[index] || {};
    return {
      includedKm: item.includedKm,
      surchargeEnabled: item.surchargeEnabled,
      surchargeTiers: item.surchargeTiers,
      packages: [{ name: 'x', durationMin: '1', basePrice: '1' }]
    };
  },

  _setSurchargeFromDog(index, dog) {
    this._setVisitServices(patchVisitServiceSurcharge(
      (this.data.hf || {}).serviceItems,
      index,
      dog
    ));
  },

  _setVisitServices(serviceItems) {
    this._markDirty();
    this.setData({
      hf: {
        ...(this.data.hf || {}),
        serviceItems
      }
    });
  },

  onVisitServiceField(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    this._setVisitServices(updateVisitServiceField(
      (this.data.hf || {}).serviceItems,
      index,
      field,
      e.detail && e.detail.value
    ));
  },

  onAddVisitService() {
    this._setVisitServices(addVisitService(
      (this.data.hf || {}).serviceItems,
      this.data.receptionRange
    ));
  },

  onRemoveVisitService(e) {
    const index = Number(e.currentTarget.dataset.index);
    this._setVisitServices(removeVisitService((this.data.hf || {}).serviceItems, index));
  },

  onToggleVisitServicePetType(e) {
    const index = Number(e.currentTarget.dataset.index);
    const value = e.currentTarget.dataset.value;
    this._setVisitServices(toggleVisitServicePetType(
      (this.data.hf || {}).serviceItems,
      index,
      value,
      this.data.receptionRange
    ));
  },

  onVisitServiceVasField(e) {
    const index = Number(e.currentTarget.dataset.index);
    const vasIndex = Number(e.currentTarget.dataset.vasIndex);
    const field = e.currentTarget.dataset.field;
    this._setVisitServices(updateVisitServiceVasField(
      (this.data.hf || {}).serviceItems,
      index,
      vasIndex,
      field,
      e.detail && e.detail.value
    ));
  },

  onAddVisitServiceVas(e) {
    const index = Number(e.currentTarget.dataset.index);
    this._setVisitServices(addVisitServiceVas((this.data.hf || {}).serviceItems, index));
  },

  onRemoveVisitServiceVas(e) {
    const index = Number(e.currentTarget.dataset.index);
    const vasIndex = Number(e.currentTarget.dataset.vasIndex);
    this._setVisitServices(removeVisitServiceVas(
      (this.data.hf || {}).serviceItems,
      index,
      vasIndex
    ));
  },

  onDogField(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    this._setSurchargeFromDog(index, updateDogField(
      this._surchargeDogForm(index),
      field,
      e.detail && e.detail.value
    ));
  },

  onDogSurchargeField(e) {
    const index = Number(e.currentTarget.dataset.index);
    const tierIndex = Number(e.currentTarget.dataset.tierIndex);
    const field = e.currentTarget.dataset.field;
    this._setSurchargeFromDog(index, updateDogSurchargeField(
      this._surchargeDogForm(index),
      tierIndex,
      field,
      e.detail && e.detail.value
    ));
  },

  onAddDogSurchargeTier(e) {
    const index = Number(e.currentTarget.dataset.index);
    this._setSurchargeFromDog(index, addDogSurchargeTier(this._surchargeDogForm(index)));
  },

  onRemoveDogSurchargeTier(e) {
    const index = Number(e.currentTarget.dataset.index);
    const tierIndex = Number(e.currentTarget.dataset.tierIndex);
    this._setSurchargeFromDog(index, removeDogSurchargeTier(this._surchargeDogForm(index), tierIndex));
  },

  onToggleDogSurcharge(e) {
    const index = Number(e.currentTarget.dataset.index);
    const enabled = !!(e.detail && e.detail.value);
    this._setSurchargeFromDog(index, toggleDogSurchargeEnabled(this._surchargeDogForm(index), enabled));
  },

  onToggleDogSurchargePerKm(e) {
    const index = Number(e.currentTarget.dataset.index);
    const tierIndex = Number(e.currentTarget.dataset.tierIndex);
    this._setSurchargeFromDog(index, toggleDogSurchargePerKm(this._surchargeDogForm(index), tierIndex));
  },

  onRoomField(e) {
    this._markDirty();
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const roomPricing = updateRoomField(this._form().roomPricing, index, field, e.detail.value);
    this._setForm({ roomPricing });
  },

  onChooseRoomPhoto(e) {
    if (this._choosingRoomPhoto) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this._choosingRoomPhoto = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) {
          wx.showToast({ title: '未选择到图片', icon: 'none' });
          return;
        }
        this._markDirty();
        const roomPricing = updateRoomField(this._form().roomPricing, index, 'photo', path);
        this._setForm({ roomPricing });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
      complete: () => {
        this._choosingRoomPhoto = false;
      }
    });
  },

  onDeleteRoomPhoto(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const roomPricing = updateRoomField(this._form().roomPricing, index, 'photo', '');
    this._setForm({ roomPricing });
  },

  onPreviewRoomPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const room = (this._form().roomPricing || [])[index];
    const url = room && room.photo;
    if (!url) return;
    resolveImageUrls([url]).then((urls) => {
      const current = (urls && urls[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
  },

  onAddRoom() {
    this._markDirty();
    this._setForm({ roomPricing: addRoom(this._form().roomPricing) });
  },

  onRemoveRoom(e) {
    this._markDirty();
    const index = e.currentTarget.dataset.index;
    this._setForm({ roomPricing: removeRoom(this._form().roomPricing, index) });
  },

  onCustomField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const customPricing = updateCustomOptionField(
      this._form().customPricing, index, field, e.detail.value
    );
    this._setForm({ customPricing });
  },

  onCustomChildField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const childIndex = Number(e.currentTarget.dataset.childIndex);
    const field = e.currentTarget.dataset.field;
    const customPricing = updateCustomChildField(
      this._form().customPricing, index, childIndex, field, e.detail.value
    );
    this._setForm({ customPricing });
  },

  onAddCustomChild(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    this._setForm({
      customPricing: addCustomChild(this._form().customPricing, index)
    });
  },

  onRemoveCustomChild(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const childIndex = Number(e.currentTarget.dataset.childIndex);
    this._setForm({
      customPricing: removeCustomChild(this._form().customPricing, index, childIndex)
    });
  },

  onChooseCustomChildPhoto(e) {
    if (this._choosingCustomPhoto) return;
    const index = Number(e.currentTarget.dataset.index);
    const childIndex = Number(e.currentTarget.dataset.childIndex);
    if (!Number.isInteger(index) || index < 0) return;
    if (!Number.isInteger(childIndex) || childIndex < 0) return;
    this._choosingCustomPhoto = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) {
          wx.showToast({ title: '未选择到图片', icon: 'none' });
          return;
        }
        this._markDirty();
        const customPricing = updateCustomChildField(
          this._form().customPricing, index, childIndex, 'photo', path
        );
        this._setForm({ customPricing });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
      complete: () => {
        this._choosingCustomPhoto = false;
      }
    });
  },

  onDeleteCustomChildPhoto(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const childIndex = Number(e.currentTarget.dataset.childIndex);
    const customPricing = updateCustomChildField(
      this._form().customPricing, index, childIndex, 'photo', ''
    );
    this._setForm({ customPricing });
  },

  onPreviewCustomChildPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const childIndex = Number(e.currentTarget.dataset.childIndex);
    const item = (this._form().customPricing || [])[index];
    const child = item && item.children && item.children[childIndex];
    const url = child && child.photo;
    if (!url) return;
    resolveImageUrls([url]).then((urls) => {
      const current = (urls && urls[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
  },

  onChooseCustomPhoto(e) {
    if (this._choosingCustomPhoto) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this._choosingCustomPhoto = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) {
          wx.showToast({ title: '未选择到图片', icon: 'none' });
          return;
        }
        this._markDirty();
        const customPricing = updateCustomOptionField(
          this._form().customPricing, index, 'photo', path
        );
        this._setForm({ customPricing });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
      complete: () => {
        this._choosingCustomPhoto = false;
      }
    });
  },

  onDeleteCustomPhoto(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const customPricing = updateCustomOptionField(
      this._form().customPricing, index, 'photo', ''
    );
    this._setForm({ customPricing });
  },

  onPreviewCustomPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = (this._form().customPricing || [])[index];
    const url = item && item.photo;
    if (!url) return;
    resolveImageUrls([url]).then((urls) => {
      const current = (urls && urls[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
  },

  onAddCustomOption() {
    this._markDirty();
    this._setForm({ customPricing: addCustomOption(this._form().customPricing) });
  },

  onRemoveCustomOption(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    this._setForm({
      customPricing: removeCustomOption(this._form().customPricing, index)
    });
  },

  onValueAddedField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const valueAddedServices = updateValueAddedServiceField(
      this._form().valueAddedServices, index, field, e.detail.value
    );
    this._setForm({ valueAddedServices });
  },

  onChooseValueAddedPhoto(e) {
    if (this._choosingValueAddedPhoto) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this._choosingValueAddedPhoto = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) {
          wx.showToast({ title: '未选择到图片', icon: 'none' });
          return;
        }
        this._markDirty();
        const valueAddedServices = updateValueAddedServiceField(
          this._form().valueAddedServices, index, 'photo', path
        );
        this._setForm({ valueAddedServices });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
      complete: () => {
        this._choosingValueAddedPhoto = false;
      }
    });
  },

  onDeleteValueAddedPhoto(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const valueAddedServices = updateValueAddedServiceField(
      this._form().valueAddedServices, index, 'photo', ''
    );
    this._setForm({ valueAddedServices });
  },

  onPreviewValueAddedPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = (this._form().valueAddedServices || [])[index];
    const url = item && item.photo;
    if (!url) return;
    resolveImageUrls([url]).then((urls) => {
      const current = (urls && urls[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
  },

  onAddValueAddedService() {
    this._markDirty();
    this._setForm({ valueAddedServices: addValueAddedService(this._form().valueAddedServices) });
  },

  onRemoveValueAddedService(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    this._setForm({
      valueAddedServices: removeValueAddedService(this._form().valueAddedServices, index)
    });
  },

  onWashProductField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const washProducts = updateWashProductField(
      this.data.washProducts, index, field, e.detail.value
    );
    this.setData({ washProducts });
  },

  onToggleWashProductCondition(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const washProducts = updateWashProductField(
      this.data.washProducts, index, 'hasCondition', !!(e.detail && e.detail.value)
    );
    this.setData({ washProducts });
  },

  onToggleWashProductPetType(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const type = e.currentTarget.dataset.value;
    const washProducts = toggleWashProductPetType(this.data.washProducts, index, type);
    this.setData({ washProducts });
  },

  onChooseWashProductPhoto(e) {
    if (this._choosingWashProductPhoto) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this._choosingWashProductPhoto = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) {
          wx.showToast({ title: '未选择到图片', icon: 'none' });
          return;
        }
        this._markDirty();
        const washProducts = updateWashProductField(
          this.data.washProducts, index, 'photo', path
        );
        this.setData({ washProducts });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
      complete: () => {
        this._choosingWashProductPhoto = false;
      }
    });
  },

  onDeleteWashProductPhoto(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const washProducts = updateWashProductField(
      this.data.washProducts, index, 'photo', ''
    );
    this.setData({ washProducts });
  },

  onPreviewWashProductPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = (this.data.washProducts || [])[index];
    const url = item && item.photo;
    if (!url) return;
    resolveImageUrls([url]).then((urls) => {
      const current = (urls && urls[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
  },

  onAddWashProduct() {
    this._markDirty();
    const washProducts = addWashProduct(this.data.washProducts);
    this.setData({ washProducts });
  },

  onRemoveWashProduct(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const washProducts = removeWashProduct(this.data.washProducts, index);
    this.setData({ washProducts });
  },

  onWashVasField(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const washValueAddedServices = updateWashProductField(
      this.data.washValueAddedServices, index, field, e.detail.value
    );
    this.setData({ washValueAddedServices });
  },

  onToggleWashVasCondition(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const washValueAddedServices = updateWashProductField(
      this.data.washValueAddedServices, index, 'hasCondition', !!(e.detail && e.detail.value)
    );
    this.setData({ washValueAddedServices });
  },

  onToggleWashVasPetType(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const type = e.currentTarget.dataset.value;
    const washValueAddedServices = toggleWashProductPetType(
      this.data.washValueAddedServices, index, type
    );
    this.setData({ washValueAddedServices });
  },

  onChooseWashVasPhoto(e) {
    if (this._choosingWashVasPhoto) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this._choosingWashVasPhoto = true;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        const path = file && file.tempFilePath;
        if (!path) return;
        this._markDirty();
        const washValueAddedServices = updateWashProductField(
          this.data.washValueAddedServices, index, 'photo', path
        );
        this.setData({ washValueAddedServices });
      },
      complete: () => {
        this._choosingWashVasPhoto = false;
      }
    });
  },

  onDeleteWashVasPhoto(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const washValueAddedServices = updateWashProductField(
      this.data.washValueAddedServices, index, 'photo', ''
    );
    this.setData({ washValueAddedServices });
  },

  onPreviewWashVasPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = (this.data.washValueAddedServices || [])[index];
    const url = item && item.photo;
    if (!url) return;
    resolveImageUrls([url]).then((urls) => {
      const current = (urls && urls[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
  },

  onAddWashVas() {
    this._markDirty();
    const washValueAddedServices = addWashProduct(this.data.washValueAddedServices);
    this.setData({ washValueAddedServices });
  },

  onRemoveWashVas(e) {
    this._markDirty();
    const index = Number(e.currentTarget.dataset.index);
    const washValueAddedServices = removeWashProduct(this.data.washValueAddedServices, index);
    this.setData({ washValueAddedServices });
  },

  _setTabBarVisible(_visible) {
    this._syncApplyShellChrome();
  },

  onOpenContractModal() {
    const isHf = this._isHomeFeedingForm();
    const shop = this._normalizeShop(this.data.shop);
    const storedText = isHf
      ? ((shop.homeFeeding && shop.homeFeeding.contractClauseText) || '')
      : getStoredClauseEditText(shop);
    this._setTabBarVisible(false);
    this.setData({
      showContractModal: true,
      contractEditLine: isHf ? 'homeFeeding' : 'boarding',
      contractModalTitle: isHf ? '编辑上门喂养协议条款' : '编辑到店寄养协议条款',
      contractClauseDraft: storedText || getDefaultClauseEditText(shop)
    });
  },

  onCloseContractModal() {
    if (this.data.savingContractClause) return;
    this._setTabBarVisible(true);
    this.setData({ showContractModal: false });
  },

  onContractClauseInput(e) {
    this.setData({ contractClauseDraft: e.detail.value });
  },

  onResetContractClause() {
    const shop = this._normalizeShop(this.data.shop);
    const isHf = this.data.contractEditLine === 'homeFeeding';
    wx.showModal({
      title: '恢复默认',
      content: isHf ? '将恢复为平台默认上门喂养协议条款。确定继续？' : '将恢复为平台默认到店寄养协议条款。确定继续？',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({
          contractClauseDraft: getDefaultClauseEditText({ ...shop, compensationLimit: '' })
        });
      }
    });
  },

  onSaveContractClause() {
    if (this.data.savingContractClause) return;

    const clauseText = (this.data.contractClauseDraft || '').trim();
    const defaultText = getDefaultClauseEditText(this.data.shop).trim();
    const platformDefault = getDefaultClauseEditText({
      ...this.data.shop,
      compensationLimit: ''
    }).trim();
    const isDefaultClause = !clauseText || clauseText === defaultText || clauseText === platformDefault;
    if (this.data.contractEditLine === 'homeFeeding') {
      const contractClauseText = isDefaultClause ? '' : clauseText;
      const homeFeeding = {
        ...(this.data.shop.homeFeeding || emptyHomeFeeding()),
        contractClauseText
      };
      const hfForm = {
        ...(this.data.hf || {}),
        contractClauseCustomized: !!contractClauseText,
        contractClauseSummary: contractClauseText ? '已自定义协议条款' : '使用平台默认条款'
      };
      const applyLocal = (nextShop) => {
        this.setData({
          shop: nextShop,
          hf: hfForm,
          showContractModal: false,
          savingContractClause: false
        });
        this._setTabBarVisible(true);
        wx.showToast({
          title: isDefaultClause ? '已恢复默认条款' : '协议条款已保存',
          icon: 'success'
        });
      };
      if (this._isEmptyShopPreview()) {
        const nextShop = this._normalizeShop({
          ...(previewShopCache || this.data.shop),
          homeFeeding
        });
        this._cachePreviewShop(nextShop);
        applyLocal(nextShop);
        return;
      }
      const cachedShop = app.getShop() || {};
      const shopToSync = preserveOutgoingShopFields(this._normalizeShop({
        ...cachedShop,
        store_id: (this.data.shop && this.data.shop.store_id) || cachedShop.store_id,
        homeFeeding
      }), cachedShop);
      if (!shopToSync.store_id) {
        wx.showToast({ title: '店铺信息未就绪，请稍后重试', icon: 'none' });
        return;
      }
      this.setData({ savingContractClause: true });
      wx.showLoading({ title: '保存中', mask: true });
      app.syncShopToCloud(shopToSync)
        .then((saved) => {
          const patchedShop = {
            ...(app.getShop() || saved || {}),
            homeFeeding
          };
          app.saveShop(patchedShop);
          const nextShop = this._normalizeShop({
            ...this.data.shop,
            homeFeeding
          });
          wx.hideLoading();
          applyLocal(nextShop);
        })
        .catch((err) => {
          this.setData({ savingContractClause: false });
          wx.hideLoading();
          wx.showToast({
            title: (err && err.message) || '保存失败',
            icon: 'none',
            duration: 3000
          });
        });
      return;
    }

    const clauseUpdates = {
      boardingContractClauseText: isDefaultClause ? '' : clauseText,
      ...(isDefaultClause && (!clauseText || clauseText === platformDefault)
        ? { compensationLimit: '' }
        : {})
    };

    if (this._isEmptyShopPreview()) {
      const nextShop = this._normalizeShop({
        ...(previewShopCache || this.data.shop),
        ...clauseUpdates
      });
      this._cachePreviewShop(nextShop);
      this.setData({
        shop: nextShop,
        showContractModal: false,
        ...this._pickContractClauseState(nextShop)
      });
      this._setTabBarVisible(true);
      wx.showToast({
        title: isDefaultClause ? '已恢复默认条款' : '协议条款已保存',
        icon: 'success'
      });
      return;
    }

    const cachedShop = app.getShop() || {};
    const shopToSync = preserveOutgoingShopFields(this._normalizeShop({
      ...cachedShop,
      store_id: (this.data.shop && this.data.shop.store_id) || cachedShop.store_id,
      ...clauseUpdates
    }), cachedShop);

    if (!shopToSync.store_id) {
      wx.showToast({ title: '店铺信息未就绪，请稍后重试', icon: 'none' });
      return;
    }

    this.setData({ savingContractClause: true });
    wx.showLoading({ title: '保存中', mask: true });
    app.syncShopToCloud(shopToSync)
      .then((saved) => {
        const patchedShop = {
          ...(app.getShop() || saved || {}),
          boardingContractClauseText: clauseUpdates.boardingContractClauseText
        };
        if (Object.prototype.hasOwnProperty.call(clauseUpdates, 'compensationLimit')) {
          patchedShop.compensationLimit = clauseUpdates.compensationLimit;
        }
        app.saveShop(patchedShop);

        const nextShop = this._normalizeShop({
          ...this.data.shop,
          ...clauseUpdates,
          boardingContractClauseText: clauseUpdates.boardingContractClauseText
        });
        this.setData({
          shop: nextShop,
          showContractModal: false,
          savingContractClause: false,
          ...this._pickContractClauseState(nextShop)
        });
        this._setTabBarVisible(true);
        wx.hideLoading();
        wx.showToast({
          title: isDefaultClause ? '已恢复默认条款' : '协议条款已保存',
          icon: 'success'
        });
      })
      .catch((err) => {
        this.setData({ savingContractClause: false });
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none',
          duration: 3000
        });
      });
  },

  preventMove() {},

  onSaveWash() {
    this._persistStore({ mode: 'wash' });
  },

  onSaveHomeFeeding() {
    this._persistStore({ mode: 'homeFeeding' });
  },

  onSaveBasic() {
    this._persistStore({ mode: 'basic' });
  },

  onSaveAdvanced() {
    this._persistStore({ mode: 'advanced' });
  },

  onSave() {
    if (this.data.settingsTab === 'wash') {
      this._persistStore({ mode: 'wash' });
      return;
    }
    if (this.data.settingsTab === 'homeFeeding') {
      this._persistStore({ mode: 'homeFeeding' });
      return;
    }
    const advanced = this.data.settingsTab !== 'shop' && this.data.moduleSubTab === 'advanced';
    this._persistStore({ mode: advanced ? 'advanced' : 'basic' });
  },

  _persistStore({ mode }) {
    if (this.data.submitting) return;
    const enableKey = this._serviceLineKeyForSave(mode);
    const isShopOpenAction = mode === 'basic' && !enableKey;
    let openServiceGuide = '';
    if (mode === 'wash') {
      const formError = this._validateWashForm();
      if (formError) {
        showValidationAlert(formError);
        return;
      }
    } else if (mode === 'homeFeeding') {
      const formError = this._validateHomeFeedingBasicForm();
      if (formError) {
        showValidationAlert(formError);
        return;
      }
    } else if (mode === 'advanced') {
      const formError = this._validateAdvancedForm();
      if (formError) {
        showValidationAlert(formError);
        return;
      }
    } else if (enableKey === 'boarding') {
      const formError = this._validateBoardingBasicForm();
      if (formError) {
        showValidationAlert(formError);
        return;
      }
    } else {
      const profileError = this._validateBasicForm({ requireServiceLines: false });
      if (profileError) {
        showValidationAlert(profileError);
        return;
      }
      const openError = this._validateBasicForm();
      if (openError === OPEN_NEED_SERVICE_LINE) {
        openServiceGuide = openError;
      } else if (openError) {
        showValidationAlert(openError);
        return;
      }
    }

    const billingRules = this._getBillingRulesPayload();
    const currentLines = normalizeServiceLines(this.data.shop.serviceLines);
    const serviceLines = enableKey
      ? { ...currentLines, [enableKey]: true }
      : currentLines;
    const currentStatus = normalizeStoreStatus(this.data.shop.status);
    const nextStatus = isShopOpenAction && currentStatus === STATUS_INCOMPLETE && !openServiceGuide
      ? STATUS_OPEN
      : currentStatus;

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中' });
    const shop = this._normalizeShop({
      ...this.data.shop,
      ...this._getPickupFreePayload(),
      washService: this.data.shop.washService === 'yes' ? 'yes' : 'no',
      washPricing: this.data.shop.washService === 'yes'
        ? normalizeWashPricing(this.data.washPricing)
        : (this.data.washPricing || getDefaultWashPricing()),
      washFreeMinDays: this.data.shop.washService === 'yes' && this.data.washFreeMode === 'minDays'
        ? (this.data.shop.washFreeMinDays || '')
        : '',
      washNotice: this.data.shop.washService === 'yes' ? (this.data.shop.washNotice || '') : '',
      washNoticePhotos: this.data.shop.washService === 'yes'
        ? normalizeNoticePhotos(this.data.washNoticePhotos)
        : [],
      washProducts: compactWashProducts(this.data.washProducts),
      washValueAddedServices: compactWashProducts(this.data.washValueAddedServices),
      homeFeeding: this._getHomeFeedingPayload(),
      valueAddedServices: normalizeValueAddedServices(this.data.valueAddedServices),
      status: nextStatus,
      businessHours: this.data.businessHours || DEFAULT_BUSINESS_HOURS,
      receptionRange: this.data.receptionRange,
      storePhotos: this.data.storePhotos,
      introPhotos: this.data.introPhotos,
      noticePhotos: this.data.noticePhotos,
      serviceLines,
      billingRules
    });
    const cachedShop = app.getShop() || {};
    Object.assign(shop, preserveOutgoingShopFields(shop, cachedShop));

    if (this._isEmptyShopPreview()) {
      this._finishLocalPreviewSave(shop, openServiceGuide ? '' : '已保存到本地');
      this.setData({ submitting: false });
      if (openServiceGuide) {
        showValidationAlert(openServiceGuide, '请完善信息', {
          onConfirm: () => this._guideToBoardingService()
        });
      }
      return;
    }

    const uploadChain = uploadStoreLogo(shop.logo, cachedShop.logo)
      .then((logo) => {
        if (logo) shop.logo = logo;
        return uploadStorePhotos(shop.storePhotos, cachedShop.storePhotos);
      })
      .then((storePhotos) => {
        shop.storePhotos = storePhotos;
        return uploadIntroPhotos(shop.introPhotos, cachedShop.introPhotos);
      })
      .then((introPhotos) => {
        shop.introPhotos = introPhotos;
        return uploadBusinessLicense(shop.businessLicense, cachedShop.businessLicense);
      })
      .then((businessLicense) => {
        shop.businessLicense = businessLicense || '';
        return uploadNoticePhotos(shop.noticePhotos, cachedShop.noticePhotos);
      })
      .then((noticePhotos) => {
        shop.noticePhotos = noticePhotos;
        return uploadWashNoticePhotos(shop.washNoticePhotos, cachedShop.washNoticePhotos);
      })
      .then((washNoticePhotos) => {
        shop.washNoticePhotos = washNoticePhotos;
        const fallbackRooms = ((cachedShop.billingRules || {}).roomPricing) || [];
        return uploadRoomPricingPhotos(billingRules.roomPricing, fallbackRooms);
      })
      .then((roomPricing) => {
        billingRules.roomPricing = roomPricing;
        shop.billingRules = { ...shop.billingRules, roomPricing };
        const fallbackCustom = ((cachedShop.billingRules || {}).customPricing) || [];
        return uploadCustomPricingPhotos(billingRules.customPricing, fallbackCustom);
      })
      .then((customPricing) => {
        billingRules.customPricing = customPricing;
        shop.billingRules = { ...shop.billingRules, customPricing };
        const fallbackServices = cachedShop.valueAddedServices || [];
        return uploadValueAddedServicePhotos(shop.valueAddedServices, fallbackServices);
      })
      .then((valueAddedServices) => {
        shop.valueAddedServices = valueAddedServices;
        billingRules.valueAddedServices = valueAddedServices;
        shop.billingRules = { ...shop.billingRules, valueAddedServices };
        const fallbackWashProducts = cachedShop.washProducts || [];
        return uploadWashProductPhotos(shop.washProducts, fallbackWashProducts);
      })
      .then((washProducts) => {
        shop.washProducts = washProducts;
        const fallbackWashVas = cachedShop.washValueAddedServices || [];
        return uploadWashProductPhotos(shop.washValueAddedServices, fallbackWashVas);
      })
      .then((washValueAddedServices) => {
        shop.washValueAddedServices = washValueAddedServices;
        const hf = shop.homeFeeding || emptyHomeFeeding();
        const fallbackHf = cachedShop.homeFeeding || {};
        return uploadNoticePhotos(hf.noticePhotos, fallbackHf.noticePhotos)
          .then((noticePhotos) => {
            hf.noticePhotos = noticePhotos;
            return uploadWashNoticePhotos(hf.washNoticePhotos, fallbackHf.washNoticePhotos);
          })
          .then((washNoticePhotos) => {
            hf.washNoticePhotos = washNoticePhotos;
            const fallbackRooms = ((fallbackHf.billingRules || {}).roomPricing) || [];
            return uploadRoomPricingPhotos((hf.billingRules || {}).roomPricing, fallbackRooms);
          })
          .then((roomPricing) => {
            hf.billingRules = { ...(hf.billingRules || {}), roomPricing };
            const fallbackCustom = ((fallbackHf.billingRules || {}).customPricing) || [];
            return uploadCustomPricingPhotos((hf.billingRules || {}).customPricing, fallbackCustom);
          })
          .then((customPricing) => {
            hf.billingRules = { ...(hf.billingRules || {}), customPricing };
            hf.valueAddedServices = [];
            if (hf.billingRules) hf.billingRules.valueAddedServices = [];
            const fallbackItems = Array.isArray(fallbackHf.serviceItems) ? fallbackHf.serviceItems : [];
            return Promise.all((hf.serviceItems || []).map((item, index) => {
              const fallback = fallbackItems.find((row) => row && row.id === item.id)
                || fallbackItems[index]
                || {};
              return uploadValueAddedServicePhotos(
                item.valueAddedServices,
                fallback.valueAddedServices || []
              ).then((valueAddedServices) => ({ ...item, valueAddedServices }));
            }));
          })
          .then((serviceItems) => {
            hf.serviceItems = serviceItems;
            shop.homeFeeding = hf;
            return app.syncShopToCloud(shop);
          });
      });

    uploadChain
      .then((saved) => {
        app.saveBillingRules(billingRules);
        this._applyShopToForm(saved);
        this._formDirty = false;
        wx.hideLoading();
        const openedNow = currentStatus === STATUS_INCOMPLETE && normalizeStoreStatus(saved.status) === STATUS_OPEN;
        if (openServiceGuide) {
          this._syncApplyShellChrome();
          this._syncBasicSaveText();
          showValidationAlert(openServiceGuide, '请完善信息', {
            onConfirm: () => this._guideToBoardingService()
          });
        } else if (openedNow) {
          enableStoreShareMenu();
          this._syncApplyShellChrome();
          this._syncBasicSaveText();
          const tryShow = () => {
            const bar = this.selectComponent('#merchantTabBar');
            if (bar && typeof bar.showOpenSuccessPromo === 'function') {
              bar.showOpenSuccessPromo({ force: true });
              return true;
            }
            return false;
          };
          if (!tryShow()) {
            markForceOpenSuccessPromo(app);
            setTimeout(() => {
              tryShow();
            }, 80);
          }
        } else {
          this._syncApplyShellChrome();
          this._syncBasicSaveText();
          wx.showToast({
            title: '保存成功',
            icon: 'success'
          });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none',
          duration: 3000
        });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  },

  onCopyStoreDisplayNo() {
    copyText(this.data.shop && this.data.shop.displayNo, '已复制店铺编号');
  },
  onAdminSecretTap() {
    handlePageSecretTap(this);
  }
});
