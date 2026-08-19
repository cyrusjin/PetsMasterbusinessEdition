const app = getApp();
const { copyText } = require('../../utils/clipboard');
const badgeUtil = require('../../utils/badge');
const { formatDate } = require('../../utils/util');
const { buildOrderListPetMeta } = require('../../utils/petSnapshot');
const { canMerchantModifyOrder } = require('../utils/orderActions');
const merchantDemo = require('../../utils/merchantDemo');
const { refreshMerchantOrders, startMerchantOrdersPoll, stopMerchantOrdersPoll } = require('../../utils/orderRefresh');
const { redirectToStoreAuthIfNeeded } = require('../../utils/shell');
const { buildPendingEditLines, getPendingEditTotalFee } = require('../utils/pendingEdit');
const { formatHomeVisitTimeText } = require('../../utils/homeVisitAddress');
const { normalizeServiceLines, SERVICE_LINE_DEFS } = require('../../utils/serviceLines');
const {
  isDailyCheckableOrder,
  formatServiceStatus,
  getAcceptServiceCopy,
  getStartServiceCopy,
  getCompleteServiceCopy,
  getOrderServiceKind,
  getOrderServiceLabel
} = require('../../utils/dailyCheckable');

const LIST_PAGE_SIZE = 30;

function buildServiceFilterState(shop) {
  const lines = normalizeServiceLines(shop && shop.serviceLines);
  const enabledTabs = SERVICE_LINE_DEFS
    .filter((def) => lines[def.key])
    .map((def) => ({ key: def.key, label: def.name }));
  if (enabledTabs.length <= 1) {
    return { showServiceTabs: false, serviceTabs: [] };
  }
  return {
    showServiceTabs: true,
    serviceTabs: [{ key: 'all', label: '全部' }].concat(enabledTabs)
  };
}

function filterOrdersByTab(orders, tab) {
  if (tab === 'pending') return orders.filter((o) => o.status === 'pending');
  if (tab === 'awaiting_arrival') return orders.filter((o) => o.status === 'awaiting_arrival');
  if (tab === 'boarding') return orders.filter((o) => o.status === 'boarding');
  if (tab === 'completed') {
    return orders.filter((o) => o.status === 'completed' || o.status === 'cancelled');
  }
  return orders;
}

function getWeekRange(refDate = new Date()) {
  const day = refDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + mondayOffset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: formatDate(start), end: formatDate(end) };
}

function getMonthRange(refDate = new Date()) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  return { start: formatDate(start), end: formatDate(end) };
}

function orderOverlapsDateRange(order, start, end) {
  if (!start && !end) return true;
  const orderStart = String((order && order.startDate) || '').trim();
  const orderEnd = String((order && order.endDate) || orderStart).trim();
  if (!orderStart && !orderEnd) return false;
  if (start && orderEnd && orderEnd < start) return false;
  if (end && orderStart && orderStart > end) return false;
  return true;
}

function getServiceTimeLabel(kind) {
  if (kind === 'wash') return '到店';
  if (kind === 'homeFeeding') return '上门';
  return '寄养';
}

function formatOrderServiceTime(order, kind) {
  if (kind === 'homeFeeding') {
    return formatHomeVisitTimeText(order) || '--';
  }
  if (kind === 'wash') {
    return `${order.startDate || ''} ${order.startTime || ''}`.trim() || '--';
  }
  const start = [order.startDate, order.startTime].filter(Boolean).join(' ');
  const end = [order.endDate, order.endTime].filter(Boolean).join(' ');
  if (start && end) return `${start} ~ ${end}`;
  return start || end || '--';
}

function filterMerchantOrders(orders, { tab, serviceTab, filterStartDate, filterEndDate }) {
  let list = filterOrdersByTab(orders, tab);
  if (serviceTab && serviceTab !== 'all') {
    list = list.filter((order) => getOrderServiceKind(order) === serviceTab);
  }
  if (filterStartDate || filterEndDate) {
    list = list.filter((order) => orderOverlapsDateRange(order, filterStartDate, filterEndDate));
  }
  return list;
}

