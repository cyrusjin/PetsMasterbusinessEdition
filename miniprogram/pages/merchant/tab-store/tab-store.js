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
const { isAuthorizedNickName } = require('../../../utils/userAuth');
const { normalizePhone, validateMobilePhone } = require('../../../utils/phone');
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
  normalizeStorePhotos,
  normalizeIntroPhotos,
  normalizeNoticePhotos,
  reorderStorePhotos,
  reorderPhotoList,
  uploadStorePhotos,
  uploadIntroPhotos,
  uploadNoticePhotos,
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
const { normalizeDeposit, validateStoreForm } = require('../../../utils/storeForm');
const { normalizePickupPricing, PICKUP_PRICING_MODE, parsePickupFreeMinDays } = require('../../../utils/pickupPricing');
const {
  MAX_ROOM_DESCRIPTION,
  normalizeRoomPricing,
  addRoom,
  removeRoom,
  updateRoomField,
  uploadRoomPricingPhotos
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
    applyBusinessLicense: '',
    applyStatus: '',
    applyRejectReason: '',
    wxNickName: '',
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
    introPhotos: [],
    noticePhotos: [],
    maxStorePhotos: MAX_STORE_PHOTOS,
    maxIntroPhotos: MAX_INTRO_PHOTOS,
    maxNoticePhotos: MAX_NOTICE_PHOTOS,
    maxIntroText: MAX_INTRO_TEXT,
    maxNoticeText: MAX_NOTICE_TEXT,
    maxRoomDescription: MAX_ROOM_DESCRIPTION,
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
    pickupFreeMode: 'none',
    showContractModal: false,
    showCoopContractModal: false,
    coopContractMode: 'preview',
    coopContractDoc: null,
    contractClauseDraft: '',
    contractClauseCustomized: false,
    savingContractClause: false
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

  /** 入驻 / 关闭态：隐藏商家底部 Tab，只留本页 */
  _syncApplyShellChrome() {
    const hideTabs = !!(
      this.data.isDemoMode
      || this.data.isAdminDisabled
      || this._shouldShowApplyFlow()
      || app.isMerchantDisabled()
    );
    this.setData({ hideMerchantTabBar: hideTabs });
    if (hideTabs) {
      wx.hideTabBar({ animation: false }).catch(() => {});
    }
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
      this.setData({ isDemoMode: false, isAdminDisabled: true, hideMerchantTabBar: true });
      const cachedShop = app.getShop();
      if (cachedShop && cachedShop.store_id) {
        app.globalData.merchantStoreId = cachedShop.store_id;
        this._syncDisabledState(cachedShop);
      }
      return;
    }

    const showApplyFlow = this._shouldShowApplyFlow();
    if (showApplyFlow) {
      this.setData({ isDemoMode: true, isAdminDisabled: false, hideMerchantTabBar: true });
      this._hydrateApplyFormFromCache();
      return;
    }

    this.setData({
      isDemoMode: false,
      isAdminDisabled: false,
      applyStatus: '',
      applyRejectReason: '',
      hideMerchantTabBar: false
    });
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
        this.setData({ isDemoMode: false, isAdminDisabled: true, hideMerchantTabBar: true });
        this._syncApplyShellChrome();
        return app.ensureMerchantStore({ force: true }).then((shop) => {
          if (shop && shop.store_id) {
            this._syncDisabledState(shop);
          }
        });
      }

      const showApplyFlow = this._shouldShowApplyFlow();
      // 审核通过后务必清掉 pending/rejected，否则会一直 forceUser 刷新，打断头像等编辑
      this.setData({
        isDemoMode: showApplyFlow,
        isAdminDisabled: false,
        hideMerchantTabBar: showApplyFlow,
        ...(showApplyFlow ? {} : { applyStatus: '', applyRejectReason: '', hideMerchantTabBar: false })
      });
      this._syncApplyShellChrome();

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
    if (app.isUserClientMode && app.isUserClientMode()) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    // 审核中/已拒绝时强制拉用户，避免本地 pending 缓存导致界面不更新
    this._reloadStorePage({ forceUser: this._needsForceUserRefresh() })
      .then(() => {
        this._syncApplyShellChrome();
        this._syncTabBar();
      });
  },

  _syncTabBar() {},

  onSwitchToUser() {
    if (app.enterUserMode) {
      app.enterUserMode();
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },

  _setMerchantTabHidden(hidden) {
    if (hidden) {
      this.setData({ hideMerchantTabBar: true });
      return;
    }
    this._syncApplyShellChrome();
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

  onWxNickChange(e) {
    if (this.data.applyStatus === 'pending') return;
    const wxNickName = ((e.detail && e.detail.value) || '').trim();
    this.setData({ wxNickName });
    if (!isAuthorizedNickName(wxNickName)) return;
    app.updateProfile({ nickName: wxNickName }).catch(() => {});
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

    const wxNickName = (this.data.wxNickName || '').trim();
    if (!isAuthorizedNickName(wxNickName)) {
      showValidationAlert('请先获取微信昵称，便于平台审核识别申请人', '需要微信昵称');
      return;
    }

    if (!this.data.agreedToCoopContract || !this.data.signedCoopContractDraft) {
      showValidationAlert('请先阅读并签署《商家入驻平台合作协议》', '需要签署协议');
      return;
    }

    const signedCoopContractDraft = this.data.signedCoopContractDraft;
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });

    Promise.resolve()
      .then(() => app.updateProfile({ nickName: wxNickName }))
      .then(() => Promise.all([
        uploadStorePhotos(storePhotos),
        uploadBusinessLicense(this.data.applyBusinessLicense)
      ]))
      .then(([uploadedPhotos, businessLicense]) => storeApi.submitMerchantApply({
        ...shop,
        storePhotos: uploadedPhotos,
        businessLicense: businessLicense || '',
        coopContractSigned: true,
        coopContractSignTime: signedCoopContractDraft.signTime,
        coopContractSnapshot: signedCoopContractDraft
      }).then((res) => ({ res, uploadedPhotos, businessLicense })))
      .then(({ res, uploadedPhotos, businessLicense }) => {
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
        return app.refreshUserRole().then(() => store);
      })
      .then((store) => {
        wx.hideLoading();
        wx.showToast({ title: '申请已提交', icon: 'success' });
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
    const doc = this.data.agreedToCoopContract && this.data.signedCoopContractDraft
      ? this.data.signedCoopContractDraft
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
    app.globalData.signedCoopContractDraft = doc;
    this.setData({
      agreedToCoopContract: true,
      signedCoopContractDraft: doc,
      showCoopContractModal: false,
      coopContractMode: 'preview',
      coopContractDoc: null
    });
    this._setTabBarVisible(true);
    wx.showToast({ title: '签署成功', icon: 'success' });
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
      introPhotos: normalizeIntroPhotos(normalizedShop.introPhotos),
      noticePhotos: normalizeNoticePhotos(normalizedShop.noticePhotos),
      pickupFreeMode: parsePickupFreeMinDays(normalizedShop.pickupFreeMinDays) > 0 ? 'minDays' : 'none',
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
    const introPhotos = normalizeIntroPhotos(shop.introPhotos);
    const noticePhotos = normalizeNoticePhotos(shop.noticePhotos);
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
      introPhotos,
      noticePhotos,
      intro: shop.intro || '',
      notice: shop.notice || '',
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
    const pickupFreeMinDays = this.data.pickupFreeMode === 'minDays'
      ? (this.data.shop.pickupFreeMinDays || '')
      : '';
    return {
      shop: {
        ...this.data.shop,
        pickupFreeMinDays,
        businessHours: this.data.businessHours,
        receptionRange: this.data.receptionRange,
        storePhotos: this.data.storePhotos,
        introPhotos: this.data.introPhotos,
        noticePhotos: this.data.noticePhotos
      },
      businessHours: this.data.businessHours,
      receptionRange: this.data.receptionRange,
      storePhotos: this.data.storePhotos,
      introPhotos: this.data.introPhotos,
      noticePhotos: this.data.noticePhotos,
      billingRules,
      checkInDayCharge: this.data.checkInDayCharge,
      departureDayCharge: this.data.departureDayCharge,
      departureCharge: this.data.departureCharge
    };
  },

  _validateStoreForm() {
    const error = validateStoreForm(this._getStoreFormPayload());
    if (error) return error;
    if (this.data.shop.pickupService === 'yes' && this.data.pickupFreeMode === 'minDays') {
      if (!parsePickupFreeMinDays(this.data.shop.pickupFreeMinDays)) {
        return '请填写住几天及以上免费接送';
      }
    }
    return '';
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
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`shop.${field}`]: e.detail.value });
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

  onPickupFreeModeChange(e) {
    this._markDirty();
    const pickupFreeMode = e.detail.value === 'minDays' ? 'minDays' : 'none';
    const shop = { ...this.data.shop };
    if (pickupFreeMode === 'none') {
      shop.pickupFreeMinDays = '';
    } else if (!parsePickupFreeMinDays(shop.pickupFreeMinDays)) {
      shop.pickupFreeMinDays = '7';
    }
    this.setData({ pickupFreeMode, shop });
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
    const current = normalizeNoticePhotos(this.data.noticePhotos);
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
        this._applyNoticePhotos(current.concat(picked).slice(0, MAX_NOTICE_PHOTOS));
      },
      complete: () => {
        this._choosingNoticePhotos = false;
      }
    });
  },

  onDeleteNoticePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const noticePhotos = [...normalizeNoticePhotos(this.data.noticePhotos)];
    noticePhotos.splice(index, 1);
    this._markDirty();
    this._applyNoticePhotos(noticePhotos);
  },

  onPreviewNoticePhoto(e) {
    if (this.data.photoDrag && this.data.photoDrag.active) return;
    const url = e.currentTarget.dataset.url;
    const urls = normalizeNoticePhotos(this.data.noticePhotos);
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
        const roomPricing = updateRoomField(this.data.roomPricing, index, 'photo', path);
        this.setData({ roomPricing });
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
    const roomPricing = updateRoomField(this.data.roomPricing, index, 'photo', '');
    this.setData({ roomPricing });
  },

  onPreviewRoomPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const room = (this.data.roomPricing || [])[index];
    const url = room && room.photo;
    if (!url) return;
    resolveImageUrls([url]).then((urls) => {
      const current = (urls && urls[0]) || url;
      wx.previewImage({ current, urls: [current] });
    });
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

  _setTabBarVisible(visible) {
    if (!visible) {
      this.setData({ hideMerchantTabBar: true });
      return;
    }
    // 入驻 / 关闭态关闭弹窗后仍保持无 Tab
    this._syncApplyShellChrome();
  },

  onOpenContractModal() {
    const shop = this._normalizeShop(this.data.shop);
    const storedText = getStoredClauseEditText(shop);
    this._setTabBarVisible(false);
    this.setData({
      showContractModal: true,
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
    wx.showModal({
      title: '恢复默认',
      content: '将恢复为平台默认寄养协议条款。确定继续？',
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
    const clauseUpdates = {
      boardingContractClauseText: isDefaultClause ? '' : clauseText,
      ...(isDefaultClause && (!clauseText || clauseText === platformDefault)
        ? { compensationLimit: '' }
        : {})
    };

    const cachedShop = app.getShop() || {};
    const shopToSync = this._normalizeShop({
      ...cachedShop,
      store_id: (this.data.shop && this.data.shop.store_id) || cachedShop.store_id,
      ...clauseUpdates
    });

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
      pickupFreeMinDays: this.data.pickupFreeMode === 'minDays'
        ? (this.data.shop.pickupFreeMinDays || '')
        : '',
      status: nextStatus,
      businessHours: this.data.businessHours,
      receptionRange: this.data.receptionRange,
      storePhotos: this.data.storePhotos,
      introPhotos: this.data.introPhotos,
      noticePhotos: this.data.noticePhotos,
      billingRules
    });
    uploadStoreLogo(shop.logo, cachedShop.logo)
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
        return uploadNoticePhotos(shop.noticePhotos, cachedShop.noticePhotos);
      })
      .then((noticePhotos) => {
        shop.noticePhotos = noticePhotos;
        const fallbackRooms = ((cachedShop.billingRules || {}).roomPricing) || [];
        return uploadRoomPricingPhotos(billingRules.roomPricing, fallbackRooms);
      })
      .then((roomPricing) => {
        billingRules.roomPricing = roomPricing;
        shop.billingRules = { ...shop.billingRules, roomPricing };
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
