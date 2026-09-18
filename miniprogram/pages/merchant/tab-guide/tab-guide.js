const app = getApp();
const { categories, filterArticles, groupArticles } = require('./content');
const { hideHomeButton } = require('../../../utils/navBar');
const { ensureMerchantPageAllowed, redirectToStoreAuthIfNeeded, redirectToUserIfClientMode } = require('../../../utils/shell');
const { openProxyGuestPicker } = require('../../../utils/proxyOrder');
const merchantDemo = require('../../../utils/merchantDemo');
const destinations = {
  record: '/packageBiz/service-record/service-record',
  invite: '/packageBiz/share-guest/share-guest',
  orders: '/packageBiz/orders/orders',
  daily: '/packageBiz/daily-check/daily-check',
  dailyLogs: '/packageBiz/daily-logs/daily-logs',
  pickup: '/packageBiz/pickup-manage/pickup-manage',
  customers: '/packageExtra/customers/customers',
  stats: '/pages/merchant/tab-statistics/tab-statistics',
  ledger: '/packageExtra/ledger/ledger',
  store: '/pages/merchant/tab-store/tab-store',
  storeBoarding: '/pages/merchant/tab-store/tab-store?tab=boarding',
  storeBoardingAdvanced: '/pages/merchant/tab-store/tab-store?tab=boarding&sub=advanced',
  storeWash: '/pages/merchant/tab-store/tab-store?tab=wash',
  storeHome: '/pages/merchant/tab-store/tab-store?tab=homeFeeding',
  staff: '/packageExtra/staff-manage/staff-manage',
  membership: '/packageExtra/membership/membership',
  insurance: '/packageBiz/insurance-promotion/insurance-promotion',
  holiday: '/packageBiz/holiday-pricing/holiday-pricing?serviceLine=boarding',
  announcements: '/packageExtra/announcements/announcements',
  promotion: '/packageExtra/promotion-tasks/promotion-tasks',
  dailyHome: '/pages/merchant/tab-daily/tab-daily'
};
function buildView(category, keyword, extra) {
  const items = filterArticles(category, keyword);
  return Object.assign({
    category,
    keyword,
    groups: groupArticles(items)
  }, extra || {});
}
Page({
  data: Object.assign({ categories, expandedId: '', ready: false }, buildView('all', '')),
  onShow() {
    hideHomeButton();
    ensureMerchantPageAllowed().then(blocked => {
      if (blocked) return;
      if (redirectToUserIfClientMode()) {
        return;
      }
      if (redirectToStoreAuthIfNeeded()) return;
      this.setData({ ready: true });
    }).catch(() => wx.showToast({ title: '加载失败，请重新进入', icon: 'none' }));
  },
  onSearch(e) {
    const keyword = e.detail.value || '';
    this.setData(buildView(this.data.category, keyword, { expandedId: '' }));
  },
  onCategory(e) {
    const category = e.currentTarget.dataset.id;
    if (!categories.some(item => item.id === category)) return;
    this.setData(buildView(category, this.data.keyword, { expandedId: '' }));
  },
  onClear() { this.setData(buildView('all', '', { expandedId: '' })); },
  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },
  onAction(e) {
    if (!this.data.ready) return;
    const action = e.currentTarget.dataset.action;
    const demo = !!(app.isMerchantDemoMode && app.isMerchantDemoMode());
    if (demo && (action === 'proxy' || action === 'invite' || action === 'record')) {
      merchantDemo.promptDemoGuestBlocked();
      return;
    }
    if (demo && action === 'insurance') {
      merchantDemo.promptDemoInsuranceBlocked();
      return;
    }
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
