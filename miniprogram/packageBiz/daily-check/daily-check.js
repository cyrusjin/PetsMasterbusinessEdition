const app = getApp();
const util = require('../../utils/util');
const dailyMedia = require('../utils/dailyMedia');
const dailyApi = require('../../utils/daily');
const merchantDemo = require('../../utils/merchantDemo');
const { buildDailyCheckOrderOptions } = require('../../utils/dailyStats');
const { showValidationAlert } = require('../../utils/formAlert');
const { refreshMerchantOrders } = require('../../utils/orderRefresh');
const dailyQuickPhrases = require('../utils/dailyQuickPhrases');

function getDefaultCheckItems() {
  return [
    { key: 'feed', label: '喂食', icon: '🍖', checked: false },
    { key: 'water', label: '饮水', icon: '💧', checked: false },
    { key: 'walk', label: '遛弯', icon: '🚶', checked: false },
    { key: 'poop', label: '排便', icon: '💩', checked: false },
    { key: 'play', label: '玩耍', icon: '🎾', checked: false },
    { key: 'medicine', label: '喂药', icon: '💊', checked: false },
    { key: 'spirit', label: '精神状态', icon: '😊', checked: true },
    { key: 'arrival', label: '到店检查', icon: '🏠', checked: false },
    { key: 'departure', label: '离店检查', icon: '🚪', checked: false }
  ];
}

function getMediaStats(mediaList) {
  const list = mediaList || [];
  const imageCount = list.filter((item) => item.type === 'image').length;
  const hasVideo = list.some((item) => item.type === 'video');
  return {
    imageCount,
    hasVideo,
    canAddMedia: imageCount < 9 || !hasVideo
  };
}

function splitMediaList(mediaList) {
  const images = [];
  let video = '';
  let videoThumb = '';
  (mediaList || []).forEach((item) => {
    if (item.type === 'video' && !video) {
      video = item.path;
      videoThumb = item.thumb || '';
    } else if (item.type === 'image') {
      images.push(item.path);
    }
  });
  return { images, video, videoThumb };
}

function createMediaId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

