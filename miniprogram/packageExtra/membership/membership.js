const app = getApp();
const membershipApi = require('../utils/membership');

Page({
  data: {
    membership: {
      active: false,
      freeDogLimit: 5,
      boardingCount: 0,
      priceYuan: '9.9',
      periodDays: 30,
      enabled: true,
      payConfigured: false
    },
    paying: false
  },

  onShow() {
    this.load();
  },

  load() {
    const shop = app.getShop ? app.getShop() : (app.globalData.shop || {});
    const storeId = (shop && shop.store_id) || '';
    membershipApi.getMembershipStatus(storeId)
      .then((res) => {
        if (res.membership) {
          this.setData({ membership: res.membership });
        }
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  onPay() {
    if (this.data.paying) return;
    if (!this.data.membership.enabled) {
      wx.showToast({ title: '会员开通暂未开放', icon: 'none' });
      return;
    }
    const shop = app.getShop ? app.getShop() : (app.globalData.shop || {});
    const storeId = (shop && shop.store_id) || '';
    this.setData({ paying: true });
    wx.showLoading({ title: '拉起支付...', mask: true });
    membershipApi.createMembershipPay(storeId)
      .then((res) => membershipApi.requestMembershipPayment(res.payment)
        .then(() => membershipApi.pollMembershipPaid(res.order_id)))
      .then((paidRes) => {
        wx.hideLoading();
        this.setData({ paying: false });
        if (paidRes && paidRes.membership) {
          this.setData({ membership: paidRes.membership });
        } else {
          this.load();
        }
        wx.showToast({ title: '开通成功', icon: 'success' });
        if (app.refreshMerchantStore) {
          app.refreshMerchantStore().catch(() => {});
        }
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ paying: false });
        if (err && err.cancelled) {
          wx.showToast({ title: '已取消支付', icon: 'none' });
          return;
        }
        wx.showToast({ title: (err && err.message) || '支付失败', icon: 'none', duration: 2500 });
      });
  }
});
