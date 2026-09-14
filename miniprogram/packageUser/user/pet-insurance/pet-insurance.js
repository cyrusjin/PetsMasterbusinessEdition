const {
  PET_INSURANCE_URL,
  PET_INSURANCE_LINK_HOURS,
  validatePetInsuranceShare,
  navigateToPetInsurance
} = require('../../../utils/petInsurance');

const INSURANCE_QR_PATH = '/images/insurance/pet-insurance-mp-code.png';

Page({
  data: {
    insuranceQrPath: INSURANCE_QR_PATH,
    insuranceUrl: '',
    loading: true,
    expired: false,
    errorText: '',
    expireAt: 0,
    validHours: PET_INSURANCE_LINK_HOURS
  },

  onLoad(options) {
    const shareToken = String((options && options.insurance_token) || '').trim();
    if (!shareToken) {
      this.setData({ insuranceUrl: PET_INSURANCE_URL, loading: false, expired: false });
      return;
    }
    this._validateShareToken(shareToken);
  },

  onShow() {
    if (this._shareToken && this.data.expireAt && Number(this.data.expireAt) <= Date.now()) {
      this._showExpired('链接已过期');
    }
  },

  onUnload() {
    this._clearExpireTimer();
  },

  _validateShareToken(shareToken) {
    this._shareToken = shareToken;
    this.setData({ loading: true, expired: false, errorText: '' });
    validatePetInsuranceShare(shareToken)
      .then((res) => {
        if (res && res.success && res.valid) {
          this.setData({
            insuranceUrl: PET_INSURANCE_URL,
            loading: false,
            expired: false,
            expireAt: Number(res.expireAt) || 0
          });
          this._scheduleExpiry(res.expireAt);
          return;
        }
        this._showExpired((res && res.errMsg) || '链接已过期');
      })
      .catch(() => {
        this._showExpired('链接校验失败，请联系商家重新发送');
      });
  },

  _scheduleExpiry(expireAt) {
    this._clearExpireTimer();
    const remain = Number(expireAt) - Date.now();
    if (remain <= 0) {
      this._showExpired('链接已过期');
      return;
    }
    this._expireTimer = setTimeout(() => this._showExpired('链接已过期'), remain + 100);
  },

  _clearExpireTimer() {
    if (this._expireTimer) {
      clearTimeout(this._expireTimer);
      this._expireTimer = null;
    }
  },

  _showExpired(message) {
    this._clearExpireTimer();
    this.setData({
      insuranceUrl: '',
      loading: false,
      expired: true,
      errorText: message || '链接已过期'
    });
  },

  _canUseInsurance() {
    if (this.data.loading || this.data.expired || !this.data.insuranceUrl) return false;
    if (this._shareToken && Number(this.data.expireAt) <= Date.now()) {
      this._showExpired('链接已过期');
      return false;
    }
    return true;
  },

  onBuyInsurance() {
    if (!this._canUseInsurance()) return;
    navigateToPetInsurance();
  },

  onCopyInsuranceLink() {
    if (!this._canUseInsurance()) return;
    const url = String(this.data.insuranceUrl || '').trim();
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '购买链接已复制',
          content: '请将链接粘贴发送到微信聊天（如文件传输助手），再点击消息中的链接打开平安好车主小程序。',
          showCancel: false,
          confirmText: '知道了'
        });
      },
      fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' })
    });
  },

  onPreviewInsuranceQr() {
    if (!this._canUseInsurance()) return;
    wx.previewImage({
      current: INSURANCE_QR_PATH,
      urls: [INSURANCE_QR_PATH]
    });
  },

  onGoHome() {
    wx.switchTab({
      url: '/pages/index/index',
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
  }
});
