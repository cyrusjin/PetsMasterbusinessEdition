const {
  askPetAi,
  getQuickQuestions,
  ensureReply,
  loadChatHistory,
  saveChatHistory,
  clearChatHistory
} = require('../../../utils/aiConsult');
const {
  fetchRemoteAppConfig,
  applyRemoteConfigToApp,
  isAiConsultVisible
} = require('../../../utils/merchantSwitch');

let msgSeq = 0;

function nextId() {
  msgSeq += 1;
  return `m${Date.now()}_${msgSeq}`;
}

const DEFAULT_NAV_TITLE = '咨询';
const DEFAULT_WELCOME = '你好，有什么养宠问题可以问我。';

const SAFE_HOSPITAL_REPLY =
  '我这边暂时没能给出更细的判断，但为了毛孩子安全，建议尽快去宠物医院做一次全面检查，让医生当面评估。\n\n路上保持安静，记下症状开始时间、饮食与大小便情况，方便医生问诊。\n\n线上问答不能替代面诊。';

function buildLockedCopy() {
  return {
    bannerVisible: false,
    bannerBadge: '',
    bannerText: '',
    bubbleTag: '',
    metaRemote: '',
    metaLocal: '',
    safeTip: '',
    navTitle: DEFAULT_NAV_TITLE,
    welcomeText: DEFAULT_WELCOME
  };
}

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

function looksLikeWelcome(content) {
  const text = String(content || '');
  if (!text) return true;
  if (text === DEFAULT_WELCOME) return true;
  return /人工智能|AI\s*养宠助手|AI\s*生成/.test(text);
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
    welcomeText: DEFAULT_WELCOME
  },

  onLoad(query) {
    const app = getApp();
    this._copy = buildLockedCopy();
    this._applyCopy(this._copy);

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

    const runPrefill = () => {
      if (this._prefillDone) return;
      const prefill = query && query.q ? decodeURIComponent(query.q) : '';
      if (!prefill) return;
      this._prefillDone = true;
      this.setData({ inputText: prefill.slice(0, 200) }, () => {
        setTimeout(() => this.onSend(), 200);
      });
    };

    const finish = () => {
      if (!isAiConsultVisible(app)) {
        blockAndBack();
        return;
      }
      this._applyCopy(buildUnlockedCopy());
      this._boot();
      runPrefill();
    };

    // 审核态直接拦截；未确认前不展示 AI 文案
    if (app && app.globalData && app.globalData.merchantSwitchEnabled === false) {
      finish();
      return;
    }

    fetchRemoteAppConfig({ force: true }).then((cfg) => {
      applyRemoteConfigToApp(app, cfg);
      finish();
    });
  },

  onShow() {
    // 从其它页返回时，若本地有更新则以本地为准（通常本页独占）
  },

  onUnload() {
    this._sendSeq = (this._sendSeq || 0) + 1;
    this._clearThinkTimer();
  },

  _clearThinkTimer() {
    if (this._thinkTimer) {
      clearTimeout(this._thinkTimer);
      this._thinkTimer = null;
    }
  },

  _thinkDelay(text) {
    const len = String(text || '').length;
    return Math.min(1800, 900 + Math.min(len, 60) * 8 + Math.floor(Math.random() * 350));
  },

  _applyCopy(copy) {
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

  _syncWelcomeMessage(messages, welcomeText) {
    const list = Array.isArray(messages) ? messages.slice() : [];
    if (!list.length) {
      return [
        {
          id: nextId(),
          role: 'ai',
          content: welcomeText,
          time: this._timeStr(),
          source: 'local'
        }
      ];
    }
    const first = list[0];
    if (first && first.role === 'ai' && !first.pending && looksLikeWelcome(first.content) && first.content !== welcomeText) {
      list[0] = { ...first, content: welcomeText, source: 'local' };
    }
    return list;
  },

  _boot() {
    const copy = this._copy || buildLockedCopy();
    const welcomeText = copy.welcomeText || DEFAULT_WELCOME;
    const stored = loadChatHistory();
    let messages = this._syncWelcomeMessage(
      stored.messages && stored.messages.length ? stored.messages : [],
      welcomeText
    );

    // 同步序号，避免 id 碰撞
    messages.forEach((m) => {
      const n = Number(String(m.id || '').split('_').pop());
      if (n > msgSeq) msgSeq = n;
    });

    messages = withMetaSuffix(messages, copy);

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
      content: '',
      pending: true,
      time: this._timeStr(),
      metaSuffix: ''
    };
    const sendSeq = (this._sendSeq = (this._sendSeq || 0) + 1);
    const startedAt = Date.now();
    const thinkMs = this._thinkDelay(text);

    const messages = this.data.messages.concat([userMsg, thinking]);
    this.setData(
      {
        messages,
        inputText: '',
        sending: true
      },
      () => this._scrollToBottom()
    );

    const reveal = (res, content) => {
      if (sendSeq !== this._sendSeq) return;
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
    };

    askPetAi({
      msg: text,
      conversationId: this.data.conversationId
    })
      .then((res) => {
        const content = ensureReply((res && res.reply) || '', text) || SAFE_HOSPITAL_REPLY;
        const remain = Math.max(0, thinkMs - (Date.now() - startedAt));
        this._clearThinkTimer();
        this._thinkTimer = setTimeout(() => reveal(res, content), remain);
      })
      .catch(() => {
        const remain = Math.max(0, thinkMs - (Date.now() - startedAt));
        this._clearThinkTimer();
        this._thinkTimer = setTimeout(() => reveal(null, SAFE_HOSPITAL_REPLY), remain);
      });
  }
});
