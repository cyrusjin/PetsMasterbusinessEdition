const app = getApp();
const butler = require('../../../../utils/petButler');
const { syncAiConsultFlag, guardOpenAiConsult } = require('../../../../utils/merchantSwitch');

Page({
  data: {
    pets: [],
    petNames: ['手动输入'],
    petIndex: 0,
    typeOptions: ['狗', '猫'],
    typeIndex: 0,
    breed: '',
    weight: '',
    result: null,
    showAiConsult: true
  },

  onShow() {
    syncAiConsultFlag(this);
    const pets = app.getPets() || [];
    this.setData({
      pets,
      petNames: ['手动输入', ...pets.map((p) => p.name || '宝贝')]
    });
  },

  onPetChange(e) {
    const petIndex = Number(e.detail.value) || 0;
    this.setData({ petIndex });
    if (petIndex === 0) return;
    const pet = this.data.pets[petIndex - 1];
    if (!pet) return;
    this.setData({
      typeIndex: String(pet.type || '').includes('猫') ? 1 : 0,
      breed: pet.breed || '',
      weight: pet.weight != null ? String(pet.weight) : ''
    }, () => this._calc());
  },

  onTypeChange(e) { this.setData({ typeIndex: Number(e.detail.value) || 0 }, () => this._calc()); },
  onBreed(e) { this.setData({ breed: e.detail.value }, () => this._calc()); },
  onWeight(e) { this.setData({ weight: e.detail.value }, () => this._calc()); },

  _calc() {
    const result = butler.assessWeight(
      this.data.breed,
      this.data.weight,
      this.data.typeOptions[this.data.typeIndex]
    );
    this.setData({ result });
  },

  onAskAi() {
    if (!guardOpenAiConsult()) return;
    const label = (this.data.result && this.data.result.label) || '';
    const type = this.data.typeOptions[this.data.typeIndex] || '宠物';
    const q = encodeURIComponent(
      label ? `${type}体重评估为「${label}」，日常饮食和运动怎么调整？` : `${type}如何保持健康体重？`
    );
    wx.navigateTo({ url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}` });
  }
});
