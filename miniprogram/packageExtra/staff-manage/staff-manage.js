const app = getApp();
const storeApi = require('../../utils/store');

Page({
  data: {
    loading: true,
    staffList: [],
    removingStaffId: ''
  },

  onShow() {
    app.ensureCloudAndLogin().then(() => {
      if (!app.isStoreOwner()) {
        wx.showToast({ title: '仅负责人可管理员工', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1200);
        return;
      }
      this.loadStaffList();
    });
  },

  onPullDownRefresh() {
    this.loadStaffList().finally(() => wx.stopPullDownRefresh());
  },

  loadStaffList() {
    this.setData({ loading: true });
    return storeApi.listStoreStaff()
      .then((res) => {
        if (!res || !res.success) {
          throw new Error((res && res.errMsg) || '加载失败');
        }
        this.setData({ staffList: res.staff || [] });
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

  onRemoveStaff(e) {
    const staffOpenid = e.currentTarget.dataset.openid;
    const name = e.currentTarget.dataset.name || '该员工';
    if (!staffOpenid || this.data.removingStaffId) return;
    wx.showModal({
      title: '移除员工',
      content: `确定移除「${name}」的店铺管理权限？`,
      confirmColor: '#E53935',
      confirmText: '移除',
      success: (r) => {
        if (!r.confirm) return;
        this.setData({ removingStaffId: staffOpenid });
        storeApi.removeStoreStaff(staffOpenid)
          .then((res) => {
            if (!res || !res.success) {
              throw new Error((res && res.errMsg) || '移除失败');
            }
            wx.showToast({ title: '已移除', icon: 'success' });
            return this.loadStaffList();
          })
          .catch((err) => {
            wx.showToast({
              title: (err && err.message) || '移除失败',
              icon: 'none'
            });
          })
          .finally(() => {
            this.setData({ removingStaffId: '' });
          });
      }
    });
  }
});
