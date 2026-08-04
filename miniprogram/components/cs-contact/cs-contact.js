const QR_SRC = '/images/cs-wechat-qr.png';

Component({
  properties: {
    showEntry: {
      type: Boolean,
      value: true
    }
  },

  data: {
    visible: false
  },

  methods: {
    onOpen() {
      this.setData({ visible: true });
    },

    onClose() {
      this.setData({ visible: false });
    },

    preventMove() {},

    onPreviewQr() {
      wx.previewImage({
        current: QR_SRC,
        urls: [QR_SRC]
      });
    },

    /** 供外部主动打开 */
    open() {
      this.setData({ visible: true });
    }
  }
});
