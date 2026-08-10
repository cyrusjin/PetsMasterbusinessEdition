const app = getApp();
const { guardUserTabPage } = require('../../utils/shell');
const { previewImages, previewVideo } = require('../../utils/dailyPreview');
const badgeUtil = require('../../utils/badge');
const userFeed = require('../../utils/userFeed');
const { refreshUserOrders } = require('../../utils/orderRefresh');

Page({
  data: { logs: [] },

  _syncUserTabBar(index) {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (tabBar) tabBar.setData({ selected: index });
  },

  onShow() {
    this._syncUserTabBar(2);
    if (guardUserTabPage()) return;
    const gen = (this._showGen || 0) + 1;
    this._showGen = gen;

    this._refreshDisplay(gen);
    refreshUserOrders(app, { force: false }).then(() => {
      if (gen !== this._showGen) return;
      return this._refreshDisplay(gen);
    }).then(() => {
      if (gen !== this._showGen) return;
      badgeUtil.markUserDailySeen();
      app.refreshUserBadges();
    });
  },

  onPullDownRefresh() {
    if (guardUserTabPage()) {
      wx.stopPullDownRefresh();
      return;
    }
    const gen = (this._showGen || 0) + 1;
    this._showGen = gen;
    refreshUserOrders(app, { force: true })
      .then(() => this._refreshDisplay(gen))
      .then(() => {
        if (gen !== this._showGen) return;
        badgeUtil.markUserDailySeen();
        app.refreshUserBadges();
      })
      .catch((err) => {
        console.error('[宠物动态] 下拉刷新失败', err);
      })
      .finally(() => wx.stopPullDownRefresh());
  },

  _refreshDisplay(gen) {
    const orders = app.getUserScopedOrders();
    const rawLogs = userFeed.getUserScopedDailyLogs(app, orders);
    if (!rawLogs.length) {
      if (this.data.logs.length) {
        this._lastSig = '';
        this.setData({ logs: [] });
      }
      return Promise.resolve();
    }

    return userFeed.buildDailyViewLogs(app, rawLogs, orders).then((logs) => {
      if (gen !== this._showGen) return;
      const sig = logs.map((log) => (
        `${log.id}:${(log.comments || []).length}:${(log.videoUrls || []).join(',')}:${(log.videoCoverUrls || []).join(',')}`
      )).join('|');
      if (sig === this._lastSig) return;
      this._lastSig = sig;
      this.setData({ logs });
    });
  },

  onPreviewImage(e) {
    const logIndex = e.currentTarget.dataset.logIndex;
    const url = e.currentTarget.dataset.url;
    const log = this.data.logs[logIndex];
    if (!log || !url) return;
    previewImages(url, log.images || []);
  },

  onPreviewVideo(e) {
    const logIndex = e.currentTarget.dataset.logIndex;
    const url = e.currentTarget.dataset.url;
    const videoIndex = e.currentTarget.dataset.videoIndex;
    const log = this.data.logs[logIndex];
    if (!log) return;
    const sources = (log.videoItems || []).map((item) => item.url).filter(Boolean);
    previewVideo(url || log.videoUrl || log.video, sources, videoIndex);
  },

  onCommentsChange(e) {
    const logIndex = Number(e.currentTarget.dataset.logIndex);
    const comments = (e.detail && e.detail.comments) || [];
    if (!Number.isFinite(logIndex) || logIndex < 0) return;
    const logs = (this.data.logs || []).slice();
    const current = logs[logIndex];
    if (!current) return;
    logs[logIndex] = { ...current, comments };
    this.setData({ logs });
  }
});
