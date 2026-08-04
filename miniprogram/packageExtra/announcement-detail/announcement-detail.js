const announcementApi = require('../../utils/announcements');

Page({
  data: {
    loading: true,
    announcement: null
  },

  onLoad(options) {
    const id = (options && options.id) || '';
    this._id = id;
    this.load();
  },

  load() {
    if (!this._id) {
      this.setData({ loading: false, announcement: null });
      return;
    }
    this.setData({ loading: true });
    announcementApi.fetchAnnouncementDetail(this._id)
      .then((res) => {
        this.setData({
          loading: false,
          announcement: (res && res.announcement) || null
        });
        if (res && res.success === false) {
          wx.showToast({ title: res.errMsg || '加载失败', icon: 'none' });
        }
      })
      .catch(() => {
        this.setData({ loading: false, announcement: null });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  }
});
