const app = getApp();

Page({
  data: { pets: [], loading: false },

  onShow() {
    this.setData({ loading: true });
    app.loadPets()
      .then((pets) => this.setData({ pets }))
      .finally(() => this.setData({ loading: false }));
  },

  onAdd() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  },

  onEdit(e) {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form?id=' + e.currentTarget.dataset.id });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除宠物',
      content: '确定删除该宠物档案吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '删除中' });
        app.deletePet(id)
          .then(() => {
            wx.hideLoading();
            this.setData({ pets: app.getPets() });
            wx.showToast({ title: '已删除', icon: 'success' });
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({
              title: (err && err.message) || '删除失败',
              icon: 'none'
            });
          });
      }
    });
  }
});
