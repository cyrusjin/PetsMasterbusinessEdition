const {
  OA_DISPLAY_NAME,
  DEFAULT_OA_QRCODE,
  isOaBound,
  openOfficialAccountProfile
} = require('../../utils/officialAccount');
const auth = require('../../utils/auth');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer(val) {
        if (val) {
          this._loadBindQr();
        }
      }
    },
    title: {
      type: String,
      value: '预约成功'
    }
  },

  data: {
    oaDisplayName: OA_DISPLAY_NAME,
    oaQrcodeUrl: DEFAULT_OA_QRCODE
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

      ensure
        .then(() => auth.createOaBindQr())
        .then((res) => {
          if (res && res.success && res.showQrcodeUrl) {
            this.setData({ oaQrcodeUrl: res.showQrcodeUrl });
          }
        })
        .catch((err) => {
          console.warn('[oa-follow-sheet] createOaBindQr failed', err);
        });
    },

    onPreviewQrcode() {
      wx.previewImage({
        urls: [this.data.oaQrcodeUrl],
        current: this.data.oaQrcodeUrl
      });
    },

    onFollowTap() {
      openOfficialAccountProfile({
        onComplete: () => {
          this._refreshBoundStatus();
          this.triggerEvent('followed');
        }
      });
    },

    _refreshBoundStatus() {
      try {
        const app = getApp();
        if (app && typeof app.refreshCloudUser === 'function') {
          return app.refreshCloudUser();
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
