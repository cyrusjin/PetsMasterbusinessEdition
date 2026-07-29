const app = getApp();
const util = require('../../utils/util');
Page({
  data: { messages: [], inputText: '', scrollToView: '' },
  onShow() { this.load(); },
  load() {
    const chats = app.getChats().filter(c => c.from === 'merchant' || c.to === 'merchant');
    const msgs = chats.map(c => ({ ...c, timeStr: util.formatDateTime(c.time) }));
    this.setData({ messages: msgs, scrollToView: msgs.length > 0 ? 'msg-' + msgs[msgs.length - 1].id : '' });
  },
  onInput(e) { this.setData({ inputText: e.detail.value }); },
  onSend() {
    const txt = this.data.inputText.trim();
    if (!txt) return;
    app.saveChat({ from: 'merchant', to: 'user', content: txt, type: 'text' });
    this.setData({ inputText: '' }); this.load();
  },
  onPreview(e) { wx.previewImage({ current: e.currentTarget.dataset.url, urls: [e.currentTarget.dataset.url] }); }
});