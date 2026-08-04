const {
  askPetAi,
  getQuickQuestions,
  ensureReply,
  loadChatHistory,
  saveChatHistory,
  clearChatHistory
} = require('../../../utils/aiConsult');

let msgSeq = 0;

function nextId() {
  msgSeq += 1;
  return `m${Date.now()}_${msgSeq}`;
}

const SAFE_HOSPITAL_REPLY =
  '我这边暂时没能给出更细的判断，但为了毛孩子安全，建议尽快去宠物医院做一次全面检查，让医生当面评估。\n\n路上保持安静，记下症状开始时间、饮食与大小便情况，方便医生问诊。\n\n线上问答不能替代面诊。';

const WELCOME_TEXT =
  '你好，我是 AI 养宠助手。可以问饮食、护理、常见不适等日常问题。\n\n紧急情况（呼吸困难、持续抽搐、大量出血等）请立刻线下就医。';

Page({
  data: {
    messages: [],
    inputText: '',
    sending: false,
    scrollToView: '',
    scrollTop: 0,
    quick: getQuickQuestions(),
    conversationId: '',
    hasHistory: false
  },

  onLoad(query) {
    this._boot();
    const prefill = query && query.q ? decodeURIComponent(query.q) : '';
    if (prefill) {
      this.setData({ inputText: prefill.slice(0, 200) }, () => {
        setTimeout(() => this.onSend(), 200);
      });
    }
  },

  onShow() {
    // 从其它页返回时，若本地有更新则以本地为准（通常本页独占）
  },

  _boot() {
    const stored = loadChatHistory();
    const messages =
      stored.messages && stored.messages.length
        ? stored.messages
        : [
            {
              id: nextId(),
              role: 'ai',
              content: WELCOME_TEXT,
              time: this._timeStr(),
              source: 'local'
            }
          ];

    // 同步序号，避免 id 碰撞
    messages.forEach((m) => {
      const n = Number(String(m.id || '').split('_').pop());
      if (n > msgSeq) msgSeq = n;
    });

    this.setData(
      {
        messages,
        conversationId: stored.conversationId || '',
        hasHistory: !!(stored.messages && stored.messages.length)
      },
      () => {
        this._persist();
        this._scrollToBottom();
      }
    );
  },

  _timeStr() {
    const d = new Date();
    const h = `${d.getHours()}`.padStart(2, '0');
    const m = `${d.getMinutes()}`.padStart(2, '0');
    return `${h}:${m}`;
  },

  _persist(messages, conversationId) {
    const list = messages || this.data.messages;
    const cid = conversationId != null ? conversationId : this.data.conversationId;
    saveChatHistory(list, cid);
    const realCount = (list || []).filter((m) => m && !m.pending).length;
    this.setData({ hasHistory: realCount > 1 || (realCount === 1 && list[0].content !== WELCOME_TEXT) });
  },

  _scrollToBottom() {
    const run = () => {
      this.setData({ scrollToView: '' }, () => {
        const top = (this.data.scrollTop || 0) + 9999;
        this.setData({
          scrollToView: 'chat-bottom',
          scrollTop: top
        });
      });
    };
    setTimeout(run, 50);
    setTimeout(run, 280);
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onQuick(e) {
    const q = e.currentTarget.dataset.q;
    if (!q || this.data.sending) return;
    this.setData({ inputText: q }, () => this.onSend());
  },

  onClearHistory() {
    if (this.data.sending) return;
    wx.showModal({
      title: '清空聊天记录',
      content: '确定删除本地保存的问诊记录吗？',
      confirmColor: '#D96F55',
      success: (res) => {
        if (!res.confirm) return;
        clearChatHistory();
        const welcome = {
          id: nextId(),
          role: 'ai',
          content: WELCOME_TEXT,
          time: this._timeStr(),
          source: 'local'
        };
        this.setData(
          {
            messages: [welcome],
            conversationId: '',
            hasHistory: false
          },
          () => {
            this._persist([welcome], '');
            this._scrollToBottom();
          }
        );
      }
    });
  },

  onSend() {
    const text = String(this.data.inputText || '').trim();
    if (!text) {
      wx.showToast({ title: '先说点什么吧', icon: 'none' });
      return;
    }
    if (this.data.sending) return;

    const userMsg = {
      id: nextId(),
      role: 'user',
      content: text,
      time: this._timeStr()
    };
    const placeholderId = nextId();
    const thinking = {
      id: placeholderId,
      role: 'ai',
      content: '正在分析…',
      pending: true,
      time: this._timeStr()
    };

    const messages = this.data.messages.concat([userMsg, thinking]);
    this.setData(
      {
        messages,
        inputText: '',
        sending: true
      },
      () => this._scrollToBottom()
    );

    askPetAi({
      msg: text,
      conversationId: this.data.conversationId
    })
      .then((res) => {
        const content = ensureReply((res && res.reply) || '', text) || SAFE_HOSPITAL_REPLY;
        const reply = {
          id: placeholderId,
          role: 'ai',
          content,
          pending: false,
          source: (res && res.source) || 'local',
          time: this._timeStr()
        };
        const next = this.data.messages.map((m) =>
          m.id === placeholderId ? reply : m
        );
        const conversationId = (res && res.conversationId) || this.data.conversationId;
        this.setData(
          {
            messages: next,
            sending: false,
            conversationId
          },
          () => {
            this._persist(next, conversationId);
            this._scrollToBottom();
          }
        );
      })
      .catch(() => {
        const reply = {
          id: placeholderId,
          role: 'ai',
          content: SAFE_HOSPITAL_REPLY,
          pending: false,
          source: 'local',
          time: this._timeStr()
        };
        const next = this.data.messages.map((m) =>
          m.id === placeholderId ? reply : m
        );
        this.setData(
          {
            messages: next,
            sending: false
          },
          () => {
            this._persist(next);
            this._scrollToBottom();
          }
        );
      });
  }
});