Page({
  data: {
    orderOptions: [],
    selectedCount: 0,
    checkItems: getDefaultCheckItems(),
    desc: '',
    quickPhrases: [],
    mediaList: [],
    canAddMedia: true,
    submitting: false,
    loadingPets: false,
    showSchedulePicker: false,
    minScheduleDate: '',
    scheduleDate: '',
    scheduleTime: '',
    editMode: false,
    editLogId: '',
    petSelectLocked: false
  },

  onLoad(options) {
    this._prefillOrderId = (options && options.orderId) || '';
    this._selectedOrderIds = [];
    this._customPhrases = [];
    this._hiddenDefaultPhrases = [];
    this._editLogId = (options && options.editLogId) || '';
    this._editLog = null;
    this._loadQuickPhrases();
    this._initScheduleDefaults();

    if (this._editLogId) {
      this.setData({
        editMode: true,
        editLogId: this._editLogId,
        petSelectLocked: true
      });
      wx.setNavigationBarTitle({ title: '修改定时打卡' });
      this._bindEditLogChannel();
      this._tryLoadEditLogFromStorage();
    }
  },

  _bindEditLogChannel() {
    try {
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (!channel || !channel.on) return;
      channel.on('editLog', (log) => {
        this._applyEditLog(log);
      });
    } catch (err) {
      // ignore
    }
  },

  _tryLoadEditLogFromStorage() {
    if (this._editLog) return;
    try {
      const cached = wx.getStorageSync('daily_check_edit_log');
      if (cached && (cached.id === this._editLogId || cached.log_id === this._editLogId)) {
        this._applyEditLog(cached);
        wx.removeStorageSync('daily_check_edit_log');
      }
    } catch (err) {
      // ignore
    }
  },

  _applyEditLog(log) {
    if (!log || this._editLogApplied) return;
    const logId = log.id || log.log_id;
    if (this._editLogId && logId && logId !== this._editLogId) return;
    this._editLogApplied = true;
    this._editLog = log;
    this._editLogId = logId || this._editLogId;

    const orderId = log.orderId || log.order_id || '';
    this._prefillOrderId = orderId;
    this._selectedOrderIds = orderId ? [orderId] : [];

    const checks = Array.isArray(log.checks) ? log.checks : [];
    const checkSet = new Set(checks);
    const checkItems = getDefaultCheckItems().map((item) => ({
      ...item,
      checked: checkSet.has(item.label)
    }));

    const mediaList = [];
    (log.images || []).forEach((path) => {
      if (!path) return;
      mediaList.push({
        id: createMediaId('img'),
        type: 'image',
        path,
        thumb: path
      });
    });
    const videoPath = log.videoUrl || log.video || '';
    if (videoPath) {
      mediaList.push({
        id: createMediaId('vid'),
        type: 'video',
        path: videoPath,
        thumb: log.videoCoverUrl || log.videoCover || ''
      });
    }

    const scheduledAt = Number(log.scheduledAt) || 0;
    const schedulePatch = {};
    if (scheduledAt > 0) {
      const date = new Date(scheduledAt);
      const pad = (n) => String(n).padStart(2, '0');
      schedulePatch.scheduleDate = util.formatDate(date);
      schedulePatch.scheduleTime = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    const stats = getMediaStats(mediaList);
    const patch = {
      editMode: true,
      editLogId: this._editLogId,
      petSelectLocked: true,
      checkItems,
      desc: log.description || '',
      mediaList,
      canAddMedia: stats.canAddMedia,
      ...schedulePatch
    };

    if (orderId && Array.isArray(this.data.orderOptions) && this.data.orderOptions.length) {
      const orderOptions = this.data.orderOptions.map((item) => ({
        ...item,
        selected: item.id === orderId
      }));
      this._selectedOrderIds = [orderId];
      patch.orderOptions = orderOptions;
      patch.selectedCount = 1;
    }

    this.setData(patch);
    this._syncQuickPhrases(log.description || '');
  },

  _initScheduleDefaults() {
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    this.setData({
      minScheduleDate: util.formatDate(now),
      scheduleDate: util.formatDate(later),
      scheduleTime: `${pad(later.getHours())}:${pad(later.getMinutes())}`
    });
  },

  _getStoreId() {
    const shop = app.getShop() || {};
    return shop.store_id || app.globalData.merchantStoreId || app.getStoreId() || '';
  },

  _loadQuickPhrases() {
    const prefs = dailyQuickPhrases.loadPhrasePrefs(this._getStoreId());
    this._customPhrases = prefs.customPhrases;
    this._hiddenDefaultPhrases = prefs.hiddenDefaultPhrases;
    this._syncQuickPhrases(this.data.desc);
  },

  _syncQuickPhrases(desc) {
    this.setData({
      quickPhrases: dailyQuickPhrases.buildQuickPhrases(
        desc,
        this._customPhrases,
        this._hiddenDefaultPhrases
      )
    });
  },

  onShow() {
    if (app.canAccessMerchantBackend()) {
      this._loadQuickPhrases();
      this._applyFromCache();
    }
    this._refreshData({ force: false });
  },

  onPullDownRefresh() {
    this._refreshData({ force: true })
      .finally(() => wx.stopPullDownRefresh());
  },

  _applyFromCache(logs) {
    const boardingOrders = app.getOrders().filter((o) => o.status === 'boarding');
    const selectedSet = new Set(this._selectedOrderIds);
    if (this._prefillOrderId) {
      selectedSet.add(this._prefillOrderId);
    }
    const orderOptions = buildDailyCheckOrderOptions(boardingOrders, logs || [], {
      selectedIds: [...selectedSet]
    });
    this._selectedOrderIds = orderOptions.filter((item) => item.selected).map((item) => item.id);
    if (this._prefillOrderId) {
      this._prefillOrderId = '';
    }
    this.setData({
      orderOptions,
      selectedCount: this._selectedOrderIds.length,
      loadingPets: false
    });
  },

  _refreshData({ force } = {}) {
    if (this._loadingPets && !force) return Promise.resolve();
    this._loadingPets = true;
    if (!this.data.orderOptions.length) {
      this.setData({ loadingPets: true });
    }

    return app.ensureCloudAndLogin({ silent: !force }).then(() => {
      if (!app.canAccessMerchantBackend()) return null;
      if (app.isMerchantDemoMode()) {
        merchantDemo.ensureDemoData();
        return refreshMerchantOrders(app, { force });
      }
      if (!app.isMerchantPending()) {
        dailyApi.initDatabase().catch(() => {});
      }
      return refreshMerchantOrders(app, { force });
    }).then(() => {
      if (!app.canAccessMerchantBackend()) return;
      const boardingOrders = app.getOrders().filter((o) => o.status === 'boarding');
      const orderIds = boardingOrders.map((o) => o.id).filter(Boolean);

      if (app.isMerchantDemoMode()) {
        this._applyFromCache(merchantDemo.getDemoDailyLogs());
        return;
      }

      if (!orderIds.length) {
        this._applyFromCache([]);
        return;
      }

      return dailyApi.fetchDailyLogsForOrders(orderIds)
        .then((logs) => this._applyFromCache(logs || []))
        .catch(() => this._applyFromCache([]));
    }).finally(() => {
      this._loadingPets = false;
      this.setData({ loadingPets: false });
    });
  },

  getSelectedOrders() {
    const ids = new Set(this._selectedOrderIds);
    return app.getOrders().filter((order) => ids.has(order.id));
  },

  onToggleOrder(e) {
    if (this.data.petSelectLocked || this.data.editMode) {
      wx.showToast({ title: '修改定时时不可更换宠物', icon: 'none' });
      return;
    }
    const id = e.currentTarget.dataset.id;
    const orderOptions = this.data.orderOptions.map((item) => (
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
    this._selectedOrderIds = orderOptions.filter((item) => item.selected).map((item) => item.id);
    this.setData({
      orderOptions,
      selectedCount: this._selectedOrderIds.length
    });
  },

  onSelectAll() {
    if (this.data.petSelectLocked || this.data.editMode) {
      wx.showToast({ title: '修改定时时不可更换宠物', icon: 'none' });
      return;
    }
    const allSelected = this.data.selectedCount === this.data.orderOptions.length;
    const orderOptions = this.data.orderOptions.map((item) => ({
      ...item,
      selected: !allSelected
    }));
    this._selectedOrderIds = allSelected ? [] : orderOptions.map((item) => item.id);
    this.setData({
      orderOptions,
      selectedCount: this._selectedOrderIds.length
    });
  },

  onToggleCheck(e) {
    const key = e.currentTarget.dataset.key;
    const items = this.data.checkItems.map((item) => (
      item.key === key ? { ...item, checked: !item.checked } : item
    ));
    this.setData({ checkItems: items });
  },

  onDesc(e) {
    const desc = e.detail.value;
    this.setData({ desc });
    this._syncQuickPhrases(desc);
  },

  onQuickPhrase(e) {
    const phrase = e.currentTarget.dataset.phrase;
    if (!phrase) return;
    const desc = dailyQuickPhrases.toggleQuickPhrase(this.data.desc, phrase);
    this.setData({ desc });
    this._syncQuickPhrases(desc);
  },

  onAddQuickPhrase() {
    wx.showModal({
      title: '添加自定义用语',
      editable: true,
      placeholderText: '如：今天特别乖，请放心',
      confirmColor: '#E98657',
      success: (res) => {
        if (!res.confirm) return;
        const result = dailyQuickPhrases.addCustomPhrase(
          this._getStoreId(),
          res.content,
          {
            customPhrases: this._customPhrases,
            hiddenDefaultPhrases: this._hiddenDefaultPhrases
          }
        );
        if (!result.ok) {
          wx.showToast({ title: result.message, icon: 'none' });
          return;
        }
        this._customPhrases = result.customPhrases;
        this._hiddenDefaultPhrases = result.hiddenDefaultPhrases;
        this._syncQuickPhrases(this.data.desc);
        wx.showToast({ title: '已添加', icon: 'success' });
      }
    });
  },

  onRemoveQuickPhrase(e) {
    const phrase = e.currentTarget.dataset.phrase;
    if (!phrase) return;
    wx.showModal({
      title: '删除快捷用语',
      content: `确定删除「${phrase}」吗？`,
      confirmColor: '#E98657',
      success: (res) => {
        if (!res.confirm) return;
        const prefs = dailyQuickPhrases.removePhrase(
          this._getStoreId(),
          phrase,
          {
            customPhrases: this._customPhrases,
            hiddenDefaultPhrases: this._hiddenDefaultPhrases
          }
        );
        this._customPhrases = prefs.customPhrases;
        this._hiddenDefaultPhrases = prefs.hiddenDefaultPhrases;
        const desc = dailyQuickPhrases.removePhraseFromDesc(this.data.desc, phrase);
        if (desc !== this.data.desc) {
          this.setData({ desc });
        }
        this._syncQuickPhrases(desc);
      }
    });
  },

  onChooseMedia() {
    const mediaList = this.data.mediaList || [];
    const { imageCount, hasVideo } = getMediaStats(mediaList);
    const imageSlots = 9 - imageCount;
    const videoSlots = hasVideo ? 0 : 1;
    if (imageSlots <= 0 && videoSlots <= 0) return;

    const count = Math.min(9, imageSlots + videoSlots);
    const mediaType = imageSlots > 0 && videoSlots > 0
      ? ['image', 'video']
      : (imageSlots > 0 ? ['image'] : ['video']);

    wx.chooseMedia({
      count,
      mediaType,
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      maxDuration: 60,
      compressed: true,
      success: (res) => {
        const nextList = [...mediaList];
        let nextImageCount = imageCount;
        let nextHasVideo = hasVideo;

        (res.tempFiles || []).forEach((file) => {
          if (file.fileType === 'video') {
            if (nextHasVideo) return;
            nextList.push({
              id: createMediaId('video'),
              type: 'video',
              path: file.tempFilePath,
              thumb: file.thumbTempFilePath || ''
            });
            nextHasVideo = true;
            return;
          }
          if (nextImageCount >= 9) return;
          nextList.push({
            id: createMediaId('image'),
            type: 'image',
            path: file.tempFilePath,
            thumb: file.tempFilePath
          });
          nextImageCount += 1;
        });

        const stats = getMediaStats(nextList);
        this.setData({
          mediaList: nextList,
          canAddMedia: stats.canAddMedia
        });
      }
    });
  },

  onRemoveMedia(e) {
    const id = e.currentTarget.dataset.id;
    const mediaList = (this.data.mediaList || []).filter((item) => item.id !== id);
    const stats = getMediaStats(mediaList);
    this.setData({
      mediaList,
      canAddMedia: stats.canAddMedia
    });
  },

  resetForm() {
    this.setData({
      desc: '',
      mediaList: [],
      canAddMedia: true,
      checkItems: getDefaultCheckItems()
    });
    this._syncQuickPhrases('');
  },

  onSubmit() {
    if (this.data.submitting) return;
    if (this.data.editMode) {
      this.onScheduleTap();
      return;
    }
    const selectedOrders = this._validateBeforeSubmit();
    if (!selectedOrders) return;
    this.doSubmit(selectedOrders);
  },

  onScheduleTap() {
    if (this.data.submitting) return;
    const selectedOrders = this._validateBeforeSubmit();
    if (!selectedOrders) return;
    this._pendingScheduleOrders = selectedOrders;
    if (!this.data.editMode) {
      this._initScheduleDefaults();
    }
    this.setData({ showSchedulePicker: true });
  },

  onCloseSchedulePicker() {
    if (this.data.submitting) return;
    this._pendingScheduleOrders = null;
    this.setData({ showSchedulePicker: false });
  },

  onSchedulePanelTap() {},

  onScheduleDateChange(e) {
    this.setData({ scheduleDate: e.detail.value });
  },

  onScheduleTimeChange(e) {
    this.setData({ scheduleTime: e.detail.value });
  },

  onConfirmSchedule() {
    if (this.data.submitting) return;
    const selectedOrders = this._pendingScheduleOrders || this.getSelectedOrders();
    if (!selectedOrders.length) {
      showValidationAlert('请选择宠物');
      return;
    }
    const scheduledAt = this._resolveScheduleTimestamp({
      allowKeepExisting: !!this.data.editMode
    });
    if (!scheduledAt) return;
    this.setData({ showSchedulePicker: false });
    this.doSubmit(selectedOrders, { scheduledAt });
  },

  _resolveScheduleTimestamp(options = {}) {
    const { scheduleDate, scheduleTime } = this.data;
    if (!scheduleDate || !scheduleTime) {
      showValidationAlert('请选择完整的日期和时间');
      return 0;
    }
    const ts = new Date(`${scheduleDate}T${scheduleTime}:00`).getTime();
    if (!Number.isFinite(ts)) {
      showValidationAlert('时间格式无效，请重新选择');
      return 0;
    }
    const existingAt = Number(this._editLog && this._editLog.scheduledAt) || 0;
    const keepExisting = !!(options.allowKeepExisting && existingAt && ts === existingAt);
    if (ts <= Date.now() + (keepExisting ? 0 : 60 * 1000)) {
      showValidationAlert(keepExisting ? '发送时间已过期，请重新选择' : '请选择至少 1 分钟后的时间');
      return 0;
    }
    return ts;
  },

  _validateBeforeSubmit() {
    const selectedOrders = this.getSelectedOrders();
    if (!selectedOrders.length) {
      showValidationAlert('请选择宠物');
      return null;
    }
    if (this.data.editMode && selectedOrders.length > 1) {
      showValidationAlert('修改定时时只能选择一只宠物');
      return null;
    }

    const { checkItems, mediaList } = this.data;
    const checks = checkItems.filter((item) => item.checked).map((item) => item.label);
    if (!checks.length) {
      wx.showModal({
        title: '提示',
        content: '请至少选择一项打卡项目',
        showCancel: false,
        confirmColor: '#E98657'
      });
      return null;
    }

    if (!mediaList.length) {
      showValidationAlert('请上传照片或视频');
      return null;
    }

    return selectedOrders;
  },

  doSubmit(selectedOrders, options = {}) {
    if (this.data.submitting) return;

    const editMode = !!this.data.editMode;
    const editLogId = this._editLogId || this.data.editLogId;
    const scheduledAt = Number(options && options.scheduledAt) || 0;
    const isScheduled = scheduledAt > Date.now();
    if (editMode && !isScheduled) {
      showValidationAlert('请选择定时发送时间');
      return;
    }

    const { checkItems, desc, mediaList } = this.data;
    const { images, video, videoThumb } = splitMediaList(mediaList);
    const checks = checkItems.filter((item) => item.checked).map((item) => item.label);
    const shop = app.getShop() || {};
    const storeId = shop.store_id || app.globalData.merchantStoreId || '';
    const uploadOrderId = selectedOrders[0].id;
    const time = util.formatDateTime(isScheduled ? scheduledAt : new Date());

    this.setData({ submitting: true });
    wx.showLoading({ title: editMode ? '保存中' : (isScheduled ? '定时中' : '提交中'), mask: true });

    const submitLogs = (cloudImages, cloudVideo, cloudVideoCover) => {
      wx.showLoading({ title: editMode ? '保存中' : (isScheduled ? '定时中' : '提交中'), mask: true });
      if (editMode) {
        const payload = {
          id: editLogId,
          log_id: editLogId,
          orderId: selectedOrders[0].id,
          petName: selectedOrders[0].petName,
          checks,
          description: desc,
          images: cloudImages,
          video: cloudVideo,
          videoCover: cloudVideoCover,
          notifyOwner: true,
          isAbnormal: false,
          time,
          scheduledAt,
          isScheduled: true,
          status: 'scheduled'
        };
        return app.updateDailyLog(payload).then((res) => [res]);
      }

      const tasks = selectedOrders.map((order) => {
        const payload = {
          orderId: order.id,
          petName: order.petName,
          checks,
          description: desc,
          images: cloudImages,
          video: cloudVideo,
          videoCover: cloudVideoCover,
          notifyOwner: isScheduled,
          isAbnormal: false,
          time
        };
        if (isScheduled) {
          payload.scheduledAt = scheduledAt;
          payload.isScheduled = true;
          payload.status = 'scheduled';
        }
        return app.saveDailyLog(payload);
      });
      return Promise.all(tasks);
    };

    const uploadPromise = app.isMerchantDemoMode()
      ? Promise.resolve({ images, video, videoCover: videoThumb })
      : dailyMedia.uploadDailyMedia(images, video, storeId, uploadOrderId, videoThumb);

    uploadPromise
      .then(({ images: cloudImages, video: cloudVideo, videoCover: cloudVideoCover }) => (
        submitLogs(cloudImages, cloudVideo, cloudVideoCover)
      ))
      .then(() => {
        wx.hideLoading();
        this._pendingScheduleOrders = null;
        try {
          wx.removeStorageSync('daily_check_edit_log');
        } catch (err) {
          // ignore
        }
        if (editMode) {
          wx.showToast({
            title: `已保存 ${time}`,
            icon: 'success',
            duration: 1800
          });
          setTimeout(() => {
            wx.navigateBack({ delta: 1 });
          }, 700);
          return;
        }
        if (isScheduled) {
          wx.showToast({
            title: `已定时 ${time}`,
            icon: 'success',
            duration: 2000
          });
        } else {
          wx.showToast({
            title: selectedOrders.length > 1 ? `已为${selectedOrders.length}只宠物打卡` : '打卡成功',
            icon: 'success'
          });
        }
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
        }, isScheduled ? 900 : 600);
      })
      .catch((err) => {
        wx.hideLoading();
        const message = (err && err.message) || (err && err.errMsg)
          || (editMode ? '保存失败' : (isScheduled ? '定时失败' : '打卡失败'));
        wx.showToast({ title: message, icon: 'none', duration: 3000 });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  }
});
