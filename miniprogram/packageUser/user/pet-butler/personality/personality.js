const app = getApp();
const personality = require('../../../../utils/petPersonality');
const { buildUserHomeShareConfig, enableStoreShareMenu, prefetchShareImage, resolvePrefetchedShareImage } = require('../../../../utils/storeShare');

Page({
  data: {
    step: 'intro',
    pets: [],
    petNames: [],
    petIndex: 0,
    petId: '',
    petName: '',
    petPhoto: '',
    questions: [],
    qIndex: 0,
    answers: [],
    currentQuestion: null,
    progressText: '',
    progressPercent: 0,
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
      petPhoto: pet.photo || '',
      existing,
      result: keepStep ? this.data.result : existing,
      step: keepStep ? this.data.step : 'intro'
    });
    if (!keepStep) this._prepareQuestions(pet);
    this._prefetchPetShareImage(pet.photo);
  },

  _prepareQuestions(pet) {
    const questions = personality.getQuestions(pet && pet.type);
    this.setData({
      questions,
      answers: questions.map(() => ''),
      qIndex: 0
    });
  },

  _syncQuestion() {
    const { questions, qIndex, answers } = this.data;
    const currentQuestion = questions[qIndex] || null;
    const total = questions.length || 1;
    this.setData({
      currentQuestion,
      progressText: `${qIndex + 1} / ${total}`,
      progressPercent: Math.round(((qIndex + (answers[qIndex] ? 1 : 0)) / total) * 100)
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
      qIndex: 0,
      result: null
    }, () => this._syncQuestion());
  },

  onViewExisting() {
    if (!this.data.existing) return;
    this.setData({
      step: 'result',
      result: this.data.existing
    });
  },

  onSelectOption(e) {
    const letter = String((e.currentTarget.dataset && e.currentTarget.dataset.letter) || '').toUpperCase();
    if (!letter) return;
    const answers = this.data.answers.slice();
    answers[this.data.qIndex] = letter;
    this.setData({ answers }, () => this._syncQuestion());
    const isLast = this.data.qIndex >= this.data.questions.length - 1;
    setTimeout(() => {
      if (this.data.answers[this.data.qIndex] !== letter) return;
      if (isLast) this._finish();
      else this._goQuestion(this.data.qIndex + 1);
    }, 180);
  },

  onPrevQuestion() {
    if (this.data.qIndex <= 0) {
      this.setData({ step: 'intro' });
      return;
    }
    this._goQuestion(this.data.qIndex - 1);
  },

  _goQuestion(index) {
    const max = this.data.questions.length - 1;
    const qIndex = Math.max(0, Math.min(max, index));
    this.setData({ qIndex }, () => this._syncQuestion());
  },

  _finish() {
    const result = personality.buildResult(this.data.answers);
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
    personality.saveLocal(pet.id, result);
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
        personality.saveLocal(merged.id, merged.personality);
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
      : '测测你家毛孩子是霸总还是咸鱼';
    return buildUserHomeShareConfig({
      title,
      source: 'personality',
      imageUrl: this._shareImageUrl(),
      shop: (app.getUserStoreView && app.getUserStoreView()) || (app.getCurrentStore && app.getCurrentStore()) || {}
    });
  }
});
