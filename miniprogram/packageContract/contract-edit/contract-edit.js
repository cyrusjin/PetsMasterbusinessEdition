const app = getApp();
const { DEFAULT_TEMPLATE } = require('../../utils/boardingContract');

Page({
  data: { template: '' },
  onShow() {
    const tpl = app.getContractTemplate();
    this.setData({ template: tpl || DEFAULT_TEMPLATE });
  },
  onInput(e) { this.setData({ template: e.detail.value }); },
  onSave() {
    app.saveContractTemplate(this.data.template);
    wx.showToast({ title: '保存成功', icon: 'success' });
  }
});
