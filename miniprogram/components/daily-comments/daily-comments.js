const dailyApi = require('../../utils/daily');

const MAX_LEN = 200;

function buildLocalComment({ content, replyToCommentId, replyToAuthorName, isMerchant }) {
  const now = Date.now();
  return {
    id: `cmt_local_${now}_${Math.random().toString(36).slice(2, 6)}`,
    comment_id: `cmt_local_${now}`,
    authorRole: isMerchant ? 'merchant' : 'user',
    authorName: isMerchant ? '商家' : '我',
    content,
    replyToCommentId: replyToCommentId || '',
    replyToAuthorName: replyToAuthorName || '',
    createTime: now,
    time: '刚刚'
  };
}

Component({
  properties: {
    logId: { type: String, value: '' },
    comments: { type: Array, value: [] },
    disabled: { type: Boolean, value: false },
    hidden: { type: Boolean, value: false },
    placeholder: { type: String, value: '写一句回复…' }
  },

  data: {
    draft: '',
    submitting: false,
    replyToId: '',
    replyToName: '',
    maxLen: MAX_LEN
  },

  methods: {
    onInput(e) {
      this.setData({ draft: (e.detail && e.detail.value) || '' });
    },

    onReplyTo(e) {
      const id = e.currentTarget.dataset.id || '';
      const name = e.currentTarget.dataset.name || '';
      this.setData({
        replyToId: id,
        replyToName: name
      });
    },

    onCancelReply() {
      this.setData({ replyToId: '', replyToName: '' });
    },

    onSubmit() {
      if (this.data.submitting || this.data.disabled) return;
      const content = String(this.data.draft || '').trim();
      if (!content) {
        wx.showToast({ title: '请输入回复内容', icon: 'none' });
        return;
      }
      if (content.length > MAX_LEN) {
        wx.showToast({ title: `回复不能超过${MAX_LEN}字`, icon: 'none' });
        return;
      }
      const logId = this.data.logId;
      if (!logId) {
        wx.showToast({ title: '打卡记录无效', icon: 'none' });
        return;
      }

      const replyToCommentId = this.data.replyToId || '';
      const replyToAuthorName = this.data.replyToName || '';
      this.setData({ submitting: true });

      const app = getApp();
      const isDemo = !!(app.isMerchantDemoMode && app.isMerchantDemoMode());
      const isMerchant = !!(app.canAccessMerchantBackend
        && app.canAccessMerchantBackend()
        && !(app.isUserClientMode && app.isUserClientMode()));

      const request = isDemo
        ? Promise.resolve({
          success: true,
          comment: buildLocalComment({
            content,
            replyToCommentId,
            replyToAuthorName,
            isMerchant
          })
        })
        : dailyApi.addDailyLogComment({
          logId,
          content,
          replyToCommentId
        });

      request
        .then((res) => {
          if (!res || !res.success || !res.comment) {
            throw new Error((res && res.errMsg) || '发送失败');
          }
          const comments = (this.data.comments || []).concat([res.comment]);
          this.setData({
            draft: '',
            replyToId: '',
            replyToName: ''
          });
          this.triggerEvent('change', {
            logId,
            comments,
            comment: res.comment
          });
        })
        .catch((err) => {
          wx.showToast({
            title: (err && err.message) || '发送失败',
            icon: 'none'
          });
        })
        .finally(() => {
          this.setData({ submitting: false });
        });
    }
  }
});
