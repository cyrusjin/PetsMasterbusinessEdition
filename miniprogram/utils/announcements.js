const { request } = require('./api');
const { STORAGE_KEYS } = require('./constants');

const CACHE_TTL = 60 * 1000;

function readReadState() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEYS.ANNOUNCEMENT_READ) || {};
    return {
      latestId: String(raw.latestId || ''),
      latestAt: Number(raw.latestAt || 0) || 0
    };
  } catch (err) {
    return { latestId: '', latestAt: 0 };
  }
}

function writeReadState(latestId, latestAt) {
  try {
    wx.setStorageSync(STORAGE_KEYS.ANNOUNCEMENT_READ, {
      latestId: String(latestId || ''),
      latestAt: Number(latestAt || 0) || 0
    });
  } catch (err) {
    // ignore
  }
}

function readCache() {
  try {
    const at = Number(wx.getStorageSync(STORAGE_KEYS.ANNOUNCEMENT_CACHE_AT) || 0);
    if (!at || Date.now() - at > CACHE_TTL) return null;
    const raw = wx.getStorageSync(STORAGE_KEYS.ANNOUNCEMENT_CACHE);
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch (err) {
    return null;
  }
}

function writeCache(payload) {
  try {
    wx.setStorageSync(STORAGE_KEYS.ANNOUNCEMENT_CACHE, payload || {});
    wx.setStorageSync(STORAGE_KEYS.ANNOUNCEMENT_CACHE_AT, Date.now());
  } catch (err) {
    // ignore
  }
}

function formatAnnounceTime(ts) {
  const n = Number(ts || 0);
  if (!n) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function decorateList(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    ...item,
    id: String((item && item.id) || ''),
    title: String((item && item.title) || ''),
    content: String((item && item.content) || ''),
    pinned: !!(item && item.pinned),
    timeText: formatAnnounceTime((item && (item.publishAt || item.updateTime || item.createTime)) || 0),
    preview: String((item && item.content) || '').replace(/\s+/g, ' ').trim().slice(0, 72)
  }));
}

function hasUnread(payload) {
  if (!payload || !payload.latestId) return false;
  const read = readReadState();
  if (!read.latestId) return true;
  if (read.latestId !== String(payload.latestId)) return true;
  const latestAt = Number(payload.unreadHintAt || payload.latestPublishAt || 0);
  return !!(latestAt && latestAt > (read.latestAt || 0));
}

function markAllRead(payload) {
  if (!payload || !payload.latestId) {
    writeReadState('', 0);
    return;
  }
  writeReadState(
    payload.latestId,
    payload.unreadHintAt || payload.latestPublishAt || Date.now()
  );
}

/**
 * 拉取商家端公告
 * @returns {Promise<{success, list, latestId, unread, unreadHintAt, latestPublishAt}>}
 */
function fetchMerchantAnnouncements(options = {}) {
  const force = !!(options && options.force);
  if (!force) {
    const cached = readCache();
    if (cached && cached.success !== false) {
      return Promise.resolve({
        ...cached,
        list: decorateList(cached.list),
        unread: hasUnread(cached)
      });
    }
  }

  return request('/api/config/announcements?audience=merchant&limit=50', {}, {
    method: 'GET',
    auth: false,
    timeout: 8000
  }).then((res) => {
    if (!res || res.success === false) {
      const cached = readCache();
      if (cached) {
        return {
          ...cached,
          list: decorateList(cached.list),
          unread: hasUnread(cached),
          success: true,
          fromCache: true
        };
      }
      return {
        success: false,
        errMsg: (res && res.errMsg) || '加载公告失败',
        list: [],
        unread: false
      };
    }
    const payload = {
      success: true,
      list: decorateList(res.list),
      latestId: res.latestId || '',
      latestPublishAt: res.latestPublishAt || null,
      unreadHintAt: res.unreadHintAt || null
    };
    writeCache(payload);
    return {
      ...payload,
      unread: hasUnread(payload)
    };
  }).catch(() => {
    const cached = readCache();
    if (cached) {
      return {
        ...cached,
        list: decorateList(cached.list),
        unread: hasUnread(cached),
        success: true,
        fromCache: true
      };
    }
    return { success: false, errMsg: '网络异常', list: [], unread: false };
  });
}

function fetchAnnouncementDetail(id) {
  const annId = String(id || '').trim();
  if (!annId) {
    return Promise.resolve({ success: false, errMsg: '公告不存在' });
  }
  return request(`/api/config/announcements/${encodeURIComponent(annId)}?audience=merchant`, {}, {
    method: 'GET',
    auth: false,
    timeout: 8000
  }).then((res) => {
    if (!res || res.success === false || !res.announcement) {
      return { success: false, errMsg: (res && res.errMsg) || '公告不存在' };
    }
    const item = decorateList([res.announcement])[0];
    return { success: true, announcement: item };
  });
}

module.exports = {
  fetchMerchantAnnouncements,
  fetchAnnouncementDetail,
  markAllRead,
  hasUnread,
  formatAnnounceTime
};
