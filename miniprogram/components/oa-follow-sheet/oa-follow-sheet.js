const {
  OA_DISPLAY_NAME,
  isOaBound
} = require('../../utils/officialAccount');
const auth = require('../../utils/auth');

const POLL_MS = 5000;

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '预约成功'
    },
    headline: {
      type: String,
      value: '关注服务号，接收服务动态'
    },
    desc: {
      type: String,
      value: '商家打卡后，服务号会第一时间通知你'
    }
  },

  data: {
    oaDisplayName: OA_DISPLAY_NAME,
    oaQrcodeUrl: '',
    bindQrReady: false,
    bindQrLoading: false,
    bindQrError: ''
  },

  lifetimes: {
    detached() {
      this._stopPolling();
      this._unbindAppShow();
    }
  },

  pageLifetimes: {
    show() {
      if (this.data.show) {
        this._tryCompleteBind();
      }
    }
  },

  observers: {
    show(val) {
      if (val) {
        this._loadBindQr();
        this._startPolling();
        this._bindAppShow();
      } else {
        this._stopPolling();
        this._unbindAppShow();
      }
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close');
    },

    onMaskTap() {
      this.triggerEvent('close');
    },

    onPanelTap() {},

    _loadBindQr() {
      const app = getApp();
      const ensure = (app && typeof app.ensureCloudAndLogin === 'function')
        ? app.ensureCloudAndLogin({ silent: true })
        : Promise.resolve();

      this.setData({
        bindQrLoading: true,
        bindQrReady: false,
        bindQrError: '',
        // 失败前不展示无 scene 的静态码，避免用户关注了却绑不上
        oaQrcodeUrl: ''
      });

      ensure
        .then(() => auth.createOaBindQr())
        .then((res) => {
          if (res && res.success && res.showQrcodeUrl) {
            this.setData({
              oaQrcodeUrl: res.showQrcodeUrl,
              bindQrReady: true,
              bindQrLoading: false,
              bindQrError: ''
            });
            return;
          }
          this.setData({
            bindQrReady: false,
            bindQrLoading: false,
            bindQrError: (res && res.errMsg) || '绑定码加载失败，请点击重试'
          });
        })
        .catch((err) => {
          console.warn('[oa-follow-sheet] createOaBindQr failed', err);
          this.setData({
            bindQrReady: false,
            bindQrLoading: false,
            bindQrError: '绑定码加载失败，请点击重试'
          });
        });
    },

    onRetryBindQr() {
      this._loadBindQr();
    },

    onPreviewQrcode() {
      if (!this.data.bindQrReady || !this.data.oaQrcodeUrl) {
        wx.showToast({ title: '绑定码未就绪', icon: 'none' });
        return;
      }
      wx.previewImage({
        urls: [this.data.oaQrcodeUrl],
        current: this.data.oaQrcodeUrl
      });
    },

    _bindAppShow() {
      if (this._appShowHandler) return;
      this._appShowHandler = () => {
        if (this.data.show) {
          this._tryCompleteBind();
        }
      };
      wx.onAppShow(this._appShowHandler);
    },

    _unbindAppShow() {
      if (!this._appShowHandler) return;
      wx.offAppShow(this._appShowHandler);
      this._appShowHandler = null;
    },

    _startPolling() {
      this._stopPolling();
      this._pollTimer = setInterval(() => {
        this._tryCompleteBind();
      }, POLL_MS);
    },

    _stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    _tryCompleteBind() {
      if (this._checking || !this.data.show) {
        return Promise.resolve(false);
      }
      this._checking = true;
      return this._refreshBoundStatus()
        .then(() => {
          if (!this.isAlreadyBound()) {
            return false;
          }
          this._stopPolling();
          wx.showToast({ title: '绑定成功', icon: 'success' });
          this.triggerEvent('followed');
          this.triggerEvent('close');
          return true;
        })
        .catch(() => false)
        .finally(() => {
          this._checking = false;
        });
    },

    _refreshBoundStatus() {
      try {
        const app = getApp();
        if (app && typeof app.refreshCloudUser === 'function') {
          return app.refreshCloudUser();
        }
        if (app && typeof app.ensureCloudAndLogin === 'function') {
          return app.ensureCloudAndLogin({ force: true, silent: true });
        }
      } catch (err) {
        // ignore
      }
      return Promise.resolve();
    },

    isAlreadyBound() {
      try {
        const app = getApp();
        return isOaBound((app.globalData && app.globalData.userInfo) || {});
      } catch (err) {
        return false;
      }
    }
  }
});
