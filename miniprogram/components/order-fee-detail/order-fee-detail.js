const { copyText } = require('../../utils/clipboard');

Component({
  properties: {
    detail: {
      type: Object,
      value: {}
    }
  },

  methods: {
    onCopyValue(e) {
      copyText(e.currentTarget.dataset.value);
    }
  }
});
