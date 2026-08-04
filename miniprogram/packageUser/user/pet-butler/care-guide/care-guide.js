const butler = require('../../../../utils/petButler');

Page({
  data: {
    keyword: '',
    typeOptions: ['全部', '狗', '猫'],
    typeIndex: 0,
    list: [],
    detail: null
  },

  onLoad() {
    this._search();
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
    this.setData({ detail });
  },

  onBackList() {
    this.setData({ detail: null });
  },

  onAskAi() {
    const kw = String(this.data.keyword || '').trim();
    const q = encodeURIComponent(kw ? `${kw} 怎么养护比较好？` : '常见犬猫日常养护要注意什么？');
    wx.navigateTo({ url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}` });
  },

  onAskAiDetail() {
    const name = (this.data.detail && this.data.detail.name) || '宠物';
    const q = encodeURIComponent(`${name} 日常护理和饮食要注意什么？`);
    wx.navigateTo({ url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}` });
  }
});
