const app = getApp();
const { formatAgeText } = require('../../../utils/petAge');

Page({
  data: {
    pets: [],
    loading: false
  },

  onShow() {
    const gen = (this._showGen || 0) + 1;
    this._showGen = gen;
    // 先展示内存/本地缓存，页面无白屏；网络数据按 App TTL 在后台更新。
    this._renderPets(app.getPets());
    if (!this.data.pets.length) this.setData({ loading: true });
    app.loadPets({ force: false })
      .then((pets) => {
        if (gen !== this._showGen) return;
        this._renderPets(pets);
      })
      .finally(() => {
        if (gen === this._showGen && this.data.loading) this.setData({ loading: false });
      });
  },

  _renderPets(pets) {
    const next = (pets || []).map((pet) => ({
      ...pet,
      ageText: formatAgeText(pet) || `${pet.age || '?'}岁`
    }));
    const sig = next.map((pet) => [pet.id, pet.updateTime || 0, pet.name, pet.photo, pet.ageText].join(':')).join('|');
    if (sig === this._petsSig) return;
    this._petsSig = sig;
    this.setData({ pets: next });
  },

  onAdd() {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form' });
  },

  onEdit(e) {
    wx.navigateTo({ url: '/packageUser/user/pet-form/pet-form?id=' + e.currentTarget.dataset.id });
  },

  onMembers(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/packageUser/user/pet-members/pet-members?id=' + id });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除宠物',
      content: '确定删除该宠物档案吗？家庭成员也将失去访问权限。',
      success: (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '删除中' });
        app.deletePet(id)
          .then(() => {
            wx.hideLoading();
            this._renderPets(app.getPets());
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
