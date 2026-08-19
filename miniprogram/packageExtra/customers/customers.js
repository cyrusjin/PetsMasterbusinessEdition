const app = getApp();
const { buildCustomersFromOrders, filterCustomers, findCustomerById } = require('../utils/customers');
const { refreshMerchantOrders } = require('../../utils/orderRefresh');
const { redirectToStoreAuthIfNeeded, redirectToUserIfMerchantUiBlocked } = require('../../utils/shell');
const { listGuestShareCards } = require('../../utils/storeShare');
const {
  startProxySessionFromCustomer,
  openProxyReserve,
  openProxyPetForm,
  buildUnassignedGuest,
  UNASSIGNED_GUEST_ID
} = require('../../utils/proxyOrder');

function mapGuestRows(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const petNames = ((item && item.pets) || []).map((pet) => pet && pet.name).filter(Boolean);
    return {
      ...item,
      petNamesText: petNames.length ? petNames.join('、') : '暂无宠物档案'
    };
  });
}

Page({
  data: {
    isProxy: false,
    loading: true,
    keyword: '',
    allCustomers: [],
    customers: [],
    allGuests: [],
    guests: [],
    unassignedGuest: null,
    servicePickerVisible: false,
    serviceCards: []
  },

  onLoad(options) {
    const isProxy = String((options && options.mode) || '') === 'proxy';
    this._isProxy = isProxy;
    this._continueOrder = String((options && options.continueOrder) || '') === '1';
    this.setData({ isProxy });
    wx.setNavigationBarTitle({
      title: isProxy ? '代客人下单' : '客户管理'
    });
  },

  onShow() {
    if (this._isProxy && redirectToUserIfMerchantUiBlocked()) return;
    if (redirectToStoreAuthIfNeeded()) return;
    if (this._isProxy) {
      this._loadGuests({
        force: false,
        showLoading: !this.data.allGuests.length && !this.data.unassignedGuest
      }).then(() => {
        if (!this._continueOrder) return;
        this._continueOrder = false;
        const unassigned = this.data.unassignedGuest;
        if (unassigned) startProxySessionFromCustomer(unassigned);
        this._pickServiceThen((serviceLine) => {
          openProxyReserve(serviceLine, { clearDrafts: false, keepSession: true });
        });
      });
      return;
    }
    this._loadCustomers({ force: false, showLoading: !this.data.allCustomers.length });
  },

  onPullDownRefresh() {
    const loader = this._isProxy
      ? this._loadGuests({ force: true, showLoading: false })
      : this._loadCustomers({ force: true, showLoading: false });
    loader.finally(() => wx.stopPullDownRefresh());
  },

  _applyFilter(allCustomers, keyword) {
    const list = Array.isArray(allCustomers) ? allCustomers : [];
    const kw = keyword == null ? this.data.keyword : keyword;
    this.setData({
      allCustomers: list,
      customers: filterCustomers(list, kw)
    });
  },

  _applyGuestFilter(assignedGuests, keyword) {
    const assigned = mapGuestRows(assignedGuests);
    const unassignedRaw = buildUnassignedGuest();
    const unassigned = unassignedRaw ? mapGuestRows([unassignedRaw])[0] : null;
    const kw = keyword == null ? this.data.keyword : keyword;
    const matchedUnassigned = unassigned && filterCustomers([unassigned], kw).length
      ? unassigned
      : null;
    this.setData({
      allGuests: assigned,
      guests: filterCustomers(assigned, kw),
      unassignedGuest: matchedUnassigned
    });
  },

  _loadCustomers({ force, showLoading } = {}) {
    if (showLoading) {
      this.setData({ loading: true });
    }
    return refreshMerchantOrders(app, { force })
      .then(() => {
        if (!app.canAccessMerchantBackend() && !app.isMerchantDemoMode()) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return;
        }
        this._applyFilter(buildCustomersFromOrders(app.getOrders()));
      })
      .catch((err) => {
        console.error('[客户管理] 加载失败', err);
        if (app.getOrders().length) {
          this._applyFilter(buildCustomersFromOrders(app.getOrders()));
        } else {
          wx.showToast({
            title: (err && err.message) || '加载失败',
            icon: 'none'
          });
        }
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  _loadGuests({ force, showLoading } = {}) {
    if (showLoading) this.setData({ loading: true });
    return refreshMerchantOrders(app, { force })
      .then(() => {
        if (!app.canAccessMerchantBackend() && !app.isMerchantDemoMode()) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return;
        }
        this._applyGuestFilter(buildCustomersFromOrders(app.getOrders()));
      })
      .catch((err) => {
        console.error('[代客人下单] 加载客人失败', err);
        if (app.getOrders().length) {
          this._applyGuestFilter(buildCustomersFromOrders(app.getOrders()));
        } else {
          this._applyGuestFilter([]);
        }
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  _listServiceCards() {
    const shop = (app.getShop && app.getShop()) || {};
    return listGuestShareCards(shop);
  },

  _pickServiceThen(onPicked) {
    const cards = this._listServiceCards();
    if (!cards.length) {
      wx.showToast({ title: '请先在门店设置中开通服务', icon: 'none' });
      return;
    }
    if (cards.length === 1) {
      onPicked(cards[0].key);
      return;
    }
    this._afterPickService = onPicked;
    this.setData({
      servicePickerVisible: true,
      serviceCards: cards
    });
  },

  onSearchInput(e) {
    const keyword = (e.detail && e.detail.value) || '';
    this.setData({ keyword });
    if (this._isProxy) this._applyGuestFilter(this.data.allGuests, keyword);
    else this._applyFilter(this.data.allCustomers, keyword);
  },

  onSearchConfirm(e) {
    const keyword = (e.detail && e.detail.value) || this.data.keyword || '';
    this.setData({ keyword });
    if (this._isProxy) this._applyGuestFilter(this.data.allGuests, keyword);
    else this._applyFilter(this.data.allCustomers, keyword);
  },

  onClearSearch() {
    this.setData({ keyword: '' });
    if (this._isProxy) this._applyGuestFilter(this.data.allGuests, '');
    else this._applyFilter(this.data.allCustomers, '');
  },

  onOpenDetail(e) {
    if (this._isProxy) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/packageExtra/customer-detail/customer-detail?id=${encodeURIComponent(id)}`
    });
  },

  onOrder(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    const customer = id === UNASSIGNED_GUEST_ID
      ? this.data.unassignedGuest
      : (findCustomerById(app.getOrders(), id)
        || (this.data.allGuests || []).find((item) => item && item.id === id));
    if (!customer) {
      wx.showToast({ title: '未找到该客人', icon: 'none' });
      return;
    }
    startProxySessionFromCustomer(customer);
    this._pickServiceThen((serviceLine) => {
      openProxyReserve(serviceLine, { clearDrafts: false, keepSession: true });
    });
  },

  onAddPet() {
    openProxyPetForm('', { next: 'list', pool: 'unassigned' });
  },

  onPickService(e) {
    const serviceLine = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.serviceLine
      : '';
    this.setData({ servicePickerVisible: false, serviceCards: [] });
    const onPicked = this._afterPickService;
    this._afterPickService = null;
    if (typeof onPicked === 'function') onPicked(serviceLine);
  },

  onCloseServicePicker() {
    this.setData({ servicePickerVisible: false, serviceCards: [] });
    this._afterPickService = null;
  },

  onServicePickerTouchMove() {}
});
