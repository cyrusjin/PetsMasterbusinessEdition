const { callApiService } = require('./api');

const CONTEXT_KEY = 'petmaster_promotion_context';
const CONTEXT_TTL = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_TABLE_CARD_PREFIX = 'ot_';
const OFFLINE_TABLE_CARD_SOURCE = 'offline_table_card';

function decodeScene(scene) {
  try {
    return decodeURIComponent(String(scene || '')).trim();
  } catch (err) {
    return String(scene || '').trim();
  }
}

function parseOfflineTableCardScene(scene) {
  const decoded = decodeScene(scene);
  const isStoreId = (value) => /^store_[a-zA-Z0-9_-]+$/.test(value);
  if (isStoreId(decoded)) return decoded;
  if (decoded.startsWith(OFFLINE_TABLE_CARD_PREFIX)) {
    const storeId = decoded.slice(OFFLINE_TABLE_CARD_PREFIX.length).trim();
    return isStoreId(storeId) ? storeId : '';
  }
  return '';
}

function getStoreId() {
  try {
    const app = getApp();
    return String((app && app.getShareStoreId && app.getShareStoreId()) || (app && app.globalData && app.globalData.merchantStoreId) || '').trim();
  } catch (err) {
    return '';
  }
}

function createShareCode(storeId) {
  const seed = `${storeId || getStoreId()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `sh_${seed.replace(/[^a-zA-Z0-9_]/g, '').slice(-48)}`;
}

function readPromotionContext() {
  try {
    const value = wx.getStorageSync(CONTEXT_KEY);
    if (!value || !value.at || Date.now() - value.at > CONTEXT_TTL) return null;
    return value;
  } catch (err) {
    return null;
  }
}

function capturePromotionEntry(options = {}) {
  const offlineStoreId = parseOfflineTableCardScene(options.scene);
  const storeId = String(options.store_id || options.storeId || offlineStoreId || '').trim();
  const shareCode = String(options.shareCode || '').trim();
  const source = String(options.source || (offlineStoreId ? OFFLINE_TABLE_CARD_SOURCE : '')).trim();
  if (!storeId || (!shareCode && !source)) return readPromotionContext();
  const context = { store_id: storeId, shareCode: shareCode.slice(0, 80), source: source.slice(0, 40), at: Date.now() };
  try { wx.setStorageSync(CONTEXT_KEY, context); } catch (err) {}
  recordPromotionEvent({ store_id: storeId, shareCode: context.shareCode, source: context.source, type: 'open' }).catch(() => {});
  return context;
}

function getPromotionContext() {
  return readPromotionContext();
}

function recordPromotionEvent(data = {}) {
  return callApiService('orderService', { action: 'recordPromotionEvent', ...data });
}

function getPromotionStats(storeId, days = 30) {
  return callApiService('orderService', { action: 'getPromotionStats', store_id: storeId, days });
}

function listCustomerTags(storeId) {
  return callApiService('orderService', { action: 'listStoreCustomerTags', store_id: storeId });
}

function updateCustomerTags(storeId, customerKey, tags, note = '') {
  return callApiService('orderService', { action: 'updateStoreCustomerTags', store_id: storeId, customer_key: customerKey, tags, note });
}

module.exports = {
  CONTEXT_KEY,
  OFFLINE_TABLE_CARD_PREFIX,
  OFFLINE_TABLE_CARD_SOURCE,
  parseOfflineTableCardScene,
  createShareCode,
  capturePromotionEntry,
  getPromotionContext,
  recordPromotionEvent,
  getPromotionStats,
  listCustomerTags,
  updateCustomerTags
};
