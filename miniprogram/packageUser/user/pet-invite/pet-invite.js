const app = getApp();
const petApi = require('../../../utils/pet');

function parseInviteIds(raw) {
  return String(raw || '')
    .split(/[,，\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function formatJoinedNames(names) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]}、${list[1]}`;
  return `${list[0]}等${list.length}只`;
}

Page({
  data: {
    inviteIds: [],
    loading: false,
    done: false,
    error: '',
    petName: ''
  },

  onLoad(options) {
    const inviteIds = parseInviteIds(
      (options && (options.pet_invite || options.inviteId || options.invite_id)) || ''
    );
    this.setData({ inviteIds });
    if (!inviteIds.length) {
      this.setData({ error: '邀请链接无效' });
      return;
    }
    this._accept();
  },

  onRetry() {
    this._accept();
  },

  _accept() {
    const inviteIds = this.data.inviteIds || [];
    if (!inviteIds.length) return;
    this.setData({ loading: true, error: '' });
    app.ensureCloudAndLogin()
      .then(() => Promise.all(inviteIds.map((inviteId) => (
        petApi.acceptPetShareInvite(inviteId)
          .then((res) => ({ ok: true, res }))
          .catch((err) => ({ ok: false, err }))
      ))))
      .then((results) => {
        const okList = results.filter((item) => item.ok).map((item) => item.res);
        if (!okList.length) {
          const firstErr = results.find((item) => !item.ok);
          throw (firstErr && firstErr.err) || new Error('接受邀请失败');
        }
        const names = okList.map((res) => (
          (res && (res.petName || (res.pet && res.pet.name))) || ''
        )).filter(Boolean);
        const petName = formatJoinedNames(names);
        this.setData({ done: true, petName, loading: false });
        return app.loadPets({ force: true }).then(() => {
          wx.showToast({
            title: petName ? `已加入${petName}` : '已加入家庭宠物',
            icon: 'success'
          });
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: (err && err.message) || '接受邀请失败'
        });
      });
  },

  onGoPets() {
    wx.redirectTo({ url: '/packageUser/user/pets/pets' });
  }
});
