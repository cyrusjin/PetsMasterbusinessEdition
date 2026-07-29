const app = getApp();
Page({
  data: { contracts: [] },
  onShow() { this.setData({ contracts: app.getContracts() }); },
  onView(e) {
    const c = app.getContracts().find(ct => ct.id === e.currentTarget.dataset.id);
    if (c) wx.showModal({ title: '协议详情', content: `宠物寄养协议\n\n宠物：${c.petName}\n时间：${c.startDate}~${c.endDate}\n费用：¥${c.totalFee}\n\n状态：${c.signed ? '已签署' : '待签署'}`, showCancel: false, confirmText: '关闭' });
  },
  onPush(e) { wx.showToast({ title: '已推送给用户', icon: 'success' }); },
  onEditTemplate() { wx.navigateTo({ url: '/packageContract/contract-edit/contract-edit' }); }
});