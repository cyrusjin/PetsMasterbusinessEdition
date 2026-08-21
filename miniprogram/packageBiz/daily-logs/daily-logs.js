const app = getApp();
const { groupLogsByDate, toDateKey, formatDateLabel } = require('../../utils/dailyTimeline');
const { dedupeDailyLogs } = require('../../utils/dailyLogUtil');
const { previewImages, previewVideo } = require('../../utils/dailyPreview');
const merchantDemo = require('../../utils/merchantDemo');
const { refreshMerchantOrders } = require('../../utils/orderRefresh');
const { deriveVideoCoverUrl, normalizeLogVideos } = require('../../utils/mediaUrl');
const dailyApi = require('../../utils/daily');

const DEFAULT_SHARE_IMAGE = '/images/default-avatar.png';
const DAILY_SHARE_TITLE = '快来看看宠物动态';
const DAILY_SHARE_PAGE = 'pages/daily/daily';

function pickDailyShareImage(log) {
  if (!log) return '';
  const images = Array.isArray(log.images) ? log.images.filter(Boolean) : [];
  if (images.length) return String(images[0]);
  const coverUrls = Array.isArray(log.videoCoverUrls) ? log.videoCoverUrls.filter(Boolean) : [];
  if (coverUrls.length) return String(coverUrls[0]);
  const items = Array.isArray(log.videoItems) ? log.videoItems : [];
  for (let i = 0; i < items.length; i += 1) {
    const cover = items[i] && items[i].coverUrl;
    if (cover) return String(cover);
  }
  return String(log.videoCoverUrl || log.videoCover || '').trim();
}

function buildDailyLogShareConfig(log) {
  const id = log && (log.id || log.log_id);
  const path = id
    ? `${DAILY_SHARE_PAGE}?log_id=${encodeURIComponent(String(id).trim())}`
    : DAILY_SHARE_PAGE;
  return {
    title: DAILY_SHARE_TITLE,
    path,
    imageUrl: pickDailyShareImage(log) || DEFAULT_SHARE_IMAGE
  };
}

function enableDailyLogShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage']
  });
}

function enrichLogs(logs, orders, pets) {
  const orderMap = {};
  (orders || []).forEach((item) => {
    const id = item.id || item.order_id;
    if (id) orderMap[id] = item;
  });
  const petMap = {};
  (pets || []).forEach((item) => {
    if (item && item.id) petMap[item.id] = item;
  });

  return dedupeDailyLogs(logs || []).map((log) => {
    const order = orderMap[log.orderId] || orderMap[log.order_id] || null;
    const pet = order && order.petId ? petMap[order.petId] : null;
    const videoFields = normalizeLogVideos(log);
    const scheduledAt = Number(log.scheduledAt) || 0;
    const status = log.status || '';
    // 未发布的预约：status=scheduled，或带预约时间且未标记已发布
    const isScheduled = status === 'scheduled'
      || (!!log.isScheduled && status !== 'published')
      || (scheduledAt > Date.now() && status !== 'published' && !log.publishedAt);
    const dateKey = (isScheduled && scheduledAt)
      ? (toDateKey(scheduledAt) || '')
      : (toDateKey(log.createTime) || toDateKey(log.time) || '');
    return {
      ...log,
      orderId: log.orderId || log.order_id || (order ? order.id : ''),
      petId: order ? (order.petId || '') : '',
      petPhoto: pet ? pet.photo : '',
      petName: log.petName || (order ? order.petName : '未知宠物'),
      dateKey,
      ...videoFields,
      videoCoverUrl: videoFields.videoCoverUrl || deriveVideoCoverUrl(videoFields.videoUrl) || '',
      status: isScheduled ? 'scheduled' : (status || 'published'),
      isScheduled,
      canDeleteScheduled: isScheduled,
      scheduledAt,
      userViewedAt: Number(log.userViewedAt) || 0,
      userViewed: !!(Number(log.userViewedAt) || log.userViewed),
      viewLabel: isScheduled
        ? ''
        : ((Number(log.userViewedAt) || log.userViewed) ? '客人已查看' : '客人未查看'),
      comments: Array.isArray(log.comments) ? log.comments : []
    };
  });
}

