const STORAGE_KEY = 'merchant_checkin_hint_v1';

function chinaDateKey(timestamp = Date.now()) {
  try {
    return new Date(Number(timestamp) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  } catch (err) {
    return '';
  }
}

function readAll() {
  try {
    const value = wx.getStorageSync(STORAGE_KEY);
    return value && typeof value === 'object' ? value : {};
  } catch (err) {
    return {};
  }
}

function readCheckInHint(storeId) {
  const id = String(storeId || '').trim();
  if (!id) return null;
  const item = readAll()[id];
  if (!item || item.dateKey !== chinaDateKey()) return null;
  return item;
}

function writeCheckInHint(storeId, checkedToday) {
  const id = String(storeId || '').trim();
  if (!id || typeof checkedToday !== 'boolean') return;
  const all = readAll();
  all[id] = { dateKey: chinaDateKey(), checkedToday, at: Date.now() };
  try {
    wx.setStorageSync(STORAGE_KEY, all);
  } catch (err) {
    // ignore quota
  }
}

function shouldShowCheckInHint(membership, storeId) {
  const local = readCheckInHint(storeId);
  if (local && typeof local.checkedToday === 'boolean') return local.checkedToday === false;
  if (membership && typeof membership.checkedToday === 'boolean') return membership.checkedToday === false;
  return false;
}

module.exports = {
  chinaDateKey,
  readCheckInHint,
  writeCheckInHint,
  shouldShowCheckInHint
};
