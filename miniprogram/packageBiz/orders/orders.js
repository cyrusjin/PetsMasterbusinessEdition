const app = getApp();
const { copyText } = require('../../utils/clipboard');
const badgeUtil = require('../../utils/badge');
const { formatDate } = require('../../utils/util');
const { buildOrderListPetMeta } = require('../../utils/petSnapshot');
const { canMerchantModifyOrder } = require('../utils/orderActions');
const merchantDemo = require('../../utils/merchantDemo');
const { refreshMerchantOrders, startMerchantOrdersPoll, stopMerchantOrdersPoll } = require('../../utils/orderRefresh');
const { redirectToStoreAuthIfNeeded, reLaunchMerchantHomeIfNoBackend } = require('../../utils/shell');
const { buildPendingEditLines, getPendingEditTotalFee } = require('../utils/pendingEdit');
const { formatHomeVisitTimeText, getVisitSnapshot, attachVisitAddressFields } = require('../../utils/homeVisitAddress');
const { normalizeServiceLines, SERVICE_LINE_DEFS } = require('../../utils/serviceLines');
const { calcDistanceKm } = require('../../utils/pickupPricing');
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

function listEnabledServiceKeys(shop) {
  const lines = normalizeServiceLines(shop && shop.serviceLines);
  return SERVICE_LINE_DEFS.filter((def) => lines[def.key]).map((def) => def.key);
}

function isHomeFeedingFilter(serviceTab, shop) {
  if (serviceTab === 'homeFeeding') return true;
  if (serviceTab && serviceTab !== 'all') return false;
  const enabled = listEnabledServiceKeys(shop);
  return enabled.length === 1 && enabled[0] === 'homeFeeding';
}

function isDoneStatus(order) {
  return order && (order.status === 'completed' || order.status === 'cancelled');
}

function padTimePart(value) {
  return String(value == null ? '' : value).padStart(2, '0');
}

function getVisitTimeKey(order) {
  const date = String((order && order.startDate) || '').trim();
  if (!date) return '';
  const match = String((order && order.startTime) || '').trim().match(/^(\d{1,2}):(\d{2})/);
  const time = match ? `${padTimePart(match[1])}:${match[2]}` : '00:00';
  return `${date} ${time}`;
}

function parseDistanceKm(value) {
  const km = parseFloat(value);
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.round(km * 10) / 10;
}

