const { BANNER_AD, openAdTarget } = require('../../utils/userAds');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    }
  },

  data: {
    ad: BANNER_AD
  },

  methods: {
    onOpen() {
      openAdTarget(this.data.ad);
    }
  }
});
