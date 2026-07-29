const storeApi = require('../../utils/store');

const app = getApp();

Page({
  data: {
    loading: true,
    clearing: false,
    processingId: '',
    applications: []
  },

  onShow() {
    this.loadApplications();
  },

  onPullDownRefresh() {
    this.loadApplications().finally(() => wx.stopPullDownRefresh());
  },

  onClearCache() {
    if (this.data.clearing) return;
    wx.showModal({
      title: '清除本地缓存',
      content: '将清空本机所有本地数据（用户、订单、店铺、体验模式、图片缓存等），并重新登录。云端数据不受影响。确定继续？',
      confirmColor: '#E53935',
      confirmText: '清除',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ clearing: true });
        wx.showLoading({ title: '清理中', mask: true });
        Promise.resolve()
          .then(() => app.clearLocalAppCache())
          .then(() => {
            wx.showToast({ title: '已清除', icon: 'success' });
            wx.reLaunch({ url: '/pages/merchant/tab-daily/tab-daily' });
          })
          .catch(() => {
            wx.showToast({ title: '清除失败', icon: 'none' });
          })
          .finally(() => {
            wx.hideLoading();
            this.setData({ clearing: false });
          });
      }
    });
  },

  loadApplications() {
    this.setData({ loading: true });
    return storeApi.listPendingMerchantApplications()
      .then((res) => {
        if (!res || !res.success) {
          throw new Error((res && res.errMsg) || '加载失败');
        }
        this.setData({ applications: res.applications || [] });
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.message) || '加载失败',
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  onApprove(e) {
    const storeId = e.currentTarget.dataset.id;
    if (!storeId || this.data.processingId) return;
    wx.showModal({
      title: '确认开通',
      content: '确定同意该商家入驻并开通商家端权限？',
      confirmColor: '#E98657',
      success: (r) => {
        if (!r.confirm) return;
        this._review(storeId, 'approve');
      }
    });
  },

  onReject(e) {
    const storeId = e.currentTarget.dataset.id;
    if (!storeId || this.data.processingId) return;
    wx.showModal({
      title: '拒绝入驻',
      editable: true,
      placeholderText: '请填写驳回理由（将展示给商家）',
      content: '',
      confirmColor: '#E53935',
      confirmText: '拒绝',
      success: (r) => {
        if (!r.confirm) return;
        const rejectReason = ((r.content || '').trim()) || '审核未通过，请修改资料后重新申请';
        this._review(storeId, 'reject', rejectReason);
      }
    });
  },

  _review(storeId, decision, rejectReason) {
    this.setData({ processingId: storeId });
    wx.showLoading({ title: '处理中', mask: true });
    const payload = { store_id: storeId, decision };
    if (decision === 'reject') {
      payload.rejectReason = rejectReason || '';
    }
    storeApi.reviewMerchantApplication(payload)
      .then((res) => {
        if (!res || !res.success) {
          throw new Error((res && res.errMsg) || '操作失败');
        }
        wx.showToast({ title: decision === 'approve' ? '已开通' : '已拒绝', icon: 'success' });
        return this.loadApplications();
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.message) || '操作失败',
          icon: 'none'
        });
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({ processingId: '' });
      });
  }
});
