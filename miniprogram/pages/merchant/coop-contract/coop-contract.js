const app = getApp();

Page({
  data: {
    mode: 'view',
    doc: {},
    scrollHeight: 600
  },

  onLoad(options) {
    const mode = options.mode || 'view';
    const sys = wx.getSystemInfoSync();
    const scrollHeight = sys.windowHeight - (mode === 'sign' ? 140 : 0);
    this.setData({ mode, scrollHeight });

    if (mode === 'sign' || mode === 'preview') {
      const draft = app.globalData.coopContractSignDraft;
      if (!draft) {
        wx.showToast({ title: '协议信息已失效', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.setData({ doc: draft });
    }
  },

  onConfirmSign() {
    const doc = {
      ...this.data.doc,
      signed: true,
      signTime: new Date().toLocaleString('zh-CN'),
      signMethod: 'electronic'
    };

    app.globalData.signedCoopContractDraft = doc;
    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel && eventChannel.emit) {
      eventChannel.emit('signed', doc);
    }

    wx.showToast({ title: '签署成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 800);
  }
});
