const app = getApp();
const auth = require('../../utils/auth');
const { hasUserAuthProfile, isAuthorizedNickName } = require('../../utils/userAuth');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    firstOpen: {
      type: Boolean,
      value: false
    }
  },

  data: {
    nickName: '',
    phone: '',
    saving: false
  },

  observers: {
    visible(visible) {
      if (!visible) return;
      const user = (app.globalData && app.globalData.userInfo) || {};
      this.setData({
        nickName: isAuthorizedNickName(user.nickName) ? String(user.nickName).trim() : '',
        phone: user.phone || ''
      });
    }
  },

  methods: {
    preventMove() {},

    onClose() {
      this.triggerEvent('close');
    },

    onNickNameInput(e) {
      const nickName = ((e.detail && e.detail.value) || '').trim();
      // 忽略选昵称过程中可能出现的单字母脏数据
      if (!nickName || nickName === '微信用户' || /^[A-Za-z0-9]$/.test(nickName)) return;
      this.setData({ nickName });
    },

    onGetPhoneNumber(e) {
      const code = e.detail && e.detail.code;
      if (!code) {
        wx.showToast({ title: '需要授权手机号', icon: 'none' });
        return;
      }
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
          wx.showToast({ title: '手机号已授权', icon: 'success' });
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({
            title: (err && err.message) || '手机号授权失败',
            icon: 'none'
          });
        });
    },

    onConfirm() {
      const nickName = (this.data.nickName || '').trim();
      const phone = (this.data.phone || '').trim();
      if (!isAuthorizedNickName(nickName)) {
        wx.showToast({ title: '请点击输入框授权微信昵称', icon: 'none' });
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
