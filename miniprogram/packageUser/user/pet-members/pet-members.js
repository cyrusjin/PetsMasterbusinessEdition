const app = getApp();
const petApi = require('../../../utils/pet');

Page({
  data: {
    petId: '',
    petName: '',
    isOwner: false,
    members: [],
    loading: false,
    sharing: false,
    inviteId: ''
  },

  onLoad(options) {
    const petId = String((options && (options.id || options.pet_id)) || '').trim();
    this.setData({ petId });
  },

  onShow() {
    this._load();
  },

  _load() {
    const petId = this.data.petId;
    if (!petId) return;
    this.setData({ loading: true });
    app.ensureCloudAndLogin()
      .then(() => petApi.listPetShareMembers(petId))
      .then((res) => {
        this.setData({
          petName: (res && res.petName) || '',
          isOwner: !!(res && res.isOwner),
          members: (res && res.members) || [],
          loading: false
        });
        if (res && res.isOwner) {
          return this._prepareInvite();
        }
        return null;
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({
          title: (err && err.message) || '加载失败',
          icon: 'none'
        });
      });
  },

  _prepareInvite() {
    const petId = this.data.petId;
    if (!petId) return Promise.resolve();
    this.setData({ sharing: true });
    return petApi.createPetShareInvite(petId)
      .then((res) => {
        this.setData({
          inviteId: (res && res.inviteId) || '',
          sharing: false
        });
      })
      .catch(() => {
        this.setData({ sharing: false, inviteId: '' });
      });
  },

  onShareAppMessage() {
    const inviteId = this.data.inviteId;
    const petName = this.data.petName || '宠物';
    if (!inviteId) {
      this._prepareInvite();
      return {
        title: `邀请你一起照顾${petName}`,
        path: '/packageUser/user/pets/pets'
      };
    }
    return {
      title: `邀请你一起照顾${petName}`,
      path: `/packageUser/user/pet-invite/pet-invite?pet_invite=${encodeURIComponent(inviteId)}`
    };
  },

  onRemove(e) {
    const openid = e.currentTarget.dataset.openid;
    const name = e.currentTarget.dataset.name || '该家人';
    if (!openid) return;
    wx.showModal({
      title: '移除家人',
      content: `确定移除「${name}」吗？移除后对方将无法再访问该宠物。`,
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中' });
        petApi.removePetShareMember(this.data.petId, openid)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已移除', icon: 'success' });
            this._load();
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({
              title: (err && err.message) || '移除失败',
              icon: 'none'
            });
          });
      }
    });
  },

  onLeave() {
    wx.showModal({
      title: '退出家庭宠物',
      content: '退出后将无法再查看该宠物档案与相关寄养动态，确定退出吗？',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中' });
        petApi.leavePetShare(this.data.petId)
          .then(() => app.loadPets({ force: true }))
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已退出', icon: 'success' });
            setTimeout(() => {
              wx.navigateBack({ fail: () => {
                wx.redirectTo({ url: '/packageUser/user/pets/pets' });
              } });
            }, 500);
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({
              title: (err && err.message) || '退出失败',
              icon: 'none'
            });
          });
      }
    });
  }
});
