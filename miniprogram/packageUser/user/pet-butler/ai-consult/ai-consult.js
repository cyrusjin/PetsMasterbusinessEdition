const {
  askPetAi,
  getQuickQuestions,
  ensureReply,
  loadChatHistory,
  saveChatHistory,
  clearChatHistory
} = require('../../../utils/aiConsult');
const {
  fetchMerchantSwitchEnabled,
  applyMerchantSwitchToApp,
  isAiConsultVisible
} = require('../../../utils/merchantSwitch');

let msgSeq = 0;

function nextId() {
  msgSeq += 1;
  return `m${Date.now()}_${msgSeq}`;
}

const SAFE_HOSPITAL_REPLY =
  '我这边暂时没能给出更细的判断，但为了毛孩子安全，建议尽快去宠物医院做一次全面检查，让医生当面评估。\n\n路上保持安静，记下症状开始时间、饮食与大小便情况，方便医生问诊。\n\n线上问答不能替代面诊。';

/** 非审核态才写入的文案（勿放进 wxml/json，避免静态扫包） */
function buildUnlockedCopy() {
  return {
    bannerVisible: true,
    bannerBadge: 'AI 生成',
    bannerText: '本页内容由人工智能生成，仅供参考，不能替代专业诊疗',
    bubbleTag: '人工智能生成',
    metaRemote: ' · 云端 · AI生成',
    metaLocal: ' · AI生成',
    safeTip: '内容由 AI 生成，仅供日常参考；紧急情况请立即就医',
    navTitle: 'AI 问诊',
    welcomeText:
      '你好，我是 AI 养宠助手。以下回复均由人工智能生成，仅供日常参考，不能替代专业诊疗。\n\n可以问饮食、护理、常见不适等日常问题。紧急情况（呼吸困难、持续抽搐、大量出血等）请立刻线下就医。'
  };
}

function withMetaSuffix(messages, copy) {
  const list = Array.isArray(messages) ? messages : [];
  const remote = (copy && copy.metaRemote) || '';
  const local = (copy && copy.metaLocal) || '';
  return list.map((m) => {
    if (!m || m.pending || m.role !== 'ai') {
      return { ...m, metaSuffix: '' };
    }
    return {
      ...m,
      metaSuffix: m.source === 'remote' ? remote : local
    };
  });
}

Page({
  data: {
    messages: [],
    inputText: '',
    sending: false,
    scrollToView: '',
    scrollTop: 0,
    quick: getQuickQuestions(),
    conversationId: '',
    hasHistory: false,
    // 默认中性对话框：无 AI 字样，确认非审核后再赋值
    bannerVisible: false,
    bannerBadge: '',
    bannerText: '',
    bubbleTag: '',
    metaRemote: '',
    metaLocal: '',
    safeTip: '',
    welcomeText: '你好，有什么养宠问题可以问我。'
  },

  onLoad(query) {
    const app = getApp();
    const blockAndBack = () => {
      wx.showToast({ title: '功能暂未开放', icon: 'none' });
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages && pages.length > 1) {
          wx.navigateBack({ delta: 1 });
        } else {
          wx.switchTab({ url: '/pages/index/index' });
        }
      }, 400);
    };

    const boot = () => {
      this._boot();
      const prefill = query && query.q ? decodeURIComponent(query.q) : '';
      if (prefill) {
        this.setData({ inputText: prefill.slice(0, 200) }, () => {
          setTimeout(() => this.onSend(), 200);
        });
      }
    };

    // 商家开关明确为 false 时立刻拦截；否则先拉远程配置再决定
    if (app && app.globalData && app.globalData.merchantSwitchEnabled === false) {
      blockAndBack();
      return;
    }

    fetchMerchantSwitchEnabled({ force: true }).then((enabled) => {
      applyMerchantSwitchToApp(app, enabled);
      if (!enabled || !isAiConsultVisible(app)) {
        blockAndBack();
        return;
      }
      // 确认非审核后，再写入 AI 相关文案
      this._unlockCopy();
      boot();
    });
  },

  onShow() {
    // 从其它页返回时，若本地有更新则以本地为准（通常本页独占）
  },

  _unlockCopy() {
    const copy = buildUnlockedCopy();
    this._copy = copy;
    this.setData({
      bannerVisible: copy.bannerVisible,
      bannerBadge: copy.bannerBadge,
      bannerText: copy.bannerText,
      bubbleTag: copy.bubbleTag,
      metaRemote: copy.metaRemote,
      metaLocal: copy.metaLocal,
      safeTip: copy.safeTip,
      welcomeText: copy.welcomeText
    });
    wx.setNavigationBarTitle({ title: copy.navTitle });
  },

  _boot() {
    const welcomeText = this.data.welcomeText;
    const stored = loadChatHistory();
    let messages =
      stored.messages && stored.messages.length
        ? stored.messages
        : [
            {
              id: nextId(),
              role: 'ai',
              content: welcomeText,
              time: this._timeStr(),
              source: 'local'
            }
          ];

    // 同步序号，避免 id 碰撞
    messages.forEach((m) => {
      const n = Number(String(m.id || '').split('_').pop());
      if (n > msgSeq) msgSeq = n;
    });

    messages = withMetaSuffix(messages, this._copy || this.data);

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
    const welcomeText = this.data.welcomeText;
    const realCount = (list || []).filter((m) => m && !m.pending).length;
    this.setData({ hasHistory: realCount > 1 || (realCount === 1 && list[0].content !== welcomeText) });
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
          content: this.data.welcomeText,
          time: this._timeStr(),
          source: 'local'
        };
        const messages = withMetaSuffix([welcome], this._copy || this.data);
        this.setData(
          {
            messages,
            conversationId: '',
            hasHistory: false
          },
          () => {
            this._persist(messages, '');
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
      time: this._timeStr(),
      metaSuffix: ''
    };
    const placeholderId = nextId();
    const thinking = {
      id: placeholderId,
      role: 'ai',
      content: '正在分析…',
      pending: true,
      time: this._timeStr(),
      metaSuffix: ''
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
        const next = withMetaSuffix(
          this.data.messages.map((m) => (m.id === placeholderId ? reply : m)),
          this._copy || this.data
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
        const next = withMetaSuffix(
          this.data.messages.map((m) => (m.id === placeholderId ? reply : m)),
          this._copy || this.data
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
