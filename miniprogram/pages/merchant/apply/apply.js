const app = getApp();
const { STORAGE_KEYS } = require('../../../utils/constants');
const storeApi = require('../../../utils/store');
const {
  validateApplyForm,
  createEmptyApplyShop,
  pickApplyShopFields
} = require('../../../utils/storeApply');
const {
  chooseStoreLocation,
  formatLocationAddress,
  isValidLocationResult,
  getLocationValidationMessage
} = require('../../../utils/location');
const {
  MAX_STORE_PHOTOS,
  normalizeStorePhotos,
  uploadStorePhotos
} = require('../../../utils/storePhotos');
const { resolveImageUrls } = require('../../../utils/imageCache');
const { showValidationAlert } = require('../../../utils/formAlert');

Page({
  data: {
    shop: createEmptyApplyShop(),
    storePhotos: [],
    maxStorePhotos: MAX_STORE_PHOTOS,
    submitting: false,
    applyStatus: ''
  },

  onLoad() {
    this._formInitialized = false;
    this._formDirty = false;
  },

  onShow() {
    app.ensureCloudAndLogin().then(() => {
      if (app.isMerchantApproved()) {
        wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
        return;
      }
      wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
    });
  },

  _applyFormFromShop(shop, applyStatus) {
    this.setData({
      applyStatus: applyStatus || '',
      shop: pickApplyShopFields(shop),
      storePhotos: normalizeStorePhotos(shop && shop.storePhotos)
    });
  },

  _markFormDirty() {
    this._formDirty = true;
  },

  onField(e) {
    if (this.data.applyStatus === 'pending') return;
    this._markFormDirty();
    const field = e.currentTarget.dataset.field;
    const shop = { ...this.data.shop, [field]: e.detail.value };
    this.setData({ shop });
  },

  onChooseAddress() {
    if (this.data.applyStatus === 'pending') return;
    this._markFormDirty();
    chooseStoreLocation(this.data.shop)
      .then((res) => {
        const validationMsg = getLocationValidationMessage(res);
        if (validationMsg) {
          wx.showToast({ title: validationMsg, icon: 'none', duration: 2500 });
          return;
        }
        if (!isValidLocationResult(res)) return;
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

  onChooseStorePhotos() {
    if (this.data.applyStatus === 'pending') return;
    this._markFormDirty();
    const current = normalizeStorePhotos(this.data.storePhotos);
    const remain = MAX_STORE_PHOTOS - current.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${MAX_STORE_PHOTOS}张`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const picked = (res.tempFiles || []).map((file) => file.tempFilePath);
        if (!picked.length) return;
        wx.showLoading({ title: '上传中', mask: true });
        uploadStorePhotos(picked)
          .then((uploaded) => {
            const storePhotos = normalizeStorePhotos(current.concat(uploaded));
            this.setData({ storePhotos });
          })
          .catch((err) => {
            wx.showToast({
              title: (err && err.message) || '图片上传失败',
              icon: 'none',
              duration: 3000
            });
          })
          .finally(() => {
            wx.hideLoading();
          });
      }
    });
  },

  onDeleteStorePhoto(e) {
    if (this.data.applyStatus === 'pending') return;
    this._markFormDirty();
    const index = e.currentTarget.dataset.index;
    const storePhotos = [...this.data.storePhotos];
    storePhotos.splice(index, 1);
    this.setData({ storePhotos: normalizeStorePhotos(storePhotos) });
  },

  onPreviewStorePhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = this.data.storePhotos || [];
    if (!url || !urls.length) return;
    resolveImageUrls(urls).then((resolved) => {
      const list = resolved.filter(Boolean);
      if (!list.length) return;
      const current = list[urls.indexOf(url)] || list[0];
      wx.previewImage({ current, urls: list });
    });
  },

  onSubmit() {
    if (this.data.submitting || this.data.applyStatus === 'pending') return;
    const shop = { ...this.data.shop };
    const storePhotos = normalizeStorePhotos(this.data.storePhotos);
    const formError = validateApplyForm({ shop, storePhotos });
    if (formError) {
      showValidationAlert(formError);
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });

    uploadStorePhotos(storePhotos)
      .then((uploadedPhotos) => storeApi.submitMerchantApply({
        ...shop,
        storePhotos: uploadedPhotos
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
        this._formDirty = false;
        this._formInitialized = true;
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
  }
});
