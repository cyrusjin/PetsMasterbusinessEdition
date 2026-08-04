const app = getApp();
const butler = require('../../../../utils/petButler');

Page({
  data: {
    pets: [],
    petNames: [],
    petIndex: 0,
    currentPet: null,
    minutes: '30',
    note: '',
    streak: 0,
    records: [],
    weekMinutes: 0
  },

  onShow() {
    this._boot();
  },

  _boot() {
    const apply = (pets) => {
      const list = pets || [];
      const petIndex = Math.min(this.data.petIndex, Math.max(list.length - 1, 0));
      this.setData({
        pets: list,
        petNames: list.map((p) => p.name || '宝贝'),
        petIndex
      });
      this._load(list[petIndex]);
    };
    apply(app.getPets() || []);
    app.loadPets({ force: false }).then((pets) => apply(pets || []));
  },

  _load(pet) {
    if (!pet) {
      this.setData({ currentPet: null, streak: 0, records: [], weekMinutes: 0 });
      return;
    }
    const data = butler.getWalks(pet.id);
    const weekStart = butler.addDays(butler.todayStr(), -6);
    const weekMinutes = (data.records || [])
      .filter((r) => r.date >= weekStart)
      .reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
    this.setData({
      currentPet: pet,
      streak: data.streak,
      records: data.records,
      weekMinutes
    });
  },

  onPetChange(e) {
    const petIndex = Number(e.detail.value) || 0;
    this.setData({ petIndex });
    this._load(this.data.pets[petIndex]);
  },

  onMinutes(e) { this.setData({ minutes: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },

  onQuick(e) {
    this.setData({ minutes: String(e.currentTarget.dataset.min) });
  },

  onCheckIn() {
    const pet = this.data.currentPet;
    if (!pet) {
      wx.showToast({ title: '请先添加宠物', icon: 'none' });
      return;
    }
    const minutes = Number(this.data.minutes);
    if (!(minutes > 0)) {
      wx.showToast({ title: '请填写分钟数', icon: 'none' });
      return;
    }
    if (minutes > 300) {
      wx.showToast({ title: '时长有点长，再确认下', icon: 'none' });
      return;
    }
    butler.addWalk(pet.id, minutes, this.data.note);
    this.setData({ note: '' });
    this._load(pet);
    wx.showToast({ title: '打卡成功', icon: 'success' });
  },

  onGoAddPet() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  }
});