function buildPetOptions(orders, pets) {
  // 打卡记录覆盖寄养中 + 已完成等全部相关订单，便于回看历史
  const scopedOrders = (orders || []).filter((o) => {
    const status = o && o.status;
    return status === 'boarding'
      || status === 'completed'
      || status === 'awaiting_arrival'
      || status === 'confirmed'
      || status === 'cancelled';
  });
  const petMap = {};
  (pets || []).forEach((item) => {
    if (item && item.id) petMap[item.id] = item;
  });
  const seen = {};
  const options = [];
  scopedOrders.forEach((order) => {
    const petId = order.petId || '';
    const key = petId || ('order:' + (order.id || order.order_id));
    if (seen[key]) return;
    seen[key] = true;
    const pet = petId ? petMap[petId] : null;
    options.push({
      id: key,
      petId,
      orderId: order.id || order.order_id || '',
      name: order.petName || (pet && pet.name) || '未知宠物'
    });
  });
  return options;
}

function getScopedOrderIds(orders) {
  return (orders || [])
    .filter((o) => {
      const status = o && o.status;
      return status === 'boarding'
        || status === 'completed'
        || status === 'awaiting_arrival'
        || status === 'confirmed'
        || status === 'cancelled';
    })
    .map((item) => item.id || item.order_id)
    .filter(Boolean);
}

function filterLogsByPet(logs, selectedPetId) {
  if (!selectedPetId || selectedPetId === 'all') return logs || [];
  return (logs || []).filter((log) => {
    const key = log.petId || ('order:' + (log.orderId || ''));
    return key === selectedPetId;
  });
}

function buildPetPickerState(petOptions, selectedPetId) {
  const options = petOptions || [];
  const labels = ['全部'].concat(options.map((item) => item.name));
  let index = 0;
  if (selectedPetId && selectedPetId !== 'all') {
    const found = options.findIndex((item) => item.id === selectedPetId);
    index = found >= 0 ? found + 1 : 0;
  }
  return {
    petPickerLabels: labels,
    petPickerIndex: index,
    selectedPetLabel: labels[index] || '全部',
    selectedPetId: index === 0 ? 'all' : (options[index - 1] && options[index - 1].id) || 'all'
  };
}

function buildDateOptions(logs) {
  const seen = {};
  const options = [];
  (logs || []).forEach((log) => {
    const dateKey = log.dateKey || toDateKey(log.createTime) || toDateKey(log.time) || '';
    if (!dateKey || seen[dateKey]) return;
    seen[dateKey] = true;
    options.push({
      id: dateKey,
      name: formatDateLabel(dateKey) || dateKey
    });
  });
  return options.sort((a, b) => b.id.localeCompare(a.id));
}

function buildDatePickerState(dateOptions, selectedDateKey) {
  const options = dateOptions || [];
  const labels = ['全部'].concat(options.map((item) => item.name));
  let index = 0;
  if (selectedDateKey && selectedDateKey !== 'all') {
    const found = options.findIndex((item) => item.id === selectedDateKey);
    index = found >= 0 ? found + 1 : 0;
  }
  return {
    dateOptions: options,
    datePickerLabels: labels,
    datePickerIndex: index,
    selectedDateLabel: labels[index] || '全部',
    selectedDateKey: index === 0 ? 'all' : (options[index - 1] && options[index - 1].id) || 'all'
  };
}

function windowTimelineByLogCount(fullTimeline, limit) {
  const groups = fullTimeline || [];
  if (!limit || limit <= 0) return [];
  let count = 0;
  const result = [];
  for (let i = 0; i < groups.length; i++) {
    if (count >= limit) break;
    const group = groups[i];
    const logs = (group && group.logs) || [];
    const remaining = limit - count;
    if (logs.length <= remaining) {
      result.push(group);
      count += logs.length;
    } else {
      result.push({
        ...group,
        logs: logs.slice(0, remaining)
      });
      count = limit;
    }
  }
  return result;
}

function countTimelineLogs(timeline) {
  return (timeline || []).reduce((sum, group) => sum + (((group && group.logs) || []).length), 0);
}

const LOG_PAGE_SIZE = 20;

