Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    doc: {
      type: Object,
      value: {}
    },
    signable: {
      type: Boolean,
      value: false
    },
    submitMode: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    preventMove() {},

    onClose() {
      this.triggerEvent('close');
    },

    onSign() {
      this.triggerEvent('sign');
    }
  }
});
