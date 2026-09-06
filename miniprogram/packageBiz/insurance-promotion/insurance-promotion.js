const app = getApp();
const {
  PET_INSURANCE_LINK_HOURS,
  createPetInsuranceShare,
  buildPetInsuranceShareConfig
} = require('../../utils/petInsurance');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatExpireAt(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  if (!date.getTime()) return '--';
  return `${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatRemaining(expireAt) {
  const remain = Math.max(0, Number(expireAt) - Date.now());
  if (!remain) return '已过期';
  const totalMinutes = Math.max(1, Math.ceil(remain / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `剩余 ${minutes} 分钟`;
  return minutes ? `剩余 ${hours} 小时 ${minutes} 分钟` : `剩余 ${hours} 小时`;
}

Page({
  data: {
    commissionRateText: '10%',
    validHours: PET_INSURANCE_LINK_HOURS,
    preparing: true,
    prepareError: '',
    shareToken: '',
    expireAt: 0,
    expireAtText: '--',
    remainingText: '',
    linkExpired: false
  },

  onLoad() {
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] });
    }
    this._prepareShareLink();
  },

  onShow() {
    if (this.data.expireAt) this._refreshRemaining();
  },

  onUnload() {
    this._stopCountdown();
  },

  _resolveStoreId() {
    const shop = (app.getShop && app.getShop()) || {};
    return String(
      shop.store_id
      || (app.globalData && app.globalData.merchantStoreId)
      || (app.getStoreId && app.getStoreId())
      || ''
    ).trim();
  },

  _prepareShareLink() {
    const storeId = this._resolveStoreId();
    if (!storeId) {
      this.setData({ preparing: false, prepareError: '未找到当前店铺，请返回主页后重试' });
      return;
    }
    this._stopCountdown();
    this.setData({
      preparing: true,
      prepareError: '',
      shareToken: '',
      expireAt: 0,
      expireAtText: '--',
      remainingText: '',
      linkExpired: false
    });
    createPetInsuranceShare(storeId)
      .then((res) => {
        if (!res || !res.success || !res.shareToken || !res.expireAt) {
          throw new Error((res && res.errMsg) || '推广页面生成失败');
        }
        this.setData({
          preparing: false,
          prepareError: '',
          shareToken: res.shareToken,
          expireAt: Number(res.expireAt),
          expireAtText: formatExpireAt(res.expireAt),
          remainingText: formatRemaining(res.expireAt),
          linkExpired: false
        });
        this._startCountdown();
      })
      .catch((err) => {
        this.setData({
          preparing: false,
          prepareError: (err && err.message) || '推广页面生成失败，请重试'
        });
      });
  },

  _startCountdown() {
    this._stopCountdown();
    this._countdownTimer = setInterval(() => this._refreshRemaining(), 30000);
  },

  _stopCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  },

  _refreshRemaining() {
    const expireAt = Number(this.data.expireAt) || 0;
    const linkExpired = !expireAt || expireAt <= Date.now();
    this.setData({
      remainingText: formatRemaining(expireAt),
      linkExpired
    });
    if (linkExpired) this._stopCountdown();
  },

  onRetry() {
    this._prepareShareLink();
  },

  onShareAppMessage() {
    const expired = !this.data.expireAt || Number(this.data.expireAt) <= Date.now();
    if (!this.data.shareToken || this.data.linkExpired || expired) {
      if (expired && !this.data.linkExpired) this.setData({ linkExpired: true, remainingText: '已过期' });
      return {
        title: '宠物保险推广链接已过期',
        path: '/pages/merchant/tab-daily/tab-daily'
      };
    }
    return buildPetInsuranceShareConfig(this.data.shareToken);
  }
});
