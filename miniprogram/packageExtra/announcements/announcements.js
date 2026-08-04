const announcementApi = require('../../utils/announcements');

Page({
  data: {
    loading: true,
    list: []
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  load(force) {
    this.setData({ loading: !this.data.list.length });
    return announcementApi.fetchMerchantAnnouncements({ force: !!force })
      .then((res) => {
        const list = (res && res.list) || [];
        this.setData({ loading: false, list });
        if (res && res.success !== false) {
          announcementApi.markAllRead(res);
        }
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onOpenDetail(e) {
    const id = (e.currentTarget.dataset && e.currentTarget.dataset.id) || '';
    if (!id) return;
    wx.navigateTo({
      url: `/packageExtra/announcement-detail/announcement-detail?id=${encodeURIComponent(id)}`
    });
  }
});
