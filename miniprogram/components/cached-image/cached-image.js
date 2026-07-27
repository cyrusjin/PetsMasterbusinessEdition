const { resolveImageUrl, peekCachedPath, isLocalImagePath } = require('../../utils/imageCache');

Component({
  externalClasses: ['custom-class'],

  properties: {
    src: {
      type: String,
      value: ''
    },
    defaultSrc: {
      type: String,
      value: ''
    },
    mode: {
      type: String,
      value: 'scaleToFill'
    },
    sizing: {
      type: String,
      value: 'fill'
    },
    lazyLoad: {
      type: Boolean,
      value: true
    },
    showMenuByLongpress: {
      type: Boolean,
      value: false
    }
  },

  data: {
    displaySrc: ''
  },

  observers: {
    src() {
      this._updateDisplaySrc();
    }
  },

  lifetimes: {
    attached() {
      this._updateDisplaySrc();
    }
  },

  methods: {
    _updateDisplaySrc() {
      const { src, defaultSrc } = this.properties;
      const source = (src || '').trim() || (defaultSrc || '').trim();

      if (!source) {
        this.setData({ displaySrc: '' });
        return;
      }

      if (isLocalImagePath(source) || source.startsWith('/')) {
        this.setData({ displaySrc: source });
        return;
      }

      // 已下载过的图片同步落到本地路径，避免异步闪空白
      const cached = peekCachedPath(source, { skipTouch: true });
      if (cached) {
        this.setData({ displaySrc: cached });
      }

      const taskId = Date.now();
      this._resolveTaskId = taskId;
      resolveImageUrl(source).then((path) => {
        if (this._resolveTaskId !== taskId) return;
        const next = path || source;
        if (next !== this.data.displaySrc) {
          this.setData({ displaySrc: next });
        }
      });
    },

    onImageTap(e) {
      this.triggerEvent('tap', e.detail);
    },

    onImageLoad(e) {
      this.triggerEvent('load', e.detail);
    },

    onImageError(e) {
      const { defaultSrc } = this.properties;
      if (defaultSrc && this.data.displaySrc !== defaultSrc) {
        this.setData({ displaySrc: defaultSrc });
      }
      this.triggerEvent('error', e.detail);
    }
  }
});
