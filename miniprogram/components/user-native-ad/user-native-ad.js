const { NATIVE_AD, openAdTarget } = require('../../utils/userAds');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    }
  },

  data: {
    ad: NATIVE_AD
  },

  methods: {
    onTouchMove() {},

    onClose() {
      this.triggerEvent('close');
    },

    onOpen() {
      openAdTarget(this.data.ad);
    }
  }
});
