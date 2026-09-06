const app = getApp();
const membershipApi = require('../utils/membership');
const { uploadLocalImage } = require('../../utils/upload');

const STATUS_META = {
  available: { label: '可提交', type: 'available', action: '上传截图' },
  pending: { label: '审核中', type: 'pending', action: '等待审核' },
  approved: { label: '已通过', type: 'approved', action: '权限已发放' },
  rejected: { label: '未通过', type: 'rejected', action: '重新提交' }
};

function normalizeTask(task) {
  const source = task || {};
  const rawStatus = String(source.status || source.submissionStatus || source.review_status || 'available').toLowerCase();
  const status = ['submitted', 'reviewing', 'pending_review'].includes(rawStatus)
    ? 'pending'
    : (['completed', 'claimed', 'verified'].includes(rawStatus)
      ? 'approved'
      : (rawStatus === 'failed' ? 'rejected' : rawStatus));
  const meta = STATUS_META[status] || STATUS_META.available;
  return {
    ...source,
    code: source.code || source.taskCode || source.task_code || '',
    title: source.title || source.name || source.task_name || '推广任务',
    description: source.description || source.desc || source.task_desc || '按任务要求完成推广并上传截图',
    requirementText: source.requirementText || source.requirement_text || '截图需清晰展示推广内容及发布时间',
    rewardText: source.rewardText || source.reward_text || (source.reward_days ? `审核通过赠送 ${source.reward_days} 天使用权限` : '审核通过后发放使用权限'),
    proofUrl: source.proofUrl || source.proof_url || '',
    reviewNote: source.reviewNote || source.review_note || '',
    status,
    statusLabel: meta.label,
    statusType: meta.type,
    actionText: source.canSubmit === false && (status === 'available' || status === 'rejected') ? '请联系店主提交' : meta.action,
    canSubmit: source.canSubmit !== false && (status === 'available' || status === 'rejected')
  };
}

Page({
  data: {
    loading: true,
    unavailable: false,
    submittingCode: '',
    errorMessage: '',
    tasks: []
  },

  onShow() {
    this.load();
  },

  _getStoreId() {
    const shop = app.getShop ? app.getShop() : (app.globalData.shop || {});
    return (shop && shop.store_id) || '';
  },

  load() {
    const storeId = this._getStoreId();
    if (!storeId) {
      this.setData({ loading: false, unavailable: true, errorMessage: '未找到当前门店信息', tasks: [] });
      return;
    }
    this.setData({ loading: true });
    membershipApi.getPromotionTasks(storeId)
      .then((res) => {
        const rawTasks = Array.isArray(res.tasks) ? res.tasks : (Array.isArray(res.items) ? res.items : []);
        const tasks = rawTasks.map(normalizeTask).filter((item) => item.code);
        this.setData({ loading: false, unavailable: false, errorMessage: '', tasks });
      })
      .catch((err) => {
        const rawMessage = String((err && err.message) || '');
        const errorMessage = /未知错误/i.test(rawMessage)
          ? '推广任务服务尚未部署，请稍后再试'
          : (rawMessage || '推广任务加载失败，请稍后重试');
        this.setData({ loading: false, unavailable: true, errorMessage, tasks: [] });
      });
  },

  onRetry() {
    this.load();
  },

  _chooseScreenshot() {
    if (typeof wx.chooseMedia === 'function') {
      return new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: (res) => resolve(res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath),
          fail: reject
        });
      });
    }
    return new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => resolve(res.tempFilePaths && res.tempFilePaths[0]),
        fail: reject
      });
    });
  },

  onSubmit(e) {
    const code = e.currentTarget.dataset.code;
    const task = this.data.tasks.find((item) => item.code === code);
    if (!task || !task.canSubmit || this.data.submittingCode) return;
    this._chooseScreenshot()
      .then((localPath) => {
        if (!localPath) throw new Error('未选择截图');
        this.setData({ submittingCode: code });
        wx.showLoading({ title: '上传截图中...', mask: true });
        return uploadLocalImage(localPath, 'promotion-proofs');
      })
      .then((proofUrl) => membershipApi.submitPromotionProof(this._getStoreId(), code, proofUrl))
      .then(() => {
        wx.hideLoading();
        this.setData({ submittingCode: '' });
        wx.showToast({ title: '已提交审核', icon: 'success' });
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submittingCode: '' });
        if (err && err.errMsg && /cancel/i.test(err.errMsg)) return;
        wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none', duration: 2500 });
      });
  },

  onPreview(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: [url] });
  }
});
