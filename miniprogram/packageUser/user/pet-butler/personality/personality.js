const app = getApp();
const personality = require('../../../../utils/petPersonality');
const { buildUserHomeShareConfig, enableStoreShareMenu, prefetchShareImage, resolvePrefetchedShareImage } = require('../../../../utils/storeShare');

const PAGE_SIZE = personality.PAGE_SIZE || 5;

Page({
  data: {
    step: 'intro',
    pets: [],
    petNames: [],
    petIndex: 0,
    petId: '',
    petName: '',
    petNameInitial: '宝',
    petPhoto: '',
    questions: [],
    answers: [],
    pageIndex: 0,
    pageCount: 0,
    pageQuestions: [],
    totalCount: 0,
    progressText: '',
    segments: [],
    nextLabel: '下一页',
    scaleOptions: personality.SCALE_OPTIONS,
    result: null,
    existing: null,
    saving: false
  },

  onLoad(options) {
    const petId = String((options && options.petId) || '').trim();
    this._entryPetId = petId;
  },

  onShow() {
    this._hydrate(this._entryPetId);
    enableStoreShareMenu(app.getUserStoreView && app.getUserStoreView());
  },

  _hydrate(preferredId) {
    const pets = personality.attachToPets(app.getPets() || []);
    if (!pets.length) {
      this.setData({
        pets: [],
        petNames: [],
        petId: '',
        petName: '',
        petNameInitial: '宝',
        petPhoto: '',
        existing: null,
        result: null,
        step: 'intro'
      });
      prefetchShareImage('').catch(() => {});
      return;
    }
    let petIndex = pets.findIndex((item) => item.id === preferredId);
    if (petIndex < 0) petIndex = 0;
    const pet = pets[petIndex];
    const existing = pet.personality || null;
    const currentId = this.data.petId;
    const keepStep = currentId && currentId === pet.id && this.data.step !== 'intro';
    this.setData({
      pets,
      petNames: pets.map((item) => item.name || '宝贝'),
      petIndex,
      petId: pet.id,
      petName: pet.name || '宝贝',
      petNameInitial: String(pet.name || '宝').charAt(0),
      petPhoto: pet.photo || '',
      existing,
      result: keepStep ? this.data.result : existing,
      step: keepStep ? this.data.step : 'intro'
    });
    if (!keepStep) this._prepareQuestions(pet);
    else if (this.data.step === 'quiz') this._syncPage();
    this._prefetchPetShareImage(pet.photo);
  },

  _prepareQuestions(pet) {
    const questions = personality.getQuestions(pet && pet.type);
    const pageCount = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
    this.setData({
      questions,
      answers: questions.map(() => 0),
      pageIndex: 0,
      pageCount,
      totalCount: questions.length
    });
  },

  _syncPage() {
    const { questions, pageIndex, answers } = this.data;
    const pageCount = Math.max(1, Math.ceil((questions.length || 1) / PAGE_SIZE));
    const start = pageIndex * PAGE_SIZE;
    const pageQuestions = questions.slice(start, start + PAGE_SIZE).map((item, offset) => ({
      ...item,
      globalIndex: start + offset,
      answer: Number(answers[start + offset]) || 0
    }));
    const isLast = pageIndex >= pageCount - 1;
    this.setData({
      pageQuestions,
      pageCount,
      totalCount: questions.length,
      progressText: `${pageIndex + 1}/${pageCount}`,
      segments: new Array(pageCount).fill(0).map((_, index) => ({ id: index, on: index <= pageIndex })),
      nextLabel: isLast ? '完成测试' : '下一页'
    });
  },

  onPetChange(e) {
    const petIndex = Number(e.detail.value) || 0;
    const pet = this.data.pets[petIndex];
    if (!pet) return;
    this._entryPetId = pet.id;
    this.setData({
      petIndex,
      petId: pet.id,
      petName: pet.name || '宝贝',
      petNameInitial: String(pet.name || '宝').charAt(0),
      petPhoto: pet.photo || '',
      existing: pet.personality || null,
      result: pet.personality || null,
      step: 'intro'
    });
    this._prepareQuestions(pet);
    this._prefetchPetShareImage(pet.photo);
  },

  onStart() {
    if (!this.data.pets.length) {
      wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
      return;
    }
    this._prepareQuestions(this.data.pets[this.data.petIndex]);
    this.setData({
      step: 'quiz',
      pageIndex: 0,
      result: null
    }, () => this._syncPage());
  },

  onViewExisting() {
    if (!this.data.existing) return;
    this.setData({
      step: 'result',
      result: this.data.existing
    });
  },

  onSelectScale(e) {
    const index = Number(e.currentTarget.dataset && e.currentTarget.dataset.index);
    const value = Number(e.currentTarget.dataset && e.currentTarget.dataset.value);
    if (!Number.isInteger(index) || index < 0 || value < 1 || value > 5) return;
    const answers = this.data.answers.slice();
    answers[index] = value;
    this.setData({ answers }, () => this._syncPage());
  },

  _pageComplete() {
    return (this.data.pageQuestions || []).every((item) => Number(item.answer) >= 1);
  },

  onPrevPage() {
    if (this.data.pageIndex <= 0) {
      this.setData({ step: 'intro' });
      return;
    }
    this.setData({ pageIndex: this.data.pageIndex - 1 }, () => this._syncPage());
  },

  onNextPage() {
    if (!this._pageComplete()) {
      wx.showToast({ title: '请先完成本页题目', icon: 'none' });
      return;
    }
    const lastIndex = Math.max(0, this.data.pageCount - 1);
    if (this.data.pageIndex >= lastIndex) {
      this._finish();
      return;
    }
    this.setData({ pageIndex: this.data.pageIndex + 1 }, () => this._syncPage());
  },

  _finish() {
    const pet = this.data.pets[this.data.petIndex];
    const result = personality.buildResult(this.data.answers, pet && pet.type);
    if (!result) {
      wx.showToast({ title: '还有题没选完', icon: 'none' });
      return;
    }
    this.setData({ result, step: 'result', saving: true });
    this._persist(result);
  },

  _persist(result) {
    const pet = this.data.pets[this.data.petIndex];
    if (!pet) {
      this.setData({ saving: false });
      return;
    }
    personality.saveLocal(pet.id, result, pet.type);
    const next = personality.persistToPet(pet, result);
    if (typeof app._upsertLocalPet === 'function') {
      app._upsertLocalPet(next);
    }
    if (typeof app.savePet !== 'function') {
      this.setData({ saving: false, existing: result });
      return;
    }
    app.savePet(next)
      .then((saved) => {
        const merged = personality.persistToPet(saved, saved.personality || result);
        personality.saveLocal(merged.id, merged.personality, merged.type);
        if (typeof app._upsertLocalPet === 'function') {
          app._upsertLocalPet(merged);
        }
        const pets = personality.attachToPets(app.getPets() || []);
        this.setData({
          pets,
          petPhoto: merged.photo || this.data.petPhoto || '',
          existing: merged.personality,
          result: merged.personality,
          saving: false
        });
      })
      .catch(() => {
        this.setData({ saving: false, existing: result });
        wx.showToast({
          title: '先记在本机了，档案同步稍后再说',
          icon: 'none'
        });
      });
  },

  onRetake() {
    this.onStart();
  },

  _prefetchPetShareImage(photo) {
    prefetchShareImage(photo).catch(() => {});
  },

  _shareImageUrl() {
    const pet = this.data.pets[this.data.petIndex] || {};
    const photo = pet.photo || this.data.petPhoto || '';
    return resolvePrefetchedShareImage(photo) || photo || '';
  },

  onShareAppMessage() {
    const petName = this.data.petName || '我家毛孩子';
    const result = this.data.result;
    const title = result && result.typeId
      ? `我家${petName}是 ${result.typeId} ${result.typeName}，你的呢？`
      : '测测你家毛孩子是哪种16型人格';
    return buildUserHomeShareConfig({
      title,
      source: 'personality',
      imageUrl: this._shareImageUrl(),
      shop: (app.getUserStoreView && app.getUserStoreView()) || (app.getCurrentStore && app.getCurrentStore()) || {}
    });
  }
});
