const app = getApp();
const auth = require('../../../utils/auth');
const { uploadLocalImage } = require('../../../utils/upload');
const { resolveStoreDisplayNo } = require('../../../utils/displayNo');
const { copyText } = require('../../../utils/clipboard');
const { isAuthorizedNickName } = require('../../../utils/userAuth');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    realName: '',
    idCard: '',
    phone: '',
    address: '',
    openid: '',
    storeId: '',
    storeDisplayNo: '',
    storeName: '',
    roleLabel: '宠主端',
    cloudEnv: '',
    cloudStatus: '',
    dbIsMerchant: '',
    cloudError: ''
  },

  onShow() {
    app.refreshCurrentStore().finally(() => this._loadAuthInfo());
  },

  _loadAuthInfo() {
    app.ensureCloudAndLogin().then(() => {
      const u = app.globalData.userInfo || {};
      const meta = app.globalData.authMeta || {};
      const hasOpenid = !!(u.openid || meta.requestOpenid);
      const lastError = app.globalData.lastApiError || '';
      const store = app.getUserStoreView();
      const storeId = u.store_id || app.getStoreId() || '';
      const storeDisplayNo = resolveStoreDisplayNo(store || { store_id: storeId });

      let cloudStatus = '未连接';
      if (lastError) {
        cloudStatus = '调用失败';
      } else if (hasOpenid) {
        cloudStatus = '已连接';
      } else if (app.globalData.env) {
        cloudStatus = 'API 已配置，等待响应';
      }

      this.setData({
        avatarUrl: u.avatarUrl || '',
        nickName: isAuthorizedNickName(u.nickName) ? String(u.nickName).trim() : '',
        realName: u.realName || '',
        idCard: u.idCard || '',
        phone: u.phone || '',
        address: u.address || '',
        openid: u.openid || meta.requestOpenid || '',
        storeId,
        storeDisplayNo,
        storeName: (store && store.name) || '',
        roleLabel: app.globalData.isMerchant ? '商家端' : '宠主端',
        cloudEnv: app.globalData.env || '未配置',
        cloudStatus,
        dbIsMerchant: meta.dbIsMerchant !== undefined ? String(meta.dbIsMerchant) : '-',
        cloudError: lastError
      });
    });
  },

  onCopyStoreId() {
    const { storeDisplayNo } = this.data;
    if (!storeDisplayNo) return;
    copyText(storeDisplayNo, '已复制店铺编号');
  },

  onRefreshRole() {
    wx.showLoading({ title: '刷新中' });
    app.forceRefreshRole()
      .then(() => {
        wx.hideLoading();
        this._loadAuthInfo();
        if (app.globalData.lastApiError) {
          wx.showModal({
            title: 'API 异常',
            content: app.globalData.lastApiError,
            showCancel: false
          });
          return;
        }
        wx.showToast({
          title: app.globalData.isMerchant ? '已是商家端' : '已是宠主端',
          icon: 'none'
        });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '刷新失败', icon: 'none' });
      });
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl;
    if (avatarUrl) {
      this.setData({ avatarUrl });
    }
  },

  onNickInput(e) {
    const nickName = ((e.detail && e.detail.value) || '').trim();
    if (!nickName || nickName === '微信用户' || /^[A-Za-z0-9]$/.test(nickName)) return;
    this.setData({ nickName });
  },
  onRealNameInput(e) { this.setData({ realName: e.detail.value }); },
  onIdCardInput(e) { this.setData({ idCard: e.detail.value }); },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },
  onAddrInput(e) { this.setData({ address: e.detail.value }); },

  onGetPhoneNumber(e) {
    const code = e.detail && e.detail.code;
    if (!code) {
      wx.showToast({ title: '未授权手机号', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '获取中' });
    auth.bindPhone(code)
      .then((res) => {
        wx.hideLoading();
        if (res.success && res.phone) {
          this.setData({ phone: res.phone });
          if (res.user) {
            app.globalData.userInfo = {
              ...(app.globalData.userInfo || {}),
              ...res.user
            };
          }
          wx.showToast({ title: '手机号已授权', icon: 'success' });
          return;
        }
        wx.showToast({
          title: (res && res.errMsg) || '获取手机号失败',
          icon: 'none'
        });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '获取手机号失败',
          icon: 'none'
        });
      });
  },

  onSave() {
    const { avatarUrl, nickName, realName, idCard, phone, address } = this.data;
    if (!isAuthorizedNickName(nickName)) {
      wx.showToast({ title: '请授权或输入昵称', icon: 'none' });
      return;
    }
    if (!phone) {
      wx.showToast({ title: '请授权或输入手机号', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中' });
    uploadLocalImage(avatarUrl, 'user-avatars')
      .then((uploadedAvatar) => app.updateProfile({
        avatarUrl: uploadedAvatar,
        nickName,
        realName,
        idCard,
        phone,
        address
      }))
      .then(() => {
        wx.hideLoading();
        if (app.globalData.lastApiError) {
          wx.showModal({
            title: '保存失败',
            content: app.globalData.lastApiError,
            showCancel: false
          });
          return;
        }
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1000);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none'
        });
      });
  }
});
