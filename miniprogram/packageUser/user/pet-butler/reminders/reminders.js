const app = getApp();
const butler = require('../../../../utils/petButler');
const { syncAiConsultFlag, guardOpenAiConsult } = require('../../../../utils/merchantSwitch');

Page({
  data: {
    pets: [],
    petIndex: 0,
    petNames: [],
    currentPet: null,
    items: [],
    editingKey: '',
    editLastDate: '',
    editInterval: '',
    today: butler.todayStr(),
    showAiConsult: false,
    aiHintTitle: '',
    aiHintSub: ''
  },

  _applyAiCopy(visible) {
    this.setData(
      visible
        ? {
            showAiConsult: true,
            aiHintTitle: '不确定周期？问问 AI',
            aiHintSub: '驱虫、疫苗间隔可咨询智能助手 ›'
          }
        : {
            showAiConsult: false,
            aiHintTitle: '',
            aiHintSub: ''
          }
    );
  },

  onShow() {
    syncAiConsultFlag(this).then((v) => this._applyAiCopy(v));
    this._loadPets();
  },

  _loadPets() {
    const pets = app.getPets() || [];
    const petNames = pets.map((p) => p.name || '宝贝');
    const petIndex = Math.min(this.data.petIndex, Math.max(pets.length - 1, 0));
    this.setData({ pets, petNames, petIndex });
    this._loadReminders(pets[petIndex]);
    app.loadPets({ force: false }).then((list) => {
      const next = list || [];
      this.setData({
        pets: next,
        petNames: next.map((p) => p.name || '宝贝'),
        petIndex: Math.min(this.data.petIndex, Math.max(next.length - 1, 0))
      });
      this._loadReminders(next[this.data.petIndex]);
    });
  },

  _loadReminders(pet) {
    if (!pet) {
      this.setData({ currentPet: null, items: [] });
      return;
    }
    // 若档案有驱虫日期且提醒未设置，自动带入
    const map = butler.getPetReminders(pet.id);
    if (pet.dewormDate && !map.deworm.lastDate) {
      butler.savePetReminder(pet.id, 'deworm', { lastDate: pet.dewormDate });
    }
    const fresh = butler.getPetReminders(pet.id);
    const items = Object.keys(fresh).map((k) => ({
      ...fresh[k],
      statusLabel: butler.statusLabel(fresh[k].status)
    }));
    this.setData({ currentPet: pet, items });
  },

  onPetChange(e) {
    const petIndex = Number(e.detail.value) || 0;
    this.setData({ petIndex });
    this._loadReminders(this.data.pets[petIndex]);
  },

  onDone(e) {
    const key = e.currentTarget.dataset.key;
    const pet = this.data.currentPet;
    if (!pet || !key) return;
    const item = (this.data.items || []).find((i) => i.key === key);
    const title = item && item.label ? item.label : '提醒';
    wx.showModal({
      title: '确认打卡',
      content: `将「${title}」标记为今天已完成？`,
      confirmText: '完成',
      success: (res) => {
        if (!res.confirm) return;
        butler.markReminderDone(pet.id, key);
        this._loadReminders(pet);
        wx.showToast({ title: '已打卡', icon: 'success' });
      }
    });
  },

  onEdit(e) {
    const key = e.currentTarget.dataset.key;
    const item = (this.data.items || []).find((i) => i.key === key);
    if (!item) return;
    this.setData({
      editingKey: key,
      editLastDate: item.lastDate || butler.todayStr(),
      editInterval: String(item.interval || '')
    });
  },

  onCloseEdit() {
    this.setData({ editingKey: '' });
  },

  onEditDate(e) {
    this.setData({ editLastDate: e.detail.value });
  },

  onEditInterval(e) {
    this.setData({ editInterval: e.detail.value });
  },

  onSaveEdit() {
    const pet = this.data.currentPet;
    const key = this.data.editingKey;
    if (!pet || !key) return;
    const interval = Number(this.data.editInterval);
    if (!(interval > 0)) {
      wx.showToast({ title: '请填写周期天数', icon: 'none' });
      return;
    }
    butler.savePetReminder(pet.id, key, {
      lastDate: this.data.editLastDate,
      interval
    });
    this.setData({ editingKey: '' });
    this._loadReminders(pet);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onGoAddPet() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  },

  onAskAi() {
    if (!guardOpenAiConsult()) return;
    wx.navigateTo({
      url: '/packageUser/user/pet-butler/ai-consult/ai-consult'
    });
  }
});
