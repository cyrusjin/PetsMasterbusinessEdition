const app = getApp();
const { categories, articles, filterArticles } = require('./content');
const { hideHomeButton } = require('../../../utils/navBar');
const { ensureMerchantPageAllowed, redirectToStoreAuthIfNeeded } = require('../../../utils/shell');
const { openProxyGuestPicker } = require('../../../utils/proxyOrder');
const destinations = {
  record: '/packageBiz/service-record/service-record',
  invite: '/packageBiz/share-guest/share-guest',
  orders: '/packageBiz/orders/orders',
  daily: '/packageBiz/daily-check/daily-check',
  stats: '/pages/merchant/tab-statistics/tab-statistics',
  ledger: '/packageExtra/ledger/ledger'
};
Page({
  data: { categories, category: 'all', keyword: '', items: articles, expandedId: '', ready: false },
  onShow() {
    hideHomeButton();
    ensureMerchantPageAllowed().then(blocked => {
      if (blocked) return;
      if (app.isUserClientMode && app.isUserClientMode()) {
        wx.switchTab({ url: '/pages/index/index' });
        return;
      }
      if (redirectToStoreAuthIfNeeded()) return;
      this.setData({ ready: true });
    }).catch(() => wx.showToast({ title: '加载失败，请重新进入', icon: 'none' }));
  },
  onSearch(e) {
    const keyword = e.detail.value || '';
    this.setData({ keyword, items: filterArticles(this.data.category, keyword), expandedId: '' });
  },
  onCategory(e) {
    const category = e.currentTarget.dataset.id;
    if (!categories.some(item => item.id === category)) return;
    this.setData({ category, items: filterArticles(category, this.data.keyword), expandedId: '' });
  },
  onClear() { this.setData({ keyword: '', category: 'all', items: articles, expandedId: '' }); },
  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },
  onAction(e) {
    if (!this.data.ready) return;
    const action = e.currentTarget.dataset.action;
    if (action === 'proxy') { openProxyGuestPicker(); return; }
    const url = destinations[action];
    if (!url) return;
    const fail = () => wx.showToast({ title: '暂时无法打开，请重试', icon: 'none' });
    if (url.startsWith('/pages/merchant/')) wx.redirectTo({ url, fail });
    else wx.navigateTo({ url, fail });
  },
  onFeedback() {
    const contact = this.selectComponent('#guideContact');
    if (contact) contact.open();
  }
});
