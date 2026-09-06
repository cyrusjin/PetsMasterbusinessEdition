const QRCODE_PATH = '/images/insurance/pet-insurance-qr.png';

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    qrcodePath: QRCODE_PATH
  },

  methods: {
    onMaskTap() {
      this.triggerEvent('close');
    },

    onClose() {
      this.triggerEvent('close');
    },

    onPanelTap() {},

    onBuy() {
      this.triggerEvent('buy');
    },

    onPreviewQrcode() {
      wx.previewImage({
        current: QRCODE_PATH,
        urls: [QRCODE_PATH]
      });
    }
  }
});