function hasVisitCoords(order) {
  const lat = parseFloat(order && order.visitLatitude);
  const lng = parseFloat(order && order.visitLongitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function formatVisitAddressText(order) {
  const visit = attachVisitAddressFields(order);
  const address = visit.visitAddress || visit.visitLocationName || '';
  const room = visit.visitRoomNo;
  if (address && room) return `${address} ${room}`;
  return address || room || '';
}

function getVisitDistanceKm(order, shop) {
  const fromOrder = parseDistanceKm(order && order.visitDistanceKm);
  if (fromOrder != null) return fromOrder;
  const snap = getVisitSnapshot(order);
  const fromSnap = parseDistanceKm(snap && snap.distanceKm);
  if (fromSnap != null) return fromSnap;
  const shopLat = parseFloat(shop && shop.latitude);
  const shopLng = parseFloat(shop && shop.longitude);
  const lat = parseFloat(order && order.visitLatitude);
  const lng = parseFloat(order && order.visitLongitude);
  if (![shopLat, shopLng, lat, lng].every(Number.isFinite)) return null;
  return parseDistanceKm(calcDistanceKm(shopLat, shopLng, lat, lng));
}

function sortMerchantOrders(list, { tab, serviceTab, homeVisitSort, shop }) {
  const useHome = isHomeFeedingFilter(serviceTab, shop);
  const sortMode = useHome ? (homeVisitSort === 'distance' ? 'distance' : 'time') : 'createTime';
  const completedTab = tab === 'completed';
  const allTab = !tab || tab === 'all';

  return (list || []).slice().sort((a, b) => {
    const aPend = a.editPendingConfirm ? 1 : 0;
    const bPend = b.editPendingConfirm ? 1 : 0;
    if (aPend !== bPend) return bPend - aPend;

    if (useHome && allTab) {
      const aDone = isDoneStatus(a) ? 1 : 0;
      const bDone = isDoneStatus(b) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
    }

    if (sortMode === 'distance') {
      const da = a.visitDistanceKm;
      const db = b.visitDistanceKm;
      const aMiss = da == null;
      const bMiss = db == null;
      if (aMiss !== bMiss) return aMiss ? 1 : -1;
      if (!aMiss && da !== db) return da - db;
    } else if (sortMode === 'time') {
      const ta = a.visitTimeKey || '';
      const tb = b.visitTimeKey || '';
      if (ta && tb && ta !== tb) {
        const reverse = completedTab || (allTab && isDoneStatus(a));
        const cmp = ta.localeCompare(tb);
        return reverse ? -cmp : cmp;
      }
      if (!!ta !== !!tb) return ta ? -1 : 1;
    }

    return (b.createTime || 0) - (a.createTime || 0);
  });
}

Page({
  data: {
    tab: 'all',
    serviceTab: 'all',
    serviceTabs: [],
    showServiceTabs: false,
    showHomeVisitSort: false,
    homeVisitSort: 'time',
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
    extra.showHomeVisitSort = isHomeFeedingFilter(
      extra.serviceTab,
      (typeof app.getShop === 'function' && app.getShop()) || {}
    );
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
        if (reLaunchMerchantHomeIfNoBackend(app)) {
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
      serviceTab,
      showHomeVisitSort: isHomeFeedingFilter(serviceTab, shop)
    };
  },

  load() {
    const shop = (typeof app.getShop === 'function' && app.getShop()) || {};
    const orders = app.getOrders()
      .map((order) => {
        const serviceKind = getOrderServiceKind(order);
        const visit = serviceKind === 'homeFeeding' ? attachVisitAddressFields(order) : order;
        const visitDistanceKm = serviceKind === 'homeFeeding'
          ? getVisitDistanceKm(order, shop)
          : null;
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
          serviceTimeText: formatOrderServiceTime(order, serviceKind),
          visitTimeKey: serviceKind === 'homeFeeding' ? getVisitTimeKey(order) : '',
          visitDistanceKm,
          visitDistanceText: visitDistanceKm != null ? `约 ${visitDistanceKm} 公里` : '',
          visitAddressText: serviceKind === 'homeFeeding' ? formatVisitAddressText(visit) : '',
          visitLocationName: serviceKind === 'homeFeeding' ? (visit.visitLocationName || '') : '',
          visitAddress: serviceKind === 'homeFeeding' ? (visit.visitAddress || '') : '',
          hasVisitCoords: serviceKind === 'homeFeeding' && hasVisitCoords(order)
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
    const shop = (typeof app.getShop === 'function' && app.getShop()) || {};
    this.setData({
      serviceTab,
      showHomeVisitSort: isHomeFeedingFilter(serviceTab, shop)
    });
    this.filter();
  },

  onHomeVisitSort(e) {
    const key = e.currentTarget.dataset.key;
    if (key !== 'time' && key !== 'distance') return;
    if (key === this.data.homeVisitSort) return;
    this.setData({ homeVisitSort: key });
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
    const shop = (typeof app.getShop === 'function' && app.getShop()) || {};
    const homeVisitList = isHomeFeedingFilter(this.data.serviceTab, shop);
    const list = filterMerchantOrders(orders || [], {
      tab: this.data.tab,
      serviceTab: this.data.serviceTab,
      filterStartDate: homeVisitList ? '' : this.data.filterStartDate,
      filterEndDate: homeVisitList ? '' : this.data.filterEndDate
    });
    return sortMerchantOrders(list, {
      tab: this.data.tab,
      serviceTab: this.data.serviceTab,
      homeVisitSort: this.data.homeVisitSort,
      shop
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
  },

  onOpenVisitNav(e) {
    const id = e.currentTarget.dataset.id;
    const order = (this.data.orders || []).find((item) => (item.id || item.order_id) === id)
      || this._getOrderById(id);
    if (!order) return;
    const latitude = parseFloat(order.visitLatitude);
    const longitude = parseFloat(order.visitLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      wx.showToast({ title: '暂无地图定位', icon: 'none' });
      return;
    }
    const visit = attachVisitAddressFields(order);
    wx.openLocation({
      latitude,
      longitude,
      name: visit.visitLocationName || visit.visitAddress || '上门地址',
      address: [visit.visitAddress, visit.visitRoomNo].filter(Boolean).join(' '),
      scale: 16
    });
  }
});
