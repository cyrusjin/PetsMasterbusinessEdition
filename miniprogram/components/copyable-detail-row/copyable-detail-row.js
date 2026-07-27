const { copyText } = require('../../utils/clipboard');

Component({
  properties: {
    label: {
      type: String,
      value: ''
    },
    value: {
      type: null,
      value: ''
    },
    stack: {
      type: Boolean,
      value: false
    }
  },

  data: {
    displayValue: '--'
  },

  observers: {
    value(value) {
      const displayValue = value === null || value === undefined || value === ''
        ? '--'
        : String(value);
      this.setData({ displayValue });
    }
  },

  methods: {
    onCopy() {
      copyText(this.data.value);
    }
  }
});
