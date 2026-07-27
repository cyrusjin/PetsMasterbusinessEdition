Component({
  properties: { value: { type: String, value: '' } },
  data: { ctx: null, drawing: false, hasSigned: false },
  lifetimes: {
    attached() {
      const query = this.createSelectorQuery();
      query.select('.sign-canvas').fields({ node: true, size: true }).exec((res) => {
        if (res[0]) {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;
          canvas.width = res[0].width * dpr;
          canvas.height = res[0].height * dpr;
          ctx.scale(dpr, dpr);
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#333';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          this.setData({ ctx, canvas });
        }
      });
    }
  },
  methods: {
    onStart(e) {
      this.data.drawing = true;
      const { ctx } = this.data;
      if (!ctx) return;
      const touch = e.touches[0];
      ctx.beginPath();
      ctx.moveTo(touch.x, touch.y);
    },
    onMove(e) {
      if (!this.data.drawing || !this.data.ctx) return;
      const touch = e.touches[0];
      this.data.ctx.lineTo(touch.x, touch.y);
      this.data.ctx.stroke();
    },
    onEnd() {
      this.data.drawing = false;
      this.setData({ hasSigned: true });
    },
    onClear() {
      if (!this.data.ctx || !this.data.canvas) return;
      this.data.ctx.clearRect(0, 0, this.data.canvas.width, this.data.canvas.height);
      this.setData({ hasSigned: false });
    },
    onConfirm() {
      if (!this.data.hasSigned) { wx.showToast({ title: '请先签名', icon: 'none' }); return; }
      this.triggerEvent('confirm', { signature: 'sign_' + Date.now() });
    }
  }
});