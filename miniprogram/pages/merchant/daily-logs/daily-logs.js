const app = getApp();
const { groupLogsByDate, toDateKey, formatDateLabel } = require('../../../utils/dailyTimeline');
const { dedupeDailyLogs } = require('../../../utils/dailyLogUtil');
const { previewImages, previewVideo } = require('../../../utils/dailyPreview');
const merchantDemo = require('../../../utils/merchantDemo');
const { refreshMerchantOrders } = require('../../../utils/orderRefresh');
const { deriveVideoCoverUrl } = require('../../../utils/mediaUrl');

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
    const videoUrl = log.videoUrl || log.video || '';
    const dateKey = toDateKey(log.createTime) || toDateKey(log.time) || '';
    return {
      ...log,
      orderId: log.orderId || log.order_id || (order ? order.id : ''),
      petId: order ? (order.petId || '') : '',
      petPhoto: pet ? pet.photo : '',
      petName: log.petName || (order ? order.petName : '未知宠物'),
      dateKey,
      videoUrl,
      videoCoverUrl: log.videoCoverUrl || log.videoCover || deriveVideoCoverUrl(videoUrl) || ''
    };
  });
}

function buildPetOptions(orders, pets) {
  const boardingOrders = (orders || []).filter((o) => o.status === 'boarding');
  const petMap = {};
  (pets || []).forEach((item) => {
    if (item && item.id) petMap[item.id] = item;
  });
  const seen = {};
  const options = [];
  boardingOrders.forEach((order) => {
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

function getBoardingOrderIds(orders) {
  return (orders || [])
    .filter((o) => o.status === 'boarding')
    .map((item) => item.id || item.order_id)
    .filter(Boolean);
}

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
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

Page({
  data: {
    loading: true,
    timeline: [],
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
    selectedDateLabel: '全部'
  },

  onLoad(options) {
    this._prefillOrderId = (options && options.orderId) || '';
    this._hasLoadedOnce = false;
    this._paintFromLocal();
  },

  onShow() {
    // 关闭 previewMedia/previewImage 会再次触发 onShow，跳过本次自动刷新
    if (this._skipNextShowRefresh) {
      this._skipNextShowRefresh = false;
      return;
    }
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
    const orderIds = getBoardingOrderIds(orders);
    const logs = this._getLocalScopedLogs(orderIds);
    if (!logs.length && !orderIds.length) return;
    this._renderFromCache(logs, { fromLocal: true });
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

  _applyFilter() {
    const selectedPetId = this.data.selectedPetId || 'all';
    const selectedDateKey = this.data.selectedDateKey || 'all';
    let filtered = filterLogsByPet(this._allEnrichedLogs || [], selectedPetId);
    if (selectedDateKey && selectedDateKey !== 'all') {
      filtered = filtered.filter((log) => (log.dateKey || '') === selectedDateKey);
    }
    const patch = { timeline: groupLogsByDate(filtered) };
    // 本地尚无记录时保持 loading，避免先闪「暂无」再被网络结果替换
    if (this._hasLoadedOnce || filtered.length) {
      patch.loading = false;
    }
    this.setData(patch);
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

    const cachedOrderIds = getBoardingOrderIds(app.getOrders());
    const logsTask = cachedOrderIds.length
      ? app.loadDailyLogsForOrders(cachedOrderIds, { force })
      : Promise.resolve(null);
    const ordersTask = refreshMerchantOrders(app, { force });

    return Promise.all([logsTask, ordersTask])
      .then(([cachedLogs]) => {
        const freshOrderIds = getBoardingOrderIds(app.getOrders());
        if (!freshOrderIds.length) {
          this._renderFromCache([]);
          return;
        }
        // 在住订单集合变化，或进入时本地没有订单 ID：补一次按最新范围拉取
        if (!sameIdSet(cachedOrderIds, freshOrderIds)) {
          return app.loadDailyLogsForOrders(freshOrderIds, { force: true })
            .then((logs) => this._renderFromCache(logs || []));
        }
        if (cachedLogs) {
          this._renderFromCache(cachedLogs);
          return;
        }
        return app.loadDailyLogsForOrders(freshOrderIds, { force })
          .then((logs) => this._renderFromCache(logs || []));
      })
      .catch(() => {
        if (!hasContent) {
          this._renderFromCache(this._getLocalScopedLogs(getBoardingOrderIds(app.getOrders())));
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
    const { groupIndex, logIndex } = e.currentTarget.dataset;
    const group = this.data.timeline[groupIndex];
    const log = group && group.logs && group.logs[logIndex];
    if (!log) return;
    previewVideo(log.videoUrl || log.video).then((opened) => {
      if (opened) this._skipNextShowRefresh = true;
    });
  }
});
