const app = getApp();
const { copyText } = require('../../utils/clipboard');
const { guardUserTabPage } = require('../../utils/shell');
const badgeUtil = require('../../utils/badge');
const { refreshUserOrders } = require('../../utils/orderRefresh');
const { formatOrderCreateTime } = require('../../utils/util');
const { formatServiceStatus, getOrderServiceKind } = require('../../utils/dailyCheckable');
const { formatHomeVisitTimeText } = require('../../utils/homeVisitAddress');

Page({
  data: { activeTab: 'all', orders: [], filteredOrders: [] },

  onLoad(options) {
    const tab = (options && options.tab) ? String(options.tab).trim() : '';
    if (tab) {
      this.setData({ activeTab: tab });
    }
  },

  _syncUserTabBar(index) {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (tabBar) tabBar.setData({ selected: index });
  },

  onShow() {
    this._syncUserTabBar(1);
    if (guardUserTabPage()) return;
    const gen = (this._showGen || 0) + 1;
    this._showGen = gen;

    this._renderOrders();
    refreshUserOrders(app, { force: false }).then(() => {
      if (gen !== this._showGen) return;
      this._renderOrders();
      badgeUtil.markUserOrdersSeen();
      app.refreshUserBadges();
    });
  },

  onPullDownRefresh() {
    if (guardUserTabPage()) {
      wx.stopPullDownRefresh();
      return;
    }
    refreshUserOrders(app, { force: true })
      .then(() => {
        this._ordersSig = '';
        this._renderOrders();
        badgeUtil.markUserOrdersSeen();
        app.refreshUserBadges();
      })
      .catch((err) => {
        console.error('[我的订单] 下拉刷新失败', err);
      })
      .finally(() => {
        wx.stopPullDownRefresh();
      });
  },

  _renderOrders() {
    const pets = app.getPets();
    const orders = badgeUtil.enrichOrdersWithUnread(
      app.getUserScopedOrders().sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
    ).map((o) => {
      const pet = pets.find((p) => p.id === o.petId);
      const kind = getOrderServiceKind(o);
      let serviceTimeText = `${o.startDate || ''} ~ ${o.endDate || ''}`.trim();
      if (kind === 'homeFeeding') {
        serviceTimeText = formatHomeVisitTimeText(o) || `${o.startDate || ''} ${o.startTime || ''}`.trim() || '--';
      } else if (kind === 'wash') {
        serviceTimeText = `${o.startDate || ''} ${o.startTime || ''}`.trim() || '--';
      }
      return {
        ...o,
        petPhoto: pet ? pet.photo : '',
        createTimeText: formatOrderCreateTime(o) || '--',
        statusLabel: formatServiceStatus(o),
        serviceTimeLabel: kind === 'wash' ? '到店时间' : (kind === 'homeFeeding' ? '上门时间' : '寄养时间'),
        serviceTimeText
      };
    });
    const sig = orders.map((o) => [
      o.id,
      o.status,
      o.pricePendingConfirm ? 1 : 0,
      o.hasUnread ? 1 : 0,
      o.totalFee || 0,
      o.createTime || 0
    ].join(':')).join('|');
    if (sig !== this._ordersSig) {
      this._ordersSig = sig;
      this.setData({ orders });
    }
    this.filterOrders();
  },

  loadOrders() {
    this._renderOrders();
  },

  onTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); this.filterOrders(); },

  filterOrders() {
    const { activeTab, orders } = this.data;
    let filtered = orders;
    if (activeTab === 'pending') filtered = orders.filter((o) => o.status === 'pending' || o.status === 'confirmed');
    else if (activeTab === 'awaiting_arrival') filtered = orders.filter((o) => o.status === 'awaiting_arrival');
    else if (activeTab === 'boarding') filtered = orders.filter((o) => o.status === 'boarding');
    else if (activeTab === 'completed') filtered = orders.filter((o) => o.status === 'completed' || o.status === 'cancelled');
    this.setData({ filteredOrders: filtered });
  },

  onDetail(e) { wx.navigateTo({ url: '/packageUser/user/order-detail/order-detail?id=' + e.currentTarget.dataset.id }); },

  onCopyOrderNo(e) {
    copyText(e.currentTarget.dataset.no, '已复制订单号');
  },

  onConfirmPrice(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find((o) => o.id === id);
    if (!order) return;
    wx.showModal({
      title: '确认改价',
      content: `商家已将订单金额调整为 ¥${order.totalFee}，是否确认？`,
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { pricePendingConfirm: false })
          .then(() => {
            wx.showToast({ title: '已确认', icon: 'success' });
            this._ordersSig = '';
            badgeUtil.markUserOrdersSeen();
            this._renderOrders();
            app.refreshUserBadges();
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  }
});
