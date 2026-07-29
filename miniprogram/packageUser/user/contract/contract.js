const app = getApp();

Page({
  data: { contracts: [] },

  onShow() {
    const contracts = app.getContracts();
    this.setData({ contracts });
  },

  onView(e) {
    const c = app.getContracts().find((ct) => ct.id === e.currentTarget.dataset.id);
    if (!c) return;
    if (c.orderId) {
      wx.navigateTo({ url: `/packageUser/user/boarding-contract/boarding-contract?orderId=${c.orderId}&contractId=${c.id}` });
      return;
    }
    app.globalData.contractSignDraft = c;
    wx.navigateTo({ url: '/packageUser/user/boarding-contract/boarding-contract?mode=preview' });
  }
});
