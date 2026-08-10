const app = getApp();
const { guardUserTabPage } = require('../../utils/shell');
const { previewImages, previewVideo } = require('../../utils/dailyPreview');
const badgeUtil = require('../../utils/badge');
const userFeed = require('../../utils/userFeed');
const { refreshUserOrders } = require('../../utils/orderRefresh');
const dailyApi = require('../../utils/daily');
const { getLogId } = require('../../utils/dailyLogUtil');

Page({
  data: {
    logs: [],
    sharedLogId: '',
    sharedLoading: false,
    sharedMissing: false
  },

  _syncUserTabBar(index) {
    if (typeof this.getTabBar !== 'function') return;
    const tabBar = this.getTabBar();
    if (tabBar) tabBar.setData({ selected: index });
  },

  onLoad(options) {
    const fromQuery = String((options && (options.log_id || options.logId)) || '').trim();
    const fromApp = (app.peekPendingSharedDailyLogId && app.peekPendingSharedDailyLogId()) || '';
    const logId = fromQuery || fromApp;
    if (logId) {
      this._pendingSharedLogId = logId;
      if (app.globalData) app.globalData.pendingSharedDailyLogId = logId;
      this.setData({ sharedLogId: logId, sharedLoading: true });
    }
  },

  onShow() {
    this._syncUserTabBar(2);
    if (guardUserTabPage()) return;
    const gen = (this._showGen || 0) + 1;
    this._showGen = gen;

    const sharedId = this._takeSharedLogId();
    // 先登录再拉分享动态，避免路人冷启动请求失败看不到内容
    app.ensureCloudAndLogin({ silent: true })
      .then(() => {
        if (gen !== this._showGen) return null;
        return this._refreshDisplay(gen, sharedId);
      })
      .then(() => {
        if (gen !== this._showGen) return null;
        return refreshUserOrders(app, { force: false });
      })
      .then(() => {
        if (gen !== this._showGen) return null;
        // 订单刷新后只重绘自己的动态流；分享条目继续保留
        return this._refreshDisplay(gen, sharedId || this.data.sharedLogId);
      })
      .then(() => {
        if (gen !== this._showGen) return;
        badgeUtil.markUserDailySeen();
        app.refreshUserBadges();
      })
      .catch((err) => {
        console.error('[宠物动态] 加载失败', err);
      });
  },

  onPullDownRefresh() {
    if (guardUserTabPage()) {
      wx.stopPullDownRefresh();
      return;
    }
    const gen = (this._showGen || 0) + 1;
    this._showGen = gen;
    const sharedId = this.data.sharedLogId || '';
    app.ensureCloudAndLogin({ silent: true })
      .then(() => refreshUserOrders(app, { force: true }))
      .then(() => this._refreshDisplay(gen, sharedId))
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

  _takeSharedLogId() {
    const fromPending = this._pendingSharedLogId || '';
    this._pendingSharedLogId = '';
    const fromApp = (app.consumePendingSharedDailyLogId && app.consumePendingSharedDailyLogId()) || '';
    const logId = fromPending || fromApp || this.data.sharedLogId || '';
    if (logId && logId !== this.data.sharedLogId) {
      this.setData({ sharedLogId: logId });
    }
    return logId;
  },

  _toShareViewLog(log) {
    if (!log) return null;
    const canComment = !!log.canComment;
    const viewOnly = log.viewOnly === true || !canComment;
    return {
      ...log,
      // 分享落地不带订单，避免客户端误用去拉该宠其它数据
      orderId: '',
      order_id: '',
      store_id: '',
      storeId: '',
      canComment,
      viewOnly,
      commentsDisabled: viewOnly,
      commentsHidden: viewOnly,
      fromShare: true,
      comments: canComment && Array.isArray(log.comments) ? log.comments : []
    };
  },

  _refreshDisplay(gen, sharedLogId) {
    const orders = app.getUserScopedOrders();
    const rawLogs = userFeed.getUserScopedDailyLogs(app, orders);
    const feedPromise = rawLogs.length
      ? userFeed.buildDailyViewLogs(app, rawLogs, orders)
      : Promise.resolve([]);

    const id = String(sharedLogId || '').trim();
    const sharedPromise = id
      ? this._loadSharedLog(id)
      : Promise.resolve(null);

    if (id) this.setData({ sharedLoading: true, sharedMissing: false });

    return Promise.all([feedPromise, sharedPromise]).then(([feedLogs, sharedLog]) => {
      if (gen !== this._showGen) return;

      let logs = Array.isArray(feedLogs) ? feedLogs.slice() : [];
      let sharedMissing = false;

      if (id) {
        if (sharedLog) {
          const sharedId = getLogId(sharedLog);
          logs = logs.filter((item) => getLogId(item) !== sharedId);
          logs.unshift(this._toShareViewLog(sharedLog));
        } else {
          // 仅当自己本来就有这条订单动态时兜底置顶；仍不据此授予额外权限
          const localIdx = logs.findIndex((item) => getLogId(item) === id);
          if (localIdx >= 0) {
            const local = logs.splice(localIdx, 1)[0];
            logs.unshift({ ...local, fromShare: true });
          } else {
            sharedMissing = true;
          }
        }
      }

      const sig = [
        id,
        sharedMissing ? '1' : '0',
        logs.map((log) => (
          `${log.id}:${log.viewOnly ? 1 : 0}:${(log.comments || []).length}:${(log.videoUrls || []).join(',')}:${(log.videoCoverUrls || []).join(',')}`
        )).join('|')
      ].join('#');
      if (sig === this._lastSig) {
        this.setData({ sharedLoading: false, sharedMissing });
        this._reportViewedLogs(logs);
        return;
      }
      this._lastSig = sig;
      this.setData({
        logs,
        sharedLoading: false,
        sharedMissing,
        sharedLogId: id || this.data.sharedLogId
      });
      this._reportViewedLogs(logs);
    }).catch((err) => {
      console.error('[宠物动态] 刷新失败', err);
      if (gen !== this._showGen) return;
      this.setData({ sharedLoading: false });
    });
  },

  _reportViewedLogs(logs) {
    const ids = (logs || [])
      .filter((log) => log && !log.viewOnly && !log.isScheduled)
      .map((log) => getLogId(log))
      .filter(Boolean);
    if (!ids.length) return;
    // 避免同一批反复打接口
    const sig = ids.slice().sort().join('|');
    if (sig === this._reportedViewSig) return;
    this._reportedViewSig = sig;
    dailyApi.reportDailyLogsViewed(ids);
  },

  _loadSharedLog(logId) {
    return dailyApi.fetchSharedDailyLog(logId).then((log) => {
      if (!log) return null;
      // 不把分享动态写入本地 feed 缓存，避免变成“拥有该宠动态权限”
      return userFeed.buildDailyViewLogs(app, [log], []).then((list) => {
        const built = (list && list[0]) || log;
        return {
          ...built,
          canComment: !!log.canComment,
          viewOnly: log.viewOnly === true || !log.canComment,
          comments: Array.isArray(log.comments) ? log.comments : []
        };
      });
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
    if (!current || current.viewOnly || current.commentsDisabled) return;
    logs[logIndex] = { ...current, comments };
    this.setData({ logs });
  }
});
