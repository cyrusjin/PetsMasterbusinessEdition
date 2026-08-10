const app = getApp();
const { redirectToUserIfMerchantUiBlocked, ensureMerchantPageAllowed } = require('../../../utils/shell');

/** 兼容旧入驻码：统一跳转到我的门店基础设置 */
Page({
  onShow() {
    if (redirectToUserIfMerchantUiBlocked()) return;
    ensureMerchantPageAllowed().then((blocked) => {
      if (blocked) return;
      if (app.isUserClientMode && app.isUserClientMode()) {
        wx.switchTab({ url: '/pages/index/index' });
        return;
      }
      if (app.enterMerchantMode) {
        app.enterMerchantMode();
        return;
      }
      wx.redirectTo({ url: '/pages/merchant/tab-store/tab-store' });
    });
  }
});