Page({
  data: {
    tab: 'all',
    serviceTab: 'all',
    serviceTabs: [],
    showServiceTabs: false,
    datePreset: '',
    filterStartDate: '',
    filterEndDate: '',
    todayDate: formatDate(new Date()),
    orders: [],
    filtered: [],
    hasMore: false,
    loading: true,
    loadError: '',
    pendingBadge: 0,
    refreshing: false
  },

  onLoad(options) {
    const extra = {
      todayDate: formatDate(new Date()),
      ...this._resolveServiceFilterState()
    };
    const tab = (options && options.tab) ? String(options.tab).trim() : '';
    if (tab) extra.tab = tab;
    const serviceLine = String((options && (options.serviceLine || options.serviceKind)) || '').trim();
    if (extra.showServiceTabs && extra.serviceTabs.some((item) => item.key === serviceLine)) {
      extra.serviceTab = serviceLine;
    } else {
      extra.serviceTab = 'all';
    }
    this.setData(extra);
  },

  onShow() {
    if (redirectToStoreAuthIfNeeded()) return;
    if (app.isMerchantApproved()) {
      if (app.getOrders().length) {
        this.load();
      }
    }
    this._refreshOrders({ force: false, showLoading: !this.data.orders.length });
    startMerchantOrdersPoll(this, () => this._refreshOrders({ force: false, showLoading: false }));
  },

  onHide() {
    stopMerchantOrdersPoll(this);
  },

  onUnload() {
    stopMerchantOrdersPoll(this);
  },

  onPullDownRefresh() {
    this._refreshOrders({ force: true, showLoading: false })
      .finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    const all = this._allFiltered || [];
    const limit = this._listLimit || LIST_PAGE_SIZE;
    if (limit >= all.length) return;
    this._listLimit = limit + LIST_PAGE_SIZE;
    this._publishFilteredWindow();
  },

  _refreshOrders({ force, showLoading } = {}) {
    if (showLoading) {
      this.setData({ loading: true, loadError: '' });
    } else if (force) {
      this.setData({ refreshing: true });
    }

    return refreshMerchantOrders(app, { force })
      .then(() => {
        if (!app.canAccessMerchantBackend()) {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          return;
        }
        const shop = app.getShop();
        if (!app.isMerchantDemoMode() && (!shop || !shop.store_id)) {
          this.setData({
            loading: false,
            refreshing: false,
            loadError: '请先保存店铺设置后再查看订单'
          });
          return;
        }
        this.load();
      })
      .catch((err) => {
        console.error('[商家订单] 加载失败', err);
        if (app.canAccessMerchantBackend() && app.getOrders().length) {
          this.load();
        }
        this.setData({
          loadError: (err && err.message) || '订单加载失败，请稍后重试'
        });
      })
      .finally(() => {
        this.setData({ loading: false, refreshing: false });
      });
  },

  _publishFilteredWindow(extra = {}) {
    const all = this._allFiltered || [];
    const limit = this._listLimit || LIST_PAGE_SIZE;
    this.setData({
      ...extra,
      filtered: all.slice(0, limit),
      hasMore: all.length > limit
    });
  },

  _resolveServiceFilterState() {
    const shop = (typeof app.getShop === 'function' && app.getShop()) || {};
    const state = buildServiceFilterState(shop);
    const allowed = (state.serviceTabs || []).map((item) => item.key);
    const serviceTab = state.showServiceTabs && allowed.indexOf(this.data.serviceTab) >= 0
      ? this.data.serviceTab
      : 'all';
    return {
      ...state,
      serviceTab
    };
  },

  load() {
    const orders = app.getOrders()
      .sort((a, b) => {
        const aPend = a.editPendingConfirm ? 1 : 0;
        const bPend = b.editPendingConfirm ? 1 : 0;
        if (aPend !== bPend) return bPend - aPend;
        return (b.createTime || 0) - (a.createTime || 0);
      })
      .map((order) => {
        const serviceKind = getOrderServiceKind(order);
        return {
          ...order,
          ...buildOrderListPetMeta(order),
          pendingEditLines: order.editPendingConfirm ? buildPendingEditLines(order) : [],
          pendingEditTotalFee: order.editPendingConfirm ? getPendingEditTotalFee(order) : null,
          statusLabel: formatServiceStatus(order),
          startActionLabel: getStartServiceCopy(order).button,
          completeActionLabel: getCompleteServiceCopy(order).button,
          canDailyCheck: isDailyCheckableOrder(order),
          serviceKind,
          serviceLabel: getOrderServiceLabel(serviceKind),
          serviceTimeLabel: getServiceTimeLabel(serviceKind),
          serviceTimeText: formatOrderServiceTime(order, serviceKind)
        };
      });
    const serviceFilter = this._resolveServiceFilterState();
    this.setData(serviceFilter);
    this._allFiltered = this._applyFilters(orders);
    this._listLimit = LIST_PAGE_SIZE;
    badgeUtil.countMerchantNewOrders(orders);
    badgeUtil.markMerchantOrdersSeen();
    this._publishFilteredWindow({
      orders,
      pendingBadge: 0,
      loading: false,
      loadError: ''
    });
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
    this.filter();
  },

  onServiceTab(e) {
    const serviceTab = e.currentTarget.dataset.tab;
    if (!serviceTab || serviceTab === this.data.serviceTab) return;
    this.setData({ serviceTab });
    this.filter();
  },

  onDatePreset(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    if (this.data.datePreset === key) {
      this.setData({ datePreset: '', filterStartDate: '', filterEndDate: '' });
      this.filter();
      return;
    }
    let range = { start: '', end: '' };
    if (key === 'today') {
      const today = formatDate(new Date());
      range = { start: today, end: today };
    } else if (key === 'week') {
      range = getWeekRange();
    } else if (key === 'month') {
      range = getMonthRange();
    }
    this.setData({
      datePreset: key,
      filterStartDate: range.start,
      filterEndDate: range.end,
      todayDate: formatDate(new Date())
    });
    this.filter();
  },

  onFilterStartDate(e) {
    const value = String((e.detail && e.detail.value) || '').trim();
    const extra = { datePreset: 'custom', filterStartDate: value };
    if (this.data.filterEndDate && value && value > this.data.filterEndDate) {
      extra.filterEndDate = value;
    }
    this.setData(extra);
    this.filter();
  },

  onFilterEndDate(e) {
    const value = String((e.detail && e.detail.value) || '').trim();
    const extra = { datePreset: 'custom', filterEndDate: value };
    if (this.data.filterStartDate && value && value < this.data.filterStartDate) {
      extra.filterStartDate = value;
    }
    this.setData(extra);
    this.filter();
  },

  onClearDateFilter() {
    if (!this.data.filterStartDate && !this.data.filterEndDate && !this.data.datePreset) return;
    this.setData({ datePreset: '', filterStartDate: '', filterEndDate: '' });
    this.filter();
  },

  _applyFilters(orders) {
    return filterMerchantOrders(orders || [], {
      tab: this.data.tab,
      serviceTab: this.data.serviceTab,
      filterStartDate: this.data.filterStartDate,
      filterEndDate: this.data.filterEndDate
    });
  },

  filter() {
    this._allFiltered = this._applyFilters(this.data.orders || []);
    this._listLimit = LIST_PAGE_SIZE;
    this._publishFilteredWindow();
  },

  _getOrderById(id) {
    return (app.getOrders() || []).find((o) => (o.id || o.order_id) === id);
  },

  _guardMerchantModify(id) {
    const order = this._getOrderById(id);
    if (!canMerchantModifyOrder(order)) {
      const tip = order && order.editPendingConfirm
        ? '用户改单待确认，请先确认或拒绝'
        : '价格待用户确认，暂不可操作';
      wx.showToast({ title: tip, icon: 'none' });
      return false;
    }
    return true;
  },

  onConfirmUserEdit(e) {
    const id = e.currentTarget.dataset.id;
    const order = this._getOrderById(id);
    if (!order || !order.editPendingConfirm) return;
    const fee = getPendingEditTotalFee(order);
    const feeTip = fee != null ? `，确认后费用为 ¥${fee}` : '';
    wx.showModal({
      title: '确认用户改单',
      content: `确认接受宠主的订单修改吗${feeTip}？确认后修改将立即生效。`,
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { editPendingConfirm: false })
          .then(() => {
            wx.showToast({ title: '已确认修改', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            const membershipUtil = require('../utils/membership');
            if (membershipUtil.handleMembershipRequiredError(err)) return;
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onRejectUserEdit(e) {
    const id = e.currentTarget.dataset.id;
    const order = this._getOrderById(id);
    if (!order || !order.editPendingConfirm) return;
    wx.showModal({
      title: '拒绝用户改单',
      content: '拒绝后订单将保持原信息不变，确定拒绝吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { rejectUserEdit: true })
          .then(() => {
            wx.showToast({ title: '已拒绝修改', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            const membershipUtil = require('../utils/membership');
            if (membershipUtil.handleMembershipRequiredError(err)) return;
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onAccept(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    const copy = getAcceptServiceCopy(this._getOrderById(id));
    wx.showModal({
      title: copy.title,
      content: copy.content,
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { status: 'awaiting_arrival' })
          .then((order) => {
            if (!order) return;
            wx.showToast({ title: '已确认接单', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onConfirmArrival(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    const order = this._getOrderById(id);
    const copy = getStartServiceCopy(order);
    const needPickupFlag = order && getOrderServiceKind(order) === 'boarding'
      && order.needPickup && order.pickupIncludeOutbound !== false && !order.pickupOutboundDone;
    wx.showModal({
      title: needPickupFlag ? '确认接宠到店' : copy.title,
      content: needPickupFlag
        ? '确认已从宠主处接到宠物并送达店铺？'
        : copy.content,
      success: (r) => {
        if (!r.confirm) return;
        const updates = { status: 'boarding' };
        if (needPickupFlag) updates.pickupOutboundDone = true;
        app.updateOrder(id, updates)
          .then(() => {
            wx.showToast({ title: needPickupFlag ? '已确认到店' : copy.toast, icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    wx.showModal({
      title: '拒绝预约',
      content: '确定拒绝此预约吗？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { status: 'cancelled' })
          .then(() => {
            wx.showToast({ title: '已拒绝', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onComplete(e) {
    const id = e.currentTarget.dataset.id;
    if (!this._guardMerchantModify(id)) return;
    const copy = getCompleteServiceCopy(this._getOrderById(id));
    wx.showModal({
      title: copy.title,
      content: copy.content,
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { status: 'completed' })
          .then(() => {
            wx.showToast({ title: '已完成', icon: 'success' });
            this.load();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onDetail(e) {
    wx.navigateTo({ url: '/packageBiz/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },

  onDailyCheck(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageBiz/daily-check/daily-check?orderId=' + id });
  },

  onEditPrice(e) {
    const id = e.currentTarget.dataset.id;
    const order = this._getOrderById(id);
    if (order && order.pricePendingConfirm) {
      wx.showToast({ title: '价格待用户确认，暂不可改价', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/packageBiz/order-price/order-price?id=' + id });
  },

  onCopyOrderNo(e) {
    copyText(e.currentTarget.dataset.no, '已复制订单号');
  }
});
