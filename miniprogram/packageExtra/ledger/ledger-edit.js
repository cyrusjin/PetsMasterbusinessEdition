const app = getApp();
const ledgerApi = require('../../utils/ledger');
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');

Page({
  data: {
    id: '',
    isEdit: false,
    saving: false,
    type: 'expense',
    typeOptions: [
      { key: 'expense', label: '支出' },
      { key: 'income', label: '额外收入' }
    ],
    categories: [],
    categoryIndex: 0,
    categoryKey: '',
    amount: '',
    date: '',
    note: '',
    isDemoMode: false
  },

  onLoad(options) {
    if (redirectToStoreAuthIfNeeded()) return;
    const id = options && options.id ? decodeURIComponent(options.id) : '';
    const type = options && options.type === 'income' ? 'income' : 'expense';
    const isDemoMode = !!(app.isMerchantDemoMode && app.isMerchantDemoMode());
    this.setData({ isDemoMode });

    if (id) {
      this._loadEntry(id);
      return;
    }

    this._applyType(type, true);
    this.setData({
      id: '',
      isEdit: false,
      date: ledgerApi.todayYmd(),
      amount: '',
      note: ''
    });
    wx.setNavigationBarTitle({ title: type === 'income' ? '记额外收入' : '记支出' });
  },

  _loadEntry(id) {
    const isDemo = !!(app.isMerchantDemoMode && app.isMerchantDemoMode());
    const findLocal = () => ledgerApi.getLocalEntries(isDemo).find((item) => item.id === id);

    const apply = (entry) => {
      if (!entry) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const categories = ledgerApi.categoriesForType(entry.type);
      let categoryIndex = categories.findIndex((c) => c.key === entry.category);
      if (categoryIndex < 0) categoryIndex = 0;
      this.setData({
        id: entry.id,
        isEdit: true,
        type: entry.type,
        categories,
        categoryIndex,
        categoryKey: categories[categoryIndex] ? categories[categoryIndex].key : '',
        amount: ledgerApi.formatAmount(entry.amount),
        date: entry.date || ledgerApi.todayYmd(),
        note: entry.note || ''
      });
      wx.setNavigationBarTitle({
        title: entry.type === 'income' ? '编辑额外收入' : '编辑支出'
      });
    };

    const cached = findLocal();
    if (cached) {
      apply(cached);
      return;
    }

    ledgerApi.fetchLedgerEntries(app, { force: true })
      .then(() => apply(findLocal()))
      .catch(() => apply(null));
  },

  _applyType(type, resetCategory) {
    const categories = ledgerApi.categoriesForType(type);
    const categoryIndex = resetCategory ? 0 : Math.min(this.data.categoryIndex, categories.length - 1);
    this.setData({
      type,
      categories,
      categoryIndex,
      categoryKey: categories[categoryIndex] ? categories[categoryIndex].key : ''
    });
  },

  onTypeTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.type) return;
    this._applyType(key, true);
  },

  onCategoryChange(e) {
    const index = Number(e.detail.value) || 0;
    const item = this.data.categories[index];
    this.setData({
      categoryIndex: index,
      categoryKey: item ? item.key : ''
    });
  },

  onAmountInput(e) {
    this.setData({ amount: (e.detail && e.detail.value) || '' });
  },

  onDateChange(e) {
    this.setData({ date: (e.detail && e.detail.value) || ledgerApi.todayYmd() });
  },

  onNoteInput(e) {
    this.setData({ note: (e.detail && e.detail.value) || '' });
  },

  onSave() {
    if (this.data.saving) return;
    const amount = Number(this.data.amount);
    if (!(amount > 0)) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (!this.data.categoryKey) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }

    const payload = {
      type: this.data.type,
      category: this.data.categoryKey,
      amount,
      date: this.data.date || ledgerApi.todayYmd(),
      note: this.data.note
    };

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });

    const task = this.data.isEdit
      ? ledgerApi.editEntry(app, this.data.id, payload)
      : ledgerApi.createEntry(app, payload);

    task
      .then(() => {
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({ saving: false });
        wx.hideLoading();
      });
  }
});
