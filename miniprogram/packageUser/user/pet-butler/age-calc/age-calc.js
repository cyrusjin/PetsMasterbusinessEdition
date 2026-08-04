const app = getApp();
const butler = require('../../../../utils/petButler');

Page({
  data: {
    pets: [],
    petNames: ['手动输入'],
    petIndex: 0,
    typeOptions: ['狗', '猫'],
    typeIndex: 0,
    age: '',
    result: null
  },

  onShow() {
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
    const typeIndex = String(pet.type || '').includes('猫') ? 1 : 0;
    this.setData({
      typeIndex,
      age: pet.age != null ? String(pet.age) : ''
    }, () => this._calc());
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) || 0 }, () => this._calc());
  },

  onAge(e) {
    this.setData({ age: e.detail.value }, () => this._calc());
  },

  _calc() {
    const result = butler.calcHumanAge(
      this.data.typeOptions[this.data.typeIndex],
      this.data.age
    );
    this.setData({ result });
  },

  onAskAi() {
    const type = this.data.typeOptions[this.data.typeIndex] || '宠物';
    const stage = (this.data.result && this.data.result.stage) || '';
    const q = encodeURIComponent(
      stage
        ? `${type}处于「${stage}」阶段，日常护理要注意什么？`
        : `${type}不同年龄段护理要注意什么？`
    );
    wx.navigateTo({ url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}` });
  }
});
