const app = getApp();
const { STORAGE_KEYS } = require('../../../utils/constants');
const { hideHomeButton } = require('../../../utils/navBar');
const { handlePageSecretTap } = require('../../../utils/hiddenAdmin');
const storeApi = require('../../../utils/store');
const merchantDemo = require('../../../utils/merchantDemo');
const {
  validateApplyForm,
  createEmptyApplyShop,
  pickApplyShopFields
} = require('../../../utils/storeApply');
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
const {
  normalizeReceptionRange,
  formatReceptionRangeText,
  buildReceptionRangeOptions
} = require('../../../utils/receptionRange');
const {
  MAX_STORE_PHOTOS,
  normalizeStorePhotos,
  uploadStorePhotos,
  uploadStoreLogo
} = require('../../../utils/storePhotos');
const { chooseStoreLocation, formatLocationAddress, isValidLocationResult, getLocationValidationMessage } = require('../../../utils/location');
const {
  normalizeWeightPricing,
  addWeightRange,
  removeWeightRange,
  updateWeightRangeField
} = require('../../../utils/weightPricing');
const { normalizeDeposit, validateStoreForm } = require('../../../utils/storeForm');
const { normalizePickupPricing, PICKUP_PRICING_MODE } = require('../../../utils/pickupPricing');
const {
  normalizeRoomPricing,
  addRoom,
  removeRoom,
  updateRoomField
} = require('../../../utils/roomPricing');
const {
  getDefaultClauseEditText,
  getStoredClauseEditText,
  isCustomContractSettings
} = require('../../../utils/boardingContract');

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
  const billingState = {
    checkInDayCharge,
    departureDayCharge,
    departureCharge
  };
  return {
    billingMode: (rules && rules.billingMode) || 'weight',
    weightPricing: normalizeWeightPricing((rules && rules.weightPricing) || []),
    roomPricing: normalizeRoomPricing((rules && rules.roomPricing) || []),
    ...billingState,
    chargeSummary: buildChargeSummary({ ...rules, ...billingState })
  };
}

