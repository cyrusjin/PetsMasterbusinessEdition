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
    },
    detached() {
      // 使未完成的异步解析失效，避免组件销毁后继续 setData。
      this._resolveTaskSeq = (this._resolveTaskSeq || 0) + 1;
    }
  },

  methods: {
    _setDisplaySrc(next) {
      if (next === this.data.displaySrc) return;
      this.setData({ displaySrc: next });
    },

    _updateDisplaySrc() {
      const { src, defaultSrc } = this.properties;
      const source = (src || '').trim() || (defaultSrc || '').trim();

      if (!source) {
        this._setDisplaySrc('');
        return;
      }

      if (isLocalImagePath(source) || source.startsWith('/')) {
        this._setDisplaySrc(source);
        return;
      }

      // 已下载过的图片同步落到本地路径，避免异步闪空白
      const cached = peekCachedPath(source, { skipTouch: true });
      if (cached) {
        this._setDisplaySrc(cached);
      }

      const taskId = (this._resolveTaskSeq || 0) + 1;
      this._resolveTaskSeq = taskId;
      resolveImageUrl(source).then((path) => {
        if (this._resolveTaskSeq !== taskId) return;
        const next = path || source;
        this._setDisplaySrc(next);
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
