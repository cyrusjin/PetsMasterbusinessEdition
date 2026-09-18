const {
  MERCHANT_BOARDING_INSURANCE_URL,
  navigateToMerchantBoardingInsurance
} = require('../../utils/petInsurance');
const merchantDemo = require('../../utils/merchantDemo');

Page({
  data: {
    insuranceUrl: MERCHANT_BOARDING_INSURANCE_URL,
    isDemoMode: false,
    highlights: [
      '宠物意外伤害保障',
      '第三者责任保障',
      '寄养期间更安心'
    ]
  },

  onLoad() {
    const app = getApp();
    const isDemoMode = !!(app && app.isMerchantDemoMode && app.isMerchantDemoMode());
    this.setData({ isDemoMode });
  },

  onBuyInsurance() {
    if (this.data.isDemoMode) {
      merchantDemo.promptDemoInsuranceBlocked();
      return;
    }
    navigateToMerchantBoardingInsurance();
  },

  onCopyInsuranceLink() {
    if (this.data.isDemoMode) {
      merchantDemo.promptDemoInsuranceBlocked();
      return;
    }
    const url = String(this.data.insuranceUrl || '').trim();
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '购买链接已复制',
          content: '请将链接粘贴发送到微信聊天（如文件传输助手），再点击消息中的链接打开平安好车主小程序。',
          showCancel: false,
          confirmText: '知道了'
        });
      },
      fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
    });
  },

  onCallPingAn() {
    wx.makePhoneCall({
      phoneNumber: '95511',
      fail: () => wx.showToast({ title: '请拨打平安客服 95511', icon: 'none' })
    });
  },

  onContactService() {
    const contact = this.selectComponent('#boardingInsuranceContact');
    if (contact) contact.open();
  }
});