Page({
  data: {
    isDemoMode: false,
    isAdminDisabled: false,
    adminDisableReason: '',
    applyShop: createEmptyApplyShop(),
    applyStorePhotos: [],
    applyStatus: '',
    applyRejectReason: '',
    agreedToCoopContract: false,
    signedCoopContractDraft: null,
    submitting: false,
    shop: {},
    billingMode: 'weight',
    weightPricing: [],
    roomPricing: [],
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
    maxStorePhotos: MAX_STORE_PHOTOS,
    showContractModal: false,
    contractClauseDraft: '',
    contractCompensationDraft: '',
    contractClauseCustomized: false
  },

  onLoad() {
    this._applyFormDirty = false;
    this._formDirty = false;
    this._hydrateFromCache();
  },

  _shouldShowApplyFlow() {
    if (app.isMerchantDisabled()) return false;
    const isPureDemo = app.isMerchantDemoMode();
    const pending = app.isMerchantPending();
    const rejected = isMerchantRejected(app.globalData.userInfo);
    return isPureDemo || pending || rejected;
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
    if (app.isMerchantDisabled()) {
      this.setData({ isDemoMode: false, isAdminDisabled: true });
      const cachedShop = app.getShop();
      if (cachedShop && cachedShop.store_id) {
        app.globalData.merchantStoreId = cachedShop.store_id;
        this._syncDisabledState(cachedShop);
      }
      return;
    }

    const showApplyFlow = this._shouldShowApplyFlow();
    if (showApplyFlow) {
      this.setData({ isDemoMode: true, isAdminDisabled: false });
      this._hydrateApplyFormFromCache();
      return;
    }

    this.setData({ isDemoMode: false, isAdminDisabled: false });
    const cachedShop = app.getShop();
    if (cachedShop && cachedShop.store_id && !merchantDemo.isDemoEntityId(cachedShop.store_id)) {
      app.globalData.merchantStoreId = cachedShop.store_id;
      if (!this._formDirty) {
        this._applyShopToForm(cachedShop);
      }
    }
  },

  _hydrateApplyFormFromCache() {
    if (this._applyFormDirty) return;

    const pending = app.isMerchantPending();
    const rejected = isMerchantRejected(app.globalData.userInfo);
    if (pending || rejected) {
      const cachedShop = app.getShop();
      if (cachedShop && cachedShop.store_id) {
        app.globalData.merchantStoreId = cachedShop.store_id;
        this._applyFormFromShop(cachedShop, pending ? 'pending' : 'rejected');
        if (rejected) {
          this.setData({
            applyRejectReason: (cachedShop && cachedShop.rejectReason) || '',
            agreedToCoopContract: false,
            signedCoopContractDraft: null
          });
        }
      }
      return;
    }

    const draft = merchantDemo.getDemoApplyDraft();
    if (draft) {
      this._applyFormFromShop(draft.shop, '');
      this.setData({ applyStorePhotos: normalizeStorePhotos(draft.storePhotos) });
      return;
    }

    this._applyFormFromShop(createEmptyApplyShop(), '');
  },

  _needsForceUserRefresh() {
    return !!(
      this.data.applyStatus === 'pending'
      || this.data.applyStatus === 'rejected'
      || app.isMerchantPending()
      || isMerchantRejected(app.globalData.userInfo)
    );
  },

  _reloadStorePage(options = {}) {
    const forceUser = !!(options && options.forceUser);
    return app.ensureCloudAndLogin(forceUser ? { force: true } : {}).then(() => {
      if (!app.canAccessMerchantBackend()) {
        wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
        return;
      }

      if (app.isMerchantDisabled()) {
        this.setData({ isDemoMode: false, isAdminDisabled: true });
        return app.ensureMerchantStore({ force: true }).then((shop) => {
          if (shop && shop.store_id) {
            this._syncDisabledState(shop);
          }
        });
      }

      const showApplyFlow = this._shouldShowApplyFlow();
      this.setData({ isDemoMode: showApplyFlow, isAdminDisabled: false });

      if (showApplyFlow) {
        this._loadApplyForm();
        return;
      }

      if (this._formDirty && !forceUser) return;
      // 已有表单数据时切回 Tab 不必强制拉店铺；下拉刷新走 refreshMerchantStore
      const storeOpts = (forceUser || !this.data.shop || !this.data.shop.store_id)
        ? { force: true }
        : {};
      return app.ensureMerchantStore(storeOpts).then((shop) => {
        if (!shop || !shop.store_id) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return;
        }
        if (this._formDirty) return;
        this._applyShopToForm(shop);
      });
    });
  },

  onShow() {
    hideHomeButton();
    this._syncTabBar();
    // 审核中/已拒绝时强制拉用户，避免本地 pending 缓存导致界面不更新
    this._reloadStorePage({ forceUser: this._needsForceUserRefresh() })
      .then(() => this._syncTabBar());
  },

  _syncTabBar() {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (!tabBar) return;
    tabBar.setData({
      selected: 2,
      isDemoMode: !!(this.data.isDemoMode || app.isMerchantDemoMode())
    });
  },

  onPullDownRefresh() {
    const wasPending = this.data.applyStatus === 'pending' || app.isMerchantPending();
    const inApplyFlow = this.data.isDemoMode || this._needsForceUserRefresh();

    if (inApplyFlow) {
      this._applyFormDirty = false;
      this._reloadStorePage({ forceUser: true })
        .then(() => {
          if (wasPending && app.isMerchantApproved()) {
            wx.showToast({ title: '审核已通过', icon: 'success' });
          } else {
            wx.showToast({ title: '已刷新', icon: 'success' });
          }
        })
        .finally(() => wx.stopPullDownRefresh());
      return;
    }
    if (this._formDirty) {
      wx.stopPullDownRefresh();
      return;
    }
    app.refreshMerchantStore()
      .then((shop) => {
        if (!shop || !shop.store_id) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return;
        }
        this._applyShopToForm(shop);
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
        this._applyFormFromShop(shop, stillPending ? 'pending' : 'rejected');
        if (stillRejected) {
          this.setData({
            applyRejectReason: (shop && shop.rejectReason) || '',
            agreedToCoopContract: false,
            signedCoopContractDraft: null
          });
        }
      });
    }

    const draft = merchantDemo.getDemoApplyDraft();
    if (draft) {
      this._applyFormFromShop(draft.shop, '');
      this.setData({ applyStorePhotos: normalizeStorePhotos(draft.storePhotos) });
      return;
    }

    this._applyFormFromShop(createEmptyApplyShop(), '');
  },

  _applyFormFromShop(shop, applyStatus) {
    this.setData({
      applyStatus: applyStatus || '',
      applyShop: pickApplyShopFields(shop),
      applyStorePhotos: normalizeStorePhotos(shop && shop.storePhotos)
    });
  },

  _saveApplyDraft() {
    merchantDemo.saveDemoApplyDraft({
      shop: this.data.applyShop,
      storePhotos: normalizeStorePhotos(this.data.applyStorePhotos)
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
    this._markApplyDirty();
    const current = normalizeStorePhotos(this.data.applyStorePhotos);
    const remain = MAX_STORE_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传6张', icon: 'none' });
      return;
    }
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

    uploadStorePhotos(storePhotos)
      .then((uploadedPhotos) => storeApi.submitMerchantApply({
        ...shop,
        storePhotos: uploadedPhotos,
        coopContractSigned: true,
        coopContractSignTime: signedCoopContractDraft.signTime,
        coopContractSnapshot: signedCoopContractDraft
      }))
      .then((res) => {
        if (!res || !res.success || !res.store) {
          throw new Error((res && res.errMsg) || '提交失败');
        }
        app.saveShop(res.store);
        const user = {
          ...(app.globalData.userInfo || {}),
          store_id: res.store.store_id,
          merchantStatus: 'pending',
          isMerchant: false,
          role: 'user'
        };
        app.globalData.userInfo = user;
        app.globalData.isMerchant = false;
        app.globalData.role = 'user';
        app.setData(STORAGE_KEYS.USER, user);
        return app.refreshUserRole().then(() => res.store);
      })
      .then((store) => {
        wx.hideLoading();
        wx.showToast({ title: '申请已提交', icon: 'success' });
        this._applyFormDirty = false;
        wx.removeStorageSync(STORAGE_KEYS.DEMO_APPLY_DRAFT);
        this.setData({
          agreedToCoopContract: false,
          signedCoopContractDraft: null,
          applyRejectReason: ''
        });
        app.globalData.signedCoopContractDraft = null;
        this._applyFormFromShop(store, 'pending');
      })
      .catch((err) => {
        wx.hideLoading();
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

  _buildCoopContractDraft() {
    const user = app.globalData.userInfo || {};
    return buildMerchantCoopContract({
      user,
      shop: this.data.applyShop
    });
  },

  _validateBeforeCoopContract() {
    const shop = { ...this.data.applyShop };
    const storePhotos = normalizeStorePhotos(this.data.applyStorePhotos);
    return validateApplyForm({ shop, storePhotos });
  },

  onViewCoopContract() {
    const formError = this._validateBeforeCoopContract();
    if (formError) {
      showValidationAlert(formError, '无法预览协议');
      return;
    }
    app.globalData.coopContractSignDraft = this._buildCoopContractDraft();
    wx.navigateTo({ url: '/pages/merchant/coop-contract/coop-contract?mode=preview' });
  },

  onGoSignCoopContract() {
    const formError = this._validateBeforeCoopContract();
    if (formError) {
      showValidationAlert(formError, '无法签署协议');
      return;
    }
    app.globalData.coopContractSignDraft = this._buildCoopContractDraft();
    wx.navigateTo({
      url: '/pages/merchant/coop-contract/coop-contract?mode=sign',
      events: {
        signed: (doc) => {
          this.setData({
            agreedToCoopContract: true,
            signedCoopContractDraft: doc
          });
        }
      }
    });
  },

  _markDirty() {
    this._formDirty = true;
  },

  _applyShopToForm(storeShop) {
    const normalizedShop = this._normalizeShop(storeShop);
    const localRules = app.getBillingRules();
    const cloudRules = normalizedShop.billingRules || {};
    const rules = { ...localRules, ...cloudRules };
    if (cloudRules && Object.keys(cloudRules).length) {
      app.saveBillingRules({ ...localRules, ...cloudRules });
    }
    this.setData({
      shop: normalizedShop,
      businessStatus: normalizeStoreStatus(normalizedShop.status),
      storePhotos: normalizeStorePhotos(normalizedShop.storePhotos),
      ...pickBillingState(rules),
      ...pickBusinessHoursState(normalizedShop),
      ...pickReceptionRangeState(normalizedShop),
      ...this._pickContractClauseState(normalizedShop)
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
    const businessHours = normalizeBusinessHours(shop.businessHours, shop.hours);
    const status = normalizeStoreStatus(shop.status);
    const receptionRange = normalizeReceptionRange(shop.receptionRange || shop.range);
    const storePhotos = normalizeStorePhotos(shop.storePhotos);
    const locationName = (shop.locationName || '').trim();
    const addressRegion = (shop.addressRegion || '').trim();
    const address = formatLocationAddress({
      name: locationName,
      address: addressRegion || shop.address
    }) || (shop.address || '').trim();
    return {
      ...shop,
      businessHours,
      hours: formatBusinessHoursText(businessHours),
      status,
      receptionRange,
      range: formatReceptionRangeText(receptionRange),
      storePhotos,
      locationName,
      addressRegion,
      address,
      pickupService: shop.pickupService === 'yes' ? 'yes' : 'no',
      pickupNotice: shop.pickupNotice || '',
      ...normalizePickupPricing(shop),
      deposit: normalizeDeposit(shop.deposit),
      compensationLimit: shop.compensationLimit != null && shop.compensationLimit !== ''
        ? String(shop.compensationLimit)
        : '',
      boardingContractClauseText: shop.boardingContractClauseText || ''
    };
  },

  _applyStorePhotos(storePhotos) {
    const normalized = normalizeStorePhotos(storePhotos);
    const shop = { ...this.data.shop, storePhotos: normalized };
    this.setData({ shop, storePhotos: normalized });
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
      receptionRangeSummary: formatReceptionRangeText(normalized)
    });
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
    this.setData({
      chargeSummary: buildChargeSummary({
        checkInDayCharge: this.data.checkInDayCharge,
        departureDayCharge: this.data.departureDayCharge,
        departureCharge: this.data.departureCharge
      })
    });
  },

  _getStoreFormPayload() {
    const billingRules = this._getBillingRulesPayload();
    return {
      shop: {
        ...this.data.shop,
        businessHours: this.data.businessHours,
        receptionRange: this.data.receptionRange,
        storePhotos: this.data.storePhotos
      },
      businessHours: this.data.businessHours,
      receptionRange: this.data.receptionRange,
      storePhotos: this.data.storePhotos,
      billingRules,
      checkInDayCharge: this.data.checkInDayCharge,
      departureDayCharge: this.data.departureDayCharge,
      departureCharge: this.data.departureCharge
    };
  },

  _validateStoreForm() {
    return validateStoreForm(this._getStoreFormPayload());
  },

  _getBillingRulesPayload() {
    return {
      ...app.getBillingRules(),
      billingMode: this.data.billingMode,
      weightPricing: normalizeWeightPricing(this.data.weightPricing),
      roomPricing: normalizeRoomPricing(this.data.roomPricing),
      checkInDayCharge: this.data.checkInDayCharge,
      departureDayCharge: this.data.departureDayCharge,
      departureCharge: normalizeDepartureCharge(this.data.departureCharge)
    };
  },

  onField(e) {
    this._markDirty();
    const shop = { ...this.data.shop };
    shop[e.currentTarget.dataset.field] = e.detail.value;
    this.setData({ shop });
  },

  onChooseLogo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this._markDirty();
        const shop = { ...this.data.shop, logo: res.tempFiles[0].tempFilePath };
        this.setData({ shop });
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

  onBillingMode(e) {
    this._markDirty();
    this.setData({ billingMode: e.detail.value });
  },

  onCheckInDayCharge(e) {
    this._markDirty();
    this.setData({ checkInDayCharge: e.detail.value }, () => this._updateChargeSummary());
  },

  onDepartureDayCharge(e) {
    this._markDirty();
    this.setData({ departureDayCharge: e.detail.value }, () => this._updateChargeSummary());
  },

  onDepartureTimeChange(e) {
    this._markDirty();
    const field = e.currentTarget.dataset.field;
    const departureCharge = normalizeDepartureCharge({
      ...this.data.departureCharge,
      [field]: e.detail.value
    });
    this.setData({ departureCharge }, () => this._updateChargeSummary());
  },

  onPickupServiceChange(e) {
    this._markDirty();
    const pickupService = e.detail.value;
    const shop = {
      ...this.data.shop,
      pickupService,
      pickupPricingMode: pickupService === 'yes'
        ? (this.data.shop.pickupPricingMode || PICKUP_PRICING_MODE.FLAT)
        : this.data.shop.pickupPricingMode
    };
    this.setData({ shop });
  },

  onPickupPricingModeChange(e) {
    this._markDirty();
    const mode = e.detail.value === PICKUP_PRICING_MODE.DISTANCE
      ? PICKUP_PRICING_MODE.DISTANCE
      : PICKUP_PRICING_MODE.FLAT;
    const shop = { ...this.data.shop, pickupPricingMode: mode };
    this.setData({ shop });
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
    const current = normalizeStorePhotos(this.data.storePhotos);
    const remain = MAX_STORE_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传6张', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this._markDirty();
        const picked = (res.tempFiles || []).map((file) => file.tempFilePath);
        this._applyStorePhotos(current.concat(picked).slice(0, MAX_STORE_PHOTOS));
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
    const url = e.currentTarget.dataset.url;
    const urls = normalizeStorePhotos(this.data.storePhotos);
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
    const weightPricing = updateWeightRangeField(this.data.weightPricing, idx, 'price', e.detail.value);
    this.setData({ weightPricing });
  },

  onWeightRangeField(e) {
    this._markDirty();
    const idx = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const weightPricing = updateWeightRangeField(this.data.weightPricing, idx, field, e.detail.value);
    this.setData({ weightPricing });
  },

  onAddWeightRange() {
    this._markDirty();
    this.setData({ weightPricing: addWeightRange(this.data.weightPricing) });
  },

  onRemoveWeightRange(e) {
    this._markDirty();
    const index = e.currentTarget.dataset.index;
    this.setData({ weightPricing: removeWeightRange(this.data.weightPricing, index) });
  },

  onRoomField(e) {
    this._markDirty();
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const roomPricing = updateRoomField(this.data.roomPricing, index, field, e.detail.value);
    this.setData({ roomPricing });
  },

  onAddRoom() {
    this._markDirty();
    this.setData({ roomPricing: addRoom(this.data.roomPricing) });
  },

  onRemoveRoom(e) {
    this._markDirty();
    const index = e.currentTarget.dataset.index;
    this.setData({ roomPricing: removeRoom(this.data.roomPricing, index) });
  },

  onOpenContractModal() {
    const shop = this._normalizeShop(this.data.shop);
    const storedText = getStoredClauseEditText(shop);
    this.setData({
      showContractModal: true,
      contractClauseDraft: storedText || getDefaultClauseEditText(shop),
      contractCompensationDraft: shop.compensationLimit != null && shop.compensationLimit !== ''
        ? String(shop.compensationLimit)
        : ''
    });
  },

  onCloseContractModal() {
    this.setData({ showContractModal: false });
  },

  onContractClauseInput(e) {
    this.setData({ contractClauseDraft: e.detail.value });
  },

  onContractCompensationInput(e) {
    const compensation = e.detail.value;
    const shop = {
      ...this._normalizeShop(this.data.shop),
      compensationLimit: compensation
    };
    const stored = getStoredClauseEditText(shop);
    this.setData({
      contractCompensationDraft: compensation,
      contractClauseDraft: stored
        ? this.data.contractClauseDraft
        : getDefaultClauseEditText(shop)
    });
  },

  onResetContractClause() {
    const shop = this._normalizeShop(this.data.shop);
    wx.showModal({
      title: '恢复默认',
      content: '将恢复为平台默认寄养协议条款，并清空赔付上限。确定继续？',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({
          contractClauseDraft: getDefaultClauseEditText({ ...shop, compensationLimit: '' }),
          contractCompensationDraft: ''
        });
      }
    });
  },

  onConfirmContractClause() {
    const clauseText = (this.data.contractClauseDraft || '').trim();
    const defaultText = getDefaultClauseEditText({
      ...this.data.shop,
      compensationLimit: this.data.contractCompensationDraft
    }).trim();
    const compensationRaw = (this.data.contractCompensationDraft || '').trim();
    let compensationLimit = '';
    if (compensationRaw !== '') {
      const num = parseFloat(compensationRaw);
      compensationLimit = Number.isFinite(num) && num >= 0 ? num : '';
    }
    const isDefaultClause = !clauseText || clauseText === defaultText;

    const shop = {
      ...this.data.shop,
      boardingContractClauseText: isDefaultClause ? '' : clauseText,
      compensationLimit: compensationLimit === '' ? '' : compensationLimit
    };

    this._markDirty();
    this.setData({
      shop,
      showContractModal: false,
      ...this._pickContractClauseState(shop)
    });
    wx.showToast({
      title: isDefaultClause ? '已恢复默认，请保存设置' : '已更新，请保存设置',
      icon: 'none'
    });
  },

  preventMove() {},

  onSave() {
    const formError = this._validateStoreForm();
    if (formError) {
      showValidationAlert(formError);
      return;
    }

    const billingRules = this._getBillingRulesPayload();
    const currentStatus = normalizeStoreStatus(this.data.shop.status);
    const nextStatus = currentStatus === STATUS_INCOMPLETE ? STATUS_OPEN : currentStatus;

    wx.showLoading({ title: '保存中' });
    const cachedShop = app.getShop() || {};
    const shop = this._normalizeShop({
      ...this.data.shop,
      status: nextStatus,
      businessHours: this.data.businessHours,
      receptionRange: this.data.receptionRange,
      storePhotos: this.data.storePhotos,
      billingRules
    });
    uploadStoreLogo(shop.logo, cachedShop.logo)
      .then((logo) => {
        if (logo) shop.logo = logo;
        return uploadStorePhotos(shop.storePhotos, cachedShop.storePhotos);
      })
      .then((storePhotos) => {
        shop.storePhotos = storePhotos;
        return app.syncShopToCloud(shop);
      })
      .then((saved) => {
        app.saveBillingRules(billingRules);
        this._applyShopToForm(saved);
        this._formDirty = false;
        wx.hideLoading();
        const openedNow = currentStatus === STATUS_INCOMPLETE && normalizeStoreStatus(saved.status) === STATUS_OPEN;
        wx.showToast({
          title: openedNow ? '保存成功，店铺已开始营业' : '保存成功',
          icon: 'success'
        });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none',
          duration: 3000
        });
      });
  },

  onCopyStoreDisplayNo() {
    copyText(this.data.shop && this.data.shop.displayNo, '已复制店铺编号');
  },
  onAdminSecretTap() {
    handlePageSecretTap(this);
  }
});
