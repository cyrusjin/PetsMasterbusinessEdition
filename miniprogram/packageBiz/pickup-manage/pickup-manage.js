const app = getApp();
const { copyText } = require('../../utils/clipboard');
const merchantDemo = require('../../utils/merchantDemo');
const {
  LEG_OUTBOUND,
  LEG_RETURN,
  buildPickupList,
  countPendingPickupTasks
} = require('../../utils/pickupManage');
const { refreshMerchantOrders, startMerchantOrdersPoll, stopMerchantOrdersPoll } = require('../../utils/orderRefresh');

Page({
  data: {
    loading: true,
    isDemoMode: false,
    leg: LEG_OUTBOUND,
    outboundCount: 0,
    returnCount: 0,
    list: []
  },

  onShow() {
    this._loadList();
    startMerchantOrdersPoll(this, () => this._loadList({ force: false }));
  },

  onHide() {
    stopMerchantOrdersPoll(this);
  },

  onUnload() {
    stopMerchantOrdersPoll(this);
  },

  onPullDownRefresh() {
    this._loadList({ force: true }).finally(() => wx.stopPullDownRefresh());
  },

  onLegTab(e) {
    const leg = e.currentTarget.dataset.leg;
    if (!leg || leg === this.data.leg) return;
    this.setData({ leg });
    this._applyList(app.getOrders());
  },

  onGoOrderDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/packageBiz/order-detail/order-detail?id=${id}` });
  },

  onCallPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onOpenMap(e) {
    const { lat, lng, name, address } = e.currentTarget.dataset;
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      wx.showToast({ title: '暂无地图定位', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude,
      longitude,
      name: name || '接送地址',
      address: address || '',
      scale: 16
    });
  },

  onConfirmOutbound(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '确认已接宠',
      content: '确认已从宠主处接到宠物并送达店铺？确认后将开始寄养服务。',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { status: 'boarding', pickupOutboundDone: true })
          .then((order) => {
            if (!order) return;
            wx.showToast({ title: '已确认接宠到店', icon: 'success' });
            this._loadList({ force: true });
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  onConfirmReturn(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '确认已送返',
      content: '确认已将宠物安全送返宠主指定地址？',
      success: (r) => {
        if (!r.confirm) return;
        app.updateOrder(id, { pickupReturnDone: true })
          .then((order) => {
            if (!order) return;
            wx.showToast({ title: '已确认送返', icon: 'success' });
            this._loadList({ force: true });
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
          });
      }
    });
  },

  _loadList(options = {}) {
    this.setData({ loading: true });
    const isDemoMode = app.isMerchantDemoMode();
    this.setData({ isDemoMode });

    const finish = () => {
      this._applyList(app.getOrders());
      this.setData({ loading: false });
    };

    if (isDemoMode) {
      merchantDemo.ensureDemoData();
      finish();
      return Promise.resolve();
    }

    if (!app.canAccessMerchantBackend()) {
      finish();
      return Promise.resolve();
    }

    return refreshMerchantOrders(app, { force: !!options.force })
      .then(finish)
      .catch(finish);
  },

  _applyList(orders) {
    const outboundList = buildPickupList(orders, LEG_OUTBOUND);
    const returnList = buildPickupList(orders, LEG_RETURN);
    const leg = this.data.leg;
    this.setData({
      outboundCount: outboundList.length,
      returnCount: returnList.length,
      list: leg === LEG_RETURN ? returnList : outboundList,
      pendingTotal: countPendingPickupTasks(orders)
    });
  },

  onCopyOrderNo(e) {
    copyText(e.currentTarget.dataset.no, '已复制订单号');
  }
});
