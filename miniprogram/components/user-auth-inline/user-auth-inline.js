const app = getApp();
const auth = require('../../utils/auth');
const { hasUserAuthProfile, isAuthorizedNickName } = require('../../utils/userAuth');

Component({
  data: {
    nickName: '',
    phone: '',
    saving: false
  },

  lifetimes: {
    attached() {
      this._syncFromUser();
    }
  },

  pageLifetimes: {
    show() {
      this._syncFromUser();
    }
  },

  methods: {
    _syncFromUser() {
      const user = (app.globalData && app.globalData.userInfo) || {};
      this.setData({
        nickName: isAuthorizedNickName(user.nickName) ? String(user.nickName).trim() : '',
        phone: user.phone || ''
      });
    },

    onNickNameInput(e) {
      const nickName = ((e.detail && e.detail.value) || '').trim();
      if (!nickName || nickName === '微信用户' || /^[A-Za-z0-9]$/.test(nickName)) return;
      this.setData({ nickName });
    },

    onGetPhoneNumber(e) {
      const code = e.detail && e.detail.code;
      if (!code) return;
      wx.showLoading({ title: '授权中' });
      auth.bindPhone(code)
        .then((res) => {
          wx.hideLoading();
          if (!res || !res.success || !res.phone) {
            wx.showToast({
              title: (res && res.errMsg) || '手机号授权失败',
              icon: 'none'
            });
            return;
          }
          if (res.user) {
            app.globalData.userInfo = {
              ...(app.globalData.userInfo || {}),
              ...res.user
            };
          }
          this.setData({ phone: res.phone });
          this._tryAutoSave();
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({
            title: (err && err.message) || '手机号授权失败',
            icon: 'none'
          });
        });
    },

    _tryAutoSave() {
      const nickName = (this.data.nickName || '').trim();
      const phone = (this.data.phone || '').trim();
      if (!isAuthorizedNickName(nickName) || !phone || this.data.saving) return;
      this.onSave();
    },

    onSave() {
      const nickName = (this.data.nickName || '').trim();
      const phone = (this.data.phone || '').trim();
      if (!isAuthorizedNickName(nickName)) {
        wx.showToast({ title: '请点击输入框选择微信昵称', icon: 'none' });
        return;
      }
      if (!phone) {
        wx.showToast({ title: '请点击按钮授权手机号', icon: 'none' });
        return;
      }
      if (this.data.saving) return;

      this.setData({ saving: true });
      wx.showLoading({ title: '保存中' });
      app.updateProfile({ nickName, phone })
        .then(() => {
          wx.hideLoading();
          if (app.globalData.lastApiError) {
            wx.showToast({
              title: app.globalData.lastApiError,
              icon: 'none',
              duration: 3000
            });
            return;
          }
          const user = app.globalData.userInfo || {};
          if (!hasUserAuthProfile(user)) {
            wx.showToast({ title: '授权未完成', icon: 'none' });
            return;
          }
          this.triggerEvent('complete', { user });
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({
            title: (err && err.message) || '保存失败',
            icon: 'none'
          });
        })
        .finally(() => {
          this.setData({ saving: false });
        });
    }
  }
});
