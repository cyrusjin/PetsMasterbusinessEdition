const app = getApp();
const datePicker = require('../../utils/datePicker');
const { ensureLogin } = require('../../../utils/api');
const {
  PET_TYPES,
  validatePetForm,
  buildPetPayload,
  uploadPetPhoto,
  normalizePetType,
  normalizePetHealthFields,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  parseAgeParts
} = require('../../utils/petForm');
const { searchBreeds, hasExactBreed } = require('../../utils/petBreeds');
const {
  getDraftPet,
  getUnassignedPet,
  upsertDraftPet,
  upsertUnassignedPet,
  readProxySession,
  isUnassignedSession,
  buildProxyReserveUrl,
  PROXY_GUEST_PICKER_PATH
} = require('../../../utils/proxyOrder');

function createDefaultHealthFields() {
  return {
    vaccination: '',
    dewormDate: '',
    allergyStatus: '',
    allergy: '',
    medicalHistoryStatus: '',
    medicalHistory: '',
    isPregnant: '',
    inHeat: '',
    isNeutered: '',
    hasDogLicense: ''
  };
}

Page({
  data: {
    id: '',
    name: '',
    petType: '',
    breed: '',
    gender: '',
    age: '',
    ageYears: '',
    ageMonths: '',
    weight: '',
    color: '',
    photo: '',
    character: '',
    behaviorHabits: '',
    dietTaboo: '',
    specialCare: '',
    remark: '',
    ...createDefaultHealthFields(),
    petTypes: PET_TYPES,
    saving: false,
    showDewormDatePicker: false,
    dateYears: [],
    dateMonths: [],
    dateDays: [],
    datePickerValue: [0, 0, 0],
    dateMax: null,
    showBreedPanel: false,
    breedSuggestions: [],
    breedExactMatch: false,
    breedCustomHint: ''
  },

  onLoad(opts) {
    this._proxyMode = String((opts && opts.proxy) || '') === '1';
    this._nextAfterSave = String((opts && opts.next) || '').trim();
    this._proxyPool = String((opts && opts.pool) || '').trim();
    this._entryServiceLine = String((opts && (opts.serviceLine || opts.line)) || '').trim();
    if (this._proxyMode) {
      wx.setNavigationBarTitle({ title: '代填宠物档案' });
    }
    if (opts.id) {
      const pet = this._proxyMode
        ? (getDraftPet(opts.id) || getUnassignedPet(opts.id))
        : app.getPets().find((p) => p.id === opts.id);
      if (pet) {
        const petType = normalizePetType(pet.type || pet.petType);
        const health = normalizePetHealthFields(pet);
        const ageParts = parseAgeParts(pet);
        this.setData({
          ...pet,
          ...health,
          ...ageParts,
          behaviorHabits: pet.behaviorHabits || '',
          petType
        });
        this._refreshBreedSuggestions(pet.breed || '', petType, false);
        return;
      }
    }
    this.setData(createDefaultHealthFields());
    this._refreshBreedSuggestions('', '', false);
  },

  _refreshBreedSuggestions(keyword, petType, openPanel) {
    const type = petType != null ? petType : this.data.petType;
    const text = keyword != null ? keyword : this.data.breed;
    const trimmed = String(text || '').trim();
    const exact = hasExactBreed(text, type);
    let suggestions = searchBreeds(text, type, 30);
    // 已输入内容与候选项完全相同（如搜「博美」命中库内「博美」）时不再重复展示
    if (trimmed) {
      const key = trimmed.toLowerCase();
      suggestions = suggestions.filter((item) => String(item).toLowerCase() !== key);
    }
    // 有精确/模糊匹配时不展示「自己填写」，仅无匹配才允许自定义
    const patch = {
      breedSuggestions: suggestions,
      breedExactMatch: exact,
      breedCustomHint: trimmed && !suggestions.length && !exact ? trimmed : ''
    };
    if (openPanel === false) {
      patch.showBreedPanel = false;
    } else if (openPanel === true) {
      // 已精确命中且没有其他相关项时不必展开空面板
      patch.showBreedPanel = !!(suggestions.length || patch.breedCustomHint || !trimmed || !exact);
    }
    this.setData(patch);
  },

  onChoosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (r) => {
        this.setData({ photo: r.tempFiles[0].tempFilePath });
      }
    });
  },

  onField(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onDecimalField(e) {
    const field = e.currentTarget.dataset.field;
    const maxDecimals = field === 'weight' ? 2 : 2;
    this.setData({
      [field]: sanitizeDecimalInput(e.detail.value, maxDecimals)
    });
  },

  onAgeYearsInput(e) {
    this.setData({ ageYears: sanitizeIntegerInput(e.detail.value, 50) });
  },

  onAgeMonthsInput(e) {
    this.setData({ ageMonths: sanitizeIntegerInput(e.detail.value, 11) });
  },

  onBreedFocus() {
    this._refreshBreedSuggestions(this.data.breed, this.data.petType, true);
  },

  onBreedInput(e) {
    const breed = e.detail.value;
    this.setData({ breed });
    this._refreshBreedSuggestions(breed, this.data.petType, true);
  },

  onBreedBlur() {
    setTimeout(() => {
      this.setData({ showBreedPanel: false });
    }, 180);
  },

  onSelectBreed(e) {
    const breed = e.currentTarget.dataset.value;
    if (!breed) return;
    this.setData({
      breed,
      showBreedPanel: false,
      breedCustomHint: '',
      breedExactMatch: true
    });
  },

  onUseCustomBreed() {
    const breed = String(this.data.breed || '').trim();
    if (!breed) return;
    this.setData({
      breed,
      showBreedPanel: false,
      breedCustomHint: '',
      breedExactMatch: false
    });
  },

  onSelectPetType(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    this.setData({ petType: value });
    this._refreshBreedSuggestions(this.data.breed, value, this.data.showBreedPanel);
  },

  onOpenDewormDatePicker() {
    const state = datePicker.buildPickerState(this.data.dewormDate);
    this.setData({
      showDewormDatePicker: true,
      dateYears: state.years,
      dateMonths: state.months,
      dateDays: state.days,
      datePickerValue: state.datePickerValue,
      dateMax: state.maxDate
    });
  },

  onDatePickerChange(e) {
    const value = e.detail.value;
    const refreshed = datePicker.refreshPickerData(this.data.dateYears, value, this.data.dateMax);
    this.setData({
      datePickerValue: refreshed.datePickerValue,
      dateMonths: refreshed.months,
      dateDays: refreshed.days
    });
  },

  onConfirmDewormDate() {
    const { dateYears, dateMonths, dateDays, datePickerValue, dateMax } = this.data;
    const dewormDate = datePicker.valueToDateString(
      dateYears,
      dateMonths,
      dateDays,
      datePickerValue,
      dateMax
    );
    this.setData({ dewormDate, showDewormDatePicker: false });
  },

  onCancelDewormDate() {
    this.setData({ showDewormDatePicker: false });
  },

  onDatePanelTap() {},

  onRadio(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const patch = { [field]: value };
    if (field === 'allergyStatus' && value === '否') {
      patch.allergy = '';
    }
    if (field === 'medicalHistoryStatus' && value === '否') {
      patch.medicalHistory = '';
    }
    this.setData(patch);
  },

  onSave() {
    const err = validatePetForm(this.data);
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    if (this.data.saving) return;

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });

    const persist = (photo) => {
      const payload = buildPetPayload({ ...this.data, photo });
      if (this._proxyMode) {
        const fromList = this._nextAfterSave === 'list';
        const saveToUnassigned = fromList
          || this._proxyPool === 'unassigned'
          || isUnassignedSession(readProxySession());
        if (fromList) {
          return Promise.resolve(upsertUnassignedPet(payload));
        }
        const saved = upsertDraftPet(payload);
        if (saveToUnassigned) upsertUnassignedPet(saved);
        return Promise.resolve(saved);
      }
      return app.savePet(payload);
    };

    const uploadThenSave = this._proxyMode
      ? uploadPetPhoto(this.data.photo).catch(() => this.data.photo)
      : ensureLogin().then(() => uploadPetPhoto(this.data.photo));

    Promise.resolve(uploadThenSave)
      .then((photo) => persist(photo))
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          if (this._proxyMode && this._nextAfterSave === 'list') {
            wx.navigateBack({
              fail: () => wx.redirectTo({ url: PROXY_GUEST_PICKER_PATH })
            });
            return;
          }
          if (this._proxyMode && this._nextAfterSave === 'reserve') {
            const url = this._entryServiceLine
              ? buildProxyReserveUrl(this._entryServiceLine)
              : `${PROXY_GUEST_PICKER_PATH}&continueOrder=1`;
            wx.redirectTo({
              url,
              fail: () => wx.navigateBack()
            });
            return;
          }
          wx.navigateBack();
        }, 400);
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({
          title: (error && error.message) || '保存失败',
          icon: 'none',
          duration: 3000
        });
      })
      .finally(() => {
        this.setData({ saving: false });
      });
  }
});