Page({
  data: {
    loading: true,
    timeline: [],
    hasMore: false,
    showFilterBar: false,
    petOptions: [],
    petPickerLabels: ['全部'],
    petPickerIndex: 0,
    selectedPetId: 'all',
    selectedPetLabel: '全部',
    dateOptions: [],
    datePickerLabels: ['全部'],
    datePickerIndex: 0,
    selectedDateKey: 'all',
    selectedDateLabel: '全部',
    deleting: false
  },

  onLoad(options) {
    this._prefillOrderId = (options && options.orderId) || '';
    this._hasLoadedOnce = false;
    enableDailyLogShareMenu();
    this._paintFromLocal();
  },

  onShow() {
    // 关闭 previewMedia/previewImage 会再次触发 onShow，跳过本次自动刷新
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
    enableDailyLogShareMenu();
    this._paintFromLocal();
    app.ensureCloudAndLogin({ silent: true }).then(() => {
      if (!app.canAccessMerchantBackend()) {
        wx.navigateBack();
        return;
      }
      this.loadLogs({ force: false });
    });
  },

  onPullDownRefresh() {
    this.loadLogs({ force: true }).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    const full = this._fullTimeline || [];
    const total = countTimelineLogs(full);
    const limit = this._listLimit || LOG_PAGE_SIZE;
    if (limit >= total) return;
    this._listLimit = limit + LOG_PAGE_SIZE;
    this._publishTimelineWindow();
  },

  onFilterPetChange(e) {
    const index = Number(e.detail && e.detail.value);
    const labels = this.data.petPickerLabels || ['全部'];
    const options = this.data.petOptions || [];
    const safeIndex = Number.isFinite(index) && index >= 0 && index < labels.length ? index : 0;
    const selectedPetId = safeIndex === 0
      ? 'all'
      : ((options[safeIndex - 1] && options[safeIndex - 1].id) || 'all');
    if (selectedPetId === this.data.selectedPetId && safeIndex === this.data.petPickerIndex) return;
    this.setData({
      petPickerIndex: safeIndex,
      selectedPetId,
      selectedPetLabel: labels[safeIndex] || '全部'
    });
    this._syncDatePickerAndApply();
  },

  onFilterDateChange(e) {
    const index = Number(e.detail && e.detail.value);
    const labels = this.data.datePickerLabels || ['全部'];
    const options = this.data.dateOptions || [];
    const safeIndex = Number.isFinite(index) && index >= 0 && index < labels.length ? index : 0;
    const selectedDateKey = safeIndex === 0
      ? 'all'
      : ((options[safeIndex - 1] && options[safeIndex - 1].id) || 'all');
    if (selectedDateKey === this.data.selectedDateKey && safeIndex === this.data.datePickerIndex) return;
    this.setData({
      datePickerIndex: safeIndex,
      selectedDateKey,
      selectedDateLabel: labels[safeIndex] || '全部'
    });
    this._applyFilter();
  },

  _getLocalScopedLogs(orderIds) {
    const all = app.getDailyLogs() || [];
    // 无明确订单范围时展示本地全部打卡（含已完成订单）
    if (!(orderIds || []).length) return dedupeDailyLogs(all);
    const idSet = new Set(orderIds);
    return dedupeDailyLogs(all.filter((item) => idSet.has(item.orderId || item.order_id)));
  },

  _paintFromLocal() {
    if (app.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      this._renderFromCache(merchantDemo.getDemoDailyLogs(), { fromLocal: true });
      return;
    }
    const orders = app.getOrders();
    const orderIds = getScopedOrderIds(orders);
    const logs = this._getLocalScopedLogs(orderIds);
    if (!logs.length && !orderIds.length) {
      // 仍尝试展示本地缓存中的店铺打卡
      const cached = dedupeDailyLogs(app.getDailyLogs() || []);
      if (!cached.length) return;
      this._renderFromCache(cached, { fromLocal: true });
      return;
    }
    this._renderFromCache(logs.length ? logs : dedupeDailyLogs(app.getDailyLogs() || []), { fromLocal: true });
  },

  _resolveSelectedPetId(petOptions) {
    if (this._prefillOrderId) {
      const matched = (petOptions || []).find((item) => item.orderId === this._prefillOrderId);
      if (matched) {
        this._prefillOrderId = '';
        return matched.id;
      }
      // 订单列表尚未就绪时保留预选，避免被清掉
      if (!(petOptions || []).length) {
        return this.data.selectedPetId || 'all';
      }
      this._prefillOrderId = '';
    }
    const current = this.data.selectedPetId;
    if (current && current !== 'all' && (petOptions || []).some((item) => item.id === current)) {
      return current;
    }
    return 'all';
  },

  _syncDatePickerAndApply() {
    const petFiltered = filterLogsByPet(this._allEnrichedLogs || [], this.data.selectedPetId);
    const dateState = buildDatePickerState(buildDateOptions(petFiltered), this.data.selectedDateKey);
    this.setData(dateState, () => {
      this._applyFilter();
    });
  },

  _publishTimelineWindow(extra = {}) {
    const full = this._fullTimeline || [];
    const limit = this._listLimit || LOG_PAGE_SIZE;
    const total = countTimelineLogs(full);
    this.setData({
      ...extra,
      timeline: windowTimelineByLogCount(full, limit),
      hasMore: total > limit
    });
  },

  _applyFilter() {
    const selectedPetId = this.data.selectedPetId || 'all';
    const selectedDateKey = this.data.selectedDateKey || 'all';
    let filtered = filterLogsByPet(this._allEnrichedLogs || [], selectedPetId);
    if (selectedDateKey && selectedDateKey !== 'all') {
      filtered = filtered.filter((log) => (log.dateKey || '') === selectedDateKey);
    }
    this._fullTimeline = groupLogsByDate(filtered);
    this._listLimit = LOG_PAGE_SIZE;
    const extra = {};
    // 本地尚无记录时保持 loading，避免先闪「暂无」再被网络结果替换
    if (this._hasLoadedOnce || filtered.length) {
      extra.loading = false;
    }
    this._publishTimelineWindow(extra);
  },

  _renderFromCache(logs, options = {}) {
    const fromLocal = !!(options && options.fromLocal);
    const orders = app.getOrders();
    const pets = app.getPets();
    const petOptions = buildPetOptions(orders, pets);
    const selectedPetId = this._resolveSelectedPetId(petOptions);
    const nextLogs = logs !== undefined ? (logs || []) : (this._rawLogs || []);
    this._allEnrichedLogs = enrichLogs(nextLogs, orders, pets);
    if (logs !== undefined) {
      this._rawLogs = logs || [];
    }
    if (!fromLocal) {
      this._hasLoadedOnce = true;
    }
    const petState = buildPetPickerState(petOptions, selectedPetId);
    const petFiltered = filterLogsByPet(this._allEnrichedLogs, petState.selectedPetId);
    const dateState = buildDatePickerState(buildDateOptions(petFiltered), this.data.selectedDateKey);
    this.setData({
      petOptions,
      showFilterBar: petOptions.length > 0,
      ...petState,
      ...dateState
    }, () => {
      this._applyFilter();
    });
  },

  loadLogs({ force } = {}) {
    if (app.isMerchantDemoMode()) {
      merchantDemo.ensureDemoData();
      this._renderFromCache(merchantDemo.getDemoDailyLogs());
      return Promise.resolve();
    }

    const hasContent = !!(this.data.timeline.length || (this._allEnrichedLogs && this._allEnrichedLogs.length));
    if (!hasContent) {
      this.setData({ loading: true });
    }

    const shop = app.getShop();
    const storeId = (shop && shop.store_id) || app.globalData.merchantStoreId || '';
    const scopedIds = getScopedOrderIds(app.getOrders());

    // 订单刷新与打卡记录请求彼此独立，使用缓存店铺/订单范围并行发起，减少首屏等待。
    const refreshPromise = refreshMerchantOrders(app, { force });
    const logsPromise = storeId
      ? dailyApi.fetchMerchantBoardingLogs(storeId, scopedIds)
      : refreshPromise.then(() => {
        const freshShop = app.getShop();
        const sid = (freshShop && freshShop.store_id) || '';
        return dailyApi.fetchMerchantBoardingLogs(sid, getScopedOrderIds(app.getOrders()));
      });
    return Promise.all([refreshPromise, logsPromise])
      .then((results) => {
        const logs = results[1];
        const list = logs || [];
        const merged = dedupeDailyLogs([].concat(app.getDailyLogs() || [], list));
        app.patchDailyLogs(merged);
        this._renderFromCache(list.length ? list : this._getLocalScopedLogs(scopedIds));
      })
      .catch(() => {
        if (!hasContent) {
          this._renderFromCache(this._getLocalScopedLogs(getScopedOrderIds(app.getOrders())));
        } else if (!this._hasLoadedOnce) {
          this.setData({ loading: false });
        }
      })
      .finally(() => {
        if (this._hasLoadedOnce) {
          this.setData({ loading: false });
        }
      });
  },

  onPreviewImage(e) {
    const { groupIndex, logIndex, url } = e.currentTarget.dataset;
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log || !url) return;
    previewImages(url, log.images || []).then((opened) => {
      if (opened) this._skipNextShowRefresh = true;
    });
  },

  onPreviewVideo(e) {
    const { groupIndex, logIndex, url, videoIndex } = e.currentTarget.dataset;
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log) return;
    const sources = (log.videoItems || []).map((item) => item.url).filter(Boolean);
    previewVideo(url || log.videoUrl || log.video, sources, videoIndex).then((opened) => {
      if (opened) this._skipNextShowRefresh = true;
    });
  },

  onCommentsChange(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const logIndex = Number(e.currentTarget.dataset.logIndex);
    const comments = (e.detail && e.detail.comments) || [];
    const logId = (e.detail && e.detail.logId) || '';
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log) return;

    const nextTimeline = (this.data.timeline || []).map((g, gi) => {
      if (gi !== groupIndex) return g;
      return {
        ...g,
        logs: (g.logs || []).map((item, li) => (
          li === logIndex ? { ...item, comments } : item
        ))
      };
    });
    this.setData({ timeline: nextTimeline });

    const matchId = logId || log.id || log.log_id;
    if (this._allEnrichedLogs) {
      this._allEnrichedLogs = this._allEnrichedLogs.map((item) => {
        const id = item.id || item.log_id;
        return id === matchId ? { ...item, comments } : item;
      });
    }
    if (this._rawLogs) {
      this._rawLogs = this._rawLogs.map((item) => {
        const id = item.id || item.log_id;
        return id === matchId ? { ...item, comments } : item;
      });
    }
    if (this._fullTimeline) {
      this._fullTimeline = (this._fullTimeline || []).map((g) => ({
        ...g,
        logs: (g.logs || []).map((item) => {
          const id = item.id || item.log_id;
          return id === matchId ? { ...item, comments } : item;
        })
      }));
    }
  },

  onEditScheduled(e) {
    const { groupIndex, logIndex } = e.currentTarget.dataset;
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log || !log.canDeleteScheduled) return;
    const logId = log.id || log.log_id;
    if (!logId) return;

    try {
      wx.setStorageSync('daily_check_edit_log', log);
    } catch (err) {
      // ignore storage failures; page can still read via eventChannel
    }

    wx.navigateTo({
      url: `/packageBiz/daily-check/daily-check?editLogId=${encodeURIComponent(logId)}`,
      success: (res) => {
        if (res && res.eventChannel) {
          res.eventChannel.emit('editLog', log);
        }
      }
    });
  },

  onDeleteScheduled(e) {
    if (this.data.deleting) return;
    const { groupIndex, logIndex } = e.currentTarget.dataset;
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log || !log.canDeleteScheduled) return;
    const logId = log.id || log.log_id;
    if (!logId) return;

    wx.showModal({
      title: '删除定时打卡',
      content: `确认删除「${log.petName || '宠物'}」定时于 ${log.timeLabel || ''} 的打卡吗？删除后不会发送给宠主。`,
      confirmColor: '#D96F55',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ deleting: true });
        wx.showLoading({ title: '删除中', mask: true });
        app.deleteDailyLog(logId)
          .then(() => {
            const nextRaw = (this._rawLogs || []).filter((item) => {
              const id = item.id || item.log_id;
              return id !== logId;
            });
            this._renderFromCache(nextRaw);
            wx.showToast({ title: '已删除定时', icon: 'success' });
          })
          .catch((err) => {
            wx.showToast({
              title: (err && err.message) || '删除失败',
              icon: 'none'
            });
          })
          .finally(() => {
            wx.hideLoading();
            this.setData({ deleting: false });
          });
      }
    });
  },

  onShareAppMessage(res) {
    if (res && res.from === 'button' && res.target) {
      const groupIndex = Number(res.target.dataset.groupIndex);
      const logIndex = Number(res.target.dataset.logIndex);
      const group = this.data.timeline[groupIndex];
      const log = group && group.logs && group.logs[logIndex];
      if (log && !log.isScheduled) {
        return buildDailyLogShareConfig(log);
      }
    }
    // 右上角转发也不带 store_id，避免误绑店
    return buildDailyLogShareConfig(null);
  }
});
