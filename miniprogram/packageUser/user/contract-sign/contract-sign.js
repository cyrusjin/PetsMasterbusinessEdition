const app = getApp();
Page({
  data: { contract: {}, userName: '', userPhone: '', userIdCard: '' },
  onLoad(opts) {
    const c = app.getContracts().find(ct => ct.id === opts.id);
    const user = app.globalData.userInfo || {};
    if (c) this.setData({ contract: c, userName: user.realName || user.nickName || '宠主', userPhone: user.phone || '--', userIdCard: user.idCard || '--' });
  },
  onSignConfirm(e) {
    app.updateContract(this.data.contract.id, { signed: true, signature: e.detail.signature, signTime: new Date().toLocaleString('zh-CN') });
    wx.showToast({ title: '签署成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1000);
  }
});