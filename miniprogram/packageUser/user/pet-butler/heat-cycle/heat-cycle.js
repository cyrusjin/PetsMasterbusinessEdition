const app = getApp();
const butler = require('../../../../utils/petButler');

Page({
  data: {
    pets: [],
    femalePets: [],
    petNames: [],
    petIndex: 0,
    currentPet: null,
    cycle: null,
    lastStart: '',
    cycleDays: '180',
    duration: '21',
    notes: '',
    today: butler.todayStr()
  },

  onShow() {
    this._boot();
  },

  _boot() {
    const apply = (pets) => {
      const femalePets = (pets || []).filter((p) => p.gender === '母' && String(p.type || '').includes('狗'));
      const fallback = femalePets.length ? femalePets : (pets || []).filter((p) => p.gender === '母');
      const list = fallback.length ? fallback : (pets || []);
      const petIndex = Math.min(this.data.petIndex, Math.max(list.length - 1, 0));
      this.setData({
        pets: pets || [],
        femalePets: list,
        petNames: list.map((p) => p.name || '宝贝'),
        petIndex
      });
      this._loadCycle(list[petIndex]);
    };
    apply(app.getPets() || []);
    app.loadPets({ force: false }).then((pets) => apply(pets || []));
  },

  _loadCycle(pet) {
    if (!pet) {
      this.setData({ currentPet: null, cycle: null });
      return;
    }
    const cycle = butler.getHeatCycle(pet.id);
    this.setData({
      currentPet: pet,
      cycle,
      lastStart: cycle.lastStart || '',
      cycleDays: String(cycle.cycleDays || 180),
      duration: String(cycle.duration || 21),
      notes: cycle.notes || ''
    });
  },

  onPetChange(e) {
    const petIndex = Number(e.detail.value) || 0;
    this.setData({ petIndex });
    this._loadCycle(this.data.femalePets[petIndex]);
  },

  onDateChange(e) { this.setData({ lastStart: e.detail.value }); },
  onCycleDays(e) { this.setData({ cycleDays: e.detail.value }); },
  onDuration(e) { this.setData({ duration: e.detail.value }); },
  onNotes(e) { this.setData({ notes: e.detail.value }); },

  onSave() {
    const pet = this.data.currentPet;
    if (!pet) return;
    if (!this.data.lastStart) {
      wx.showToast({ title: '请选择开始日期', icon: 'none' });
      return;
    }
    const cycle = butler.saveHeatCycle(pet.id, {
      lastStart: this.data.lastStart,
      cycleDays: Number(this.data.cycleDays) || 180,
      duration: Number(this.data.duration) || 21,
      notes: this.data.notes
    });
    this.setData({ cycle });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onMarkToday() {
    this.setData({ lastStart: butler.todayStr() }, () => this.onSave());
  },

  onGoAddPet() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  },

  onAskAi() {
    const q = encodeURIComponent('母犬发情期护理要注意什么？');
    wx.navigateTo({ url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}` });
  }
});
