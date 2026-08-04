const app = getApp();
const butler = require('../../../../utils/petButler');

Page({
  data: {
    pets: [],
    petNames: [],
    petIndex: 0,
    currentPet: null,
    birthday: '',
    adoptDate: '',
    noteText: '',
    notes: [],
    birthdayInfo: null,
    today: butler.todayStr()
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
      this.setData({ currentPet: null, notes: [], birthdayInfo: null });
      return;
    }
    const data = butler.getMilestones(pet.id);
    this.setData({
      currentPet: pet,
      birthday: data.birthday || '',
      adoptDate: data.adoptDate || '',
      notes: data.notes || [],
      birthdayInfo: butler.birthdayMeta(data.birthday)
    });
  },

  onPetChange(e) {
    const petIndex = Number(e.detail.value) || 0;
    this.setData({ petIndex });
    this._load(this.data.pets[petIndex]);
  },

  onBirthday(e) { this.setData({ birthday: e.detail.value }); },
  onAdopt(e) { this.setData({ adoptDate: e.detail.value }); },
  onNoteText(e) { this.setData({ noteText: e.detail.value }); },

  onSaveDates() {
    const pet = this.data.currentPet;
    if (!pet) return;
    butler.saveMilestones(pet.id, {
      birthday: this.data.birthday,
      adoptDate: this.data.adoptDate
    });
    this._load(pet);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onAddNote() {
    const pet = this.data.currentPet;
    const text = String(this.data.noteText || '').trim();
    if (!pet || !text) {
      wx.showToast({ title: '写点什么吧', icon: 'none' });
      return;
    }
    butler.addMilestoneNote(pet.id, text);
    this.setData({ noteText: '' });
    this._load(pet);
  },

  onRemoveNote(e) {
    const pet = this.data.currentPet;
    const id = e.currentTarget.dataset.id;
    if (!pet || !id) return;
    wx.showModal({
      title: '删除足迹',
      content: '确定删除这条记录吗？',
      confirmColor: '#D96F55',
      success: (res) => {
        if (!res.confirm) return;
        butler.removeMilestoneNote(pet.id, id);
        this._load(pet);
      }
    });
  },

  onGoAddPet() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  }
});
