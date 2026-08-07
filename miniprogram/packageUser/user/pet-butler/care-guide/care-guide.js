const butler = require('../../../../utils/petButler');
const { syncAiConsultFlag, guardOpenAiConsult } = require('../../../../utils/merchantSwitch');

Page({
  data: {
    keyword: '',
    typeOptions: ['全部', '狗', '猫', '小宠'],
    typeIndex: 0,
    list: [],
    detail: null,
    showAiConsult: false,
    emptyAiText: '',
    bannerSub: '',
    detailBannerSub: ''
  },

  _applyAiCopy(visible) {
    const detailName = (this.data.detail && this.data.detail.name) || '';
    this.setData(
      visible
        ? {
            showAiConsult: true,
            emptyAiText: '没有匹配的品种，试试「通用」或去 AI 问诊',
            bannerSub: '让 AI 助手按你的描述给养护建议 ›',
            detailBannerSub: detailName ? `关于「${detailName}」继续问 AI ›` : '继续问 AI ›'
          }
        : {
            showAiConsult: false,
            emptyAiText: '',
            bannerSub: '',
            detailBannerSub: ''
          }
    );
  },

  onLoad() {
    syncAiConsultFlag(this).then((v) => this._applyAiCopy(v));
    this._search();
  },

  onShow() {
    syncAiConsultFlag(this).then((v) => this._applyAiCopy(v));
  },

  _search() {
    const type = this.data.typeOptions[this.data.typeIndex];
    const list = butler.searchCareGuides(this.data.keyword, type);
    this.setData({ list, detail: null });
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value }, () => this._search());
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) || 0 }, () => this._search());
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    const detail = butler.getCareGuide(id);
    this.setData({ detail }, () => {
      if (this.data.showAiConsult) this._applyAiCopy(true);
    });
  },

  onBackList() {
    this.setData({ detail: null });
  },

  onAskAi() {
    if (!guardOpenAiConsult()) return;
    const kw = String(this.data.keyword || '').trim();
    const q = encodeURIComponent(kw ? `${kw} 怎么养护比较好？` : '常见犬猫和小宠日常养护要注意什么？');
    wx.navigateTo({ url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}` });
  },

  onAskAiDetail() {
    if (!guardOpenAiConsult()) return;
    const name = (this.data.detail && this.data.detail.name) || '宠物';
    const q = encodeURIComponent(`${name} 日常护理和饮食要注意什么？`);
    wx.navigateTo({ url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}` });
  }
});
