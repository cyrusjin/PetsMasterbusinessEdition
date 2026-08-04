const app = getApp();
const butler = require('../../../utils/petButler');

Page({
  data: {
    pets: [],
    tools: butler.getTools(),
    upcoming: [],
    walkStreak: 0,
    tip: ''
  },

  onShow() {
    const cached = app.getPets() || [];
    this._applyPets(cached);
    app.loadPets({ force: false }).then((pets) => this._applyPets(pets || []));
  },

  _applyPets(pets) {
    const list = Array.isArray(pets) ? pets : [];
    const upcoming = butler.collectUpcoming(list, 14).slice(0, 5);
    let walkStreak = 0;
    list.forEach((p) => {
      const w = butler.getWalks(p.id);
      if (w.streak > walkStreak) walkStreak = w.streak;
    });
    const tips = [
      '有不适症状？先问问 AI 问诊',
      '驱虫别忘了，体内外都要顾到',
      '遛弯时记得带水，尤其是夏天',
      '零食再香，也只占每日热量的一成',
      '做饭前打开「能不能吃」，更安心'
    ];
    const tip = tips[new Date().getDate() % tips.length];
    this.setData({ pets: list, upcoming, walkStreak, tip });
  },

  onOpenTool(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    wx.navigateTo({ url: path });
  },

  onOpenAi() {
    wx.navigateTo({ url: '/packageUser/user/pet-butler/ai-consult/ai-consult' });
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/packageUser/user/pet-butler/reminders/reminders' });
  },

  onGoPets() {
    wx.navigateTo({ url: '/packageUser/user/pets/pets' });
  },

  onAddPet() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  }
});
