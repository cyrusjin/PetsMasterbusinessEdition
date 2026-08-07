const butler = require('../../../../utils/petButler');
const { syncAiConsultFlag, guardOpenAiConsult } = require('../../../../utils/merchantSwitch');

const HOT = [
  '巧克力', '葡萄', '洋葱', '大蒜', '牛奶', '鸡胸肉', '骨头', '苹果',
  '香蕉', '西瓜', '虾', '火腿肠', '牛油果', '百合', '南瓜', '蓝莓'
];

function withLabels(list) {
  return (list || []).map((item) => ({
    ...item,
    levelLabel: item.level === 'danger' ? '禁止' : item.level === 'caution' ? '谨慎' : '可以'
  }));
}

Page({
  data: {
    keyword: '',
    results: [],
    hot: HOT,
    autoFocus: false,
    browsed: withLabels(butler.FOOD_DB.slice(0, 18)),
    showAiConsult: false,
    heroSub: '做饭前查一下更安心',
    askAiText: ''
  },

  _applyAiCopy(visible) {
    this.setData(
      visible
        ? {
            showAiConsult: true,
            heroSub: 'AI 速查 · 做饭前查一下更安心',
            askAiText: '去 AI 问诊问问 ›'
          }
        : {
            showAiConsult: false,
            heroSub: '做饭前查一下更安心',
            askAiText: ''
          }
    );
  },

  onLoad(query) {
    syncAiConsultFlag(this).then((v) => this._applyAiCopy(v));
    const keyword = query && query.q ? decodeURIComponent(query.q) : '';
    if (keyword) {
      this.setData({ keyword, results: withLabels(butler.checkFood(keyword)) });
    } else {
      this.setData({ autoFocus: true });
    }
  },

  onShow() {
    syncAiConsultFlag(this).then((v) => this._applyAiCopy(v));
  },

  onInput(e) {
    const keyword = e.detail.value;
    this.setData({
      keyword,
      results: keyword ? withLabels(butler.checkFood(keyword)) : []
    });
  },

  onSearch() {
    const keyword = String(this.data.keyword || '').trim();
    if (!keyword) {
      wx.showToast({ title: '请输入食物名', icon: 'none' });
      return;
    }
    this.setData({ keyword, results: withLabels(butler.checkFood(keyword)) });
  },

  onHot(e) {
    const keyword = e.currentTarget.dataset.name;
    this.setData({ keyword, results: withLabels(butler.checkFood(keyword)) });
  },

  onClear() {
    this.setData({ keyword: '', results: [] });
  },

  onAskAi() {
    if (!guardOpenAiConsult()) return;
    const keyword = String(this.data.keyword || '').trim();
    const q = encodeURIComponent(keyword ? `「${keyword}」能给宠物吃吗？` : '哪些人类食物宠物不能吃？');
    wx.navigateTo({
      url: `/packageUser/user/pet-butler/ai-consult/ai-consult?q=${q}`
    });
  }
});
