const app = getApp();
const butler = require('../../../utils/petButler');
const { formatAgeText } = require('../../../utils/petAge');
const {
  fetchMerchantSwitchEnabled,
  applyMerchantSwitchToApp,
  isAiConsultVisible
} = require('../../../utils/merchantSwitch');

Page({
  data: {
    pets: [],
    tools: [],
    upcoming: [],
    walkStreak: 0,
    tip: '',
    auditMode: true,
    showAiConsult: false,
    showAiBadge: false,
    aiBadgeText: '',
    aiEntryTitle: '',
    aiEntryGenTag: '',
    aiEntrySub: ''
  },

  onShow() {
    this._syncAuditMode();
    const cached = app.getPets() || [];
    this._applyPets(cached);
    app.loadPets({ force: false }).then((pets) => this._applyPets(pets || []));
  },

  _aiCopy(enabled) {
    if (!enabled) {
      return {
        showAiConsult: false,
        showAiBadge: false,
        aiBadgeText: '',
        aiEntryTitle: '',
        aiEntryGenTag: '',
        aiEntrySub: '',
        navTitle: '宠物管家'
      };
    }
    return {
      showAiConsult: true,
      showAiBadge: true,
      aiBadgeText: 'AI',
      aiEntryTitle: 'AI 问诊',
      aiEntryGenTag: '人工智能生成',
      aiEntrySub: '描述症状，获取养护建议（内容由 AI 生成）',
      navTitle: 'AI 宠物管家'
    };
  },

  _syncAuditMode() {
    const apply = (enabled) => {
      applyMerchantSwitchToApp(app, enabled);
      const copy = this._aiCopy(!!enabled);
      wx.setNavigationBarTitle({ title: copy.navTitle });
      this.setData({
        auditMode: !copy.showAiConsult,
        showAiConsult: copy.showAiConsult,
        showAiBadge: copy.showAiBadge,
        aiBadgeText: copy.aiBadgeText,
        aiEntryTitle: copy.aiEntryTitle,
        aiEntryGenTag: copy.aiEntryGenTag,
        aiEntrySub: copy.aiEntrySub,
        tools: butler.getTools({ includeAi: copy.showAiConsult })
      });
    };

    // 未确认前按审核态展示，避免首屏闪出 AI 文案
    apply(false);
    // 开关读取遵循统一缓存策略，避免每次进入管家都阻塞首屏。
    fetchMerchantSwitchEnabled({ force: false }).then((enabled) => {
      apply(enabled);
      this._applyPets(this.data.pets || app.getPets() || []);
    });
  },

  _applyPets(pets) {
    const list = (Array.isArray(pets) ? pets : []).map((pet) => ({
      ...pet,
      ageText: formatAgeText(pet) || (pet.age != null ? `${pet.age}岁` : '?')
    }));
    const upcoming = butler.collectUpcoming(list, 14).slice(0, 5);
    let walkStreak = 0;
    list.forEach((p) => {
      const w = butler.getWalks(p.id);
      if (w.streak > walkStreak) walkStreak = w.streak;
    });
    const showAi = isAiConsultVisible(app);
    const tips = showAi
      ? [
          '有不适症状？先问问 AI 问诊',
          '驱虫别忘了，体内外都要顾到',
          '遛弯时记得带水，尤其是夏天',
          '零食再香，也只占每日热量的一成',
          '做饭前打开「能不能吃」，更安心'
        ]
      : [
          '驱虫别忘了，体内外都要顾到',
          '遛弯时记得带水，尤其是夏天',
          '零食再香，也只占每日热量的一成',
          '做饭前打开「能不能吃」，更安心',
          '定期洗澡剪甲，毛孩子更舒适'
        ];
    const tip = tips[new Date().getDate() % tips.length];
    const copy = this._aiCopy(showAi);
    this.setData({
      pets: list,
      upcoming,
      walkStreak,
      tip,
      tools: butler.getTools({ includeAi: showAi }),
      showAiConsult: copy.showAiConsult,
      showAiBadge: copy.showAiBadge,
      aiBadgeText: copy.aiBadgeText,
      aiEntryTitle: copy.aiEntryTitle,
      aiEntryGenTag: copy.aiEntryGenTag,
      aiEntrySub: copy.aiEntrySub,
      auditMode: !showAi
    });
  },

  onOpenTool(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    if (!isAiConsultVisible(app) && String(path).indexOf('ai-consult') !== -1) {
      wx.showToast({ title: '功能暂未开放', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: path });
  },

  onOpenAi() {
    if (!isAiConsultVisible(app)) {
      wx.showToast({ title: '功能暂未开放', icon: 'none' });
      return;
    }
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
