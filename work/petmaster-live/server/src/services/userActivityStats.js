const UNBOUND_STORE_NAME = '未绑定门店';
const NAME_LIMIT_PER_STORE = 8;
const STORE_LIMIT_PER_ROLE = 12;

function normalizeRole(client) {
  return String(client || '') === 'merchant' ? 'merchant' : 'guest';
}

function isExcludedRecord(rec, excludedOpenids, excludedStoreIds) {
  const openidSet = excludedOpenids instanceof Set ? excludedOpenids : new Set(excludedOpenids || []);
  const storeSet = excludedStoreIds instanceof Set ? excludedStoreIds : new Set(excludedStoreIds || []);
  if (rec.storeId && storeSet.has(rec.storeId)) return true;
  if (rec.openid && openidSet.has(rec.openid)) return true;
  return (rec.openids || []).some((id) => openidSet.has(String(id || '').trim()));
}

function summarizeStores(userMap, { includeNames } = {}) {
  const byStore = new Map();
  userMap.forEach((rec) => {
    const storeId = String((rec && rec.storeId) || '');
    const key = storeId || '__none__';
    const cur = byStore.get(key) || {
      storeId,
      storeName: rec.storeName || (storeId ? storeId : UNBOUND_STORE_NAME),
      count: 0,
      ownerCount: 0,
      staffCount: 0,
      names: []
    };
    cur.count += 1;
    if (rec.role === 'merchant') {
      if (rec.merchantRole === 'staff') cur.staffCount += 1;
      else cur.ownerCount += 1;
    }
    if (includeNames) {
      const name = String(rec.displayName || '').trim();
      if (name && cur.names.length < NAME_LIMIT_PER_STORE && !cur.names.includes(name)) {
        cur.names.push(name);
      }
    }
    if (rec.storeName && cur.storeName === (storeId || UNBOUND_STORE_NAME)) {
      cur.storeName = rec.storeName;
    }
    byStore.set(key, cur);
  });

  const sorted = [...byStore.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.storeName || '').localeCompare(String(b.storeName || ''), 'zh');
  });
  if (sorted.length <= STORE_LIMIT_PER_ROLE) return sorted;
  const head = sorted.slice(0, STORE_LIMIT_PER_ROLE);
  const rest = sorted.slice(STORE_LIMIT_PER_ROLE);
  head.push({
    storeId: '__more__',
    storeName: `其他 ${rest.length} 家店`,
    count: rest.reduce((sum, item) => sum + (item.count || 0), 0),
    ownerCount: rest.reduce((sum, item) => sum + (item.ownerCount || 0), 0),
    staffCount: rest.reduce((sum, item) => sum + (item.staffCount || 0), 0),
    names: []
  });
  return head;
}

function activityUserKey(user, openid) {
  if (user && user._id) return String(user._id);
  return String(openid || '').trim();
}

function displayNameOf(user) {
  if (!user) return '';
  return String(user.nickName || user.realName || '').trim();
}

function makeActivityRecord({
  day,
  role,
  openid,
  user,
  storeId,
  storeName,
  merchantRole
}) {
  const trimmedOpenid = String(openid || (user && user.openid) || '').trim();
  const userKey = activityUserKey(user, trimmedOpenid);
  if (!day || !userKey) return null;
  const openids = [];
  if (user) {
    if (user.openid) openids.push(String(user.openid).trim());
    const ids = user.openids || {};
    if (ids.user) openids.push(String(ids.user).trim());
    if (ids.merchant) openids.push(String(ids.merchant).trim());
    if (Array.isArray(user.linkedOpenids)) {
      user.linkedOpenids.forEach((id) => openids.push(String(id || '').trim()));
    }
  }
  if (trimmedOpenid) openids.push(trimmedOpenid);
  return {
    day,
    role: role === 'merchant' ? 'merchant' : 'guest',
    userKey,
    openid: trimmedOpenid,
    openids: [...new Set(openids.filter(Boolean))],
    storeId: String(storeId || ''),
    storeName: storeName || (storeId ? String(storeId) : UNBOUND_STORE_NAME),
    merchantRole: merchantRole || '',
    displayName: displayNameOf(user)
  };
}

function recordsFromExistingApiData({
  orders = [],
  dailyLogs = [],
  users = [],
  pets = [],
  dayStart = 0,
  now = Date.now(),
  dayKeyFn,
  storeById = {},
  userByOpenid = new Map(),
  merchantOpenids = []
} = {}) {
  const records = [];
  const toDay = typeof dayKeyFn === 'function' ? dayKeyFn : null;
  if (!toDay) return records;

  const inRange = (ts) => {
    const n = Number(ts) || 0;
    return n >= dayStart && n <= now;
  };

  const push = (payload) => {
    const rec = makeActivityRecord(payload);
    if (rec) records.push(rec);
  };

  const storeName = (storeId) => {
    const store = storeById[storeId] || storeById[String(storeId || '')];
    if (store && (store.name || store.legalName)) return String(store.name || store.legalName).trim();
    return storeId ? String(storeId) : UNBOUND_STORE_NAME;
  };

  const merchantRoleOf = (openid, store) => {
    const staffIds = Array.isArray(store && store.staffOpenids) ? store.staffOpenids : [];
    if (staffIds.some((id) => String(id || '').trim() === String(openid || '').trim())) return 'staff';
    return 'owner';
  };

  (orders || []).forEach((order) => {
    if (!inRange(order && order.createTime)) return;
    const storeId = String((order && order.store_id) || '');
    const store = storeById[storeId];
    const day = toDay(order.createTime);
    const guestOpenid = String((order && order.userOpenid) || '').trim();
    if (guestOpenid) {
      push({
        day,
        role: 'guest',
        openid: guestOpenid,
        user: userByOpenid.get(guestOpenid),
        storeId,
        storeName: storeName(storeId)
      });
    }
    const merchantOpenid = String((order && order.merchantOpenid) || (store && store.ownerOpenid) || '').trim();
    if (merchantOpenid) {
      push({
        day,
        role: 'merchant',
        openid: merchantOpenid,
        user: userByOpenid.get(merchantOpenid),
        storeId,
        storeName: storeName(storeId),
        merchantRole: merchantRoleOf(merchantOpenid, store)
      });
    }
  });

  (dailyLogs || []).forEach((log) => {
    const storeId = String((log && log.store_id) || '');
    const store = storeById[storeId];
    const publishedAt = Number((log && (log.publishedAt || log.createTime)) || 0);
    if (inRange(publishedAt) && String((log && log.status) || '') !== 'scheduled') {
      const merchantOpenid = String((log && log.merchantOpenid) || '').trim();
      if (merchantOpenid) {
        push({
          day: toDay(publishedAt),
          role: 'merchant',
          openid: merchantOpenid,
          user: userByOpenid.get(merchantOpenid),
          storeId,
          storeName: storeName(storeId),
          merchantRole: merchantRoleOf(merchantOpenid, store)
        });
      }
    }
    const viewedAt = Number((log && log.userViewedAt) || 0);
    const guestOpenid = String((log && log.userOpenid) || '').trim();
    if (inRange(viewedAt) && guestOpenid) {
      push({
        day: toDay(viewedAt),
        role: 'guest',
        openid: guestOpenid,
        user: userByOpenid.get(guestOpenid),
        storeId,
        storeName: storeName(storeId)
      });
    }
  });

  (pets || []).forEach((pet) => {
    if (!inRange(pet && pet.createTime)) return;
    const ownerOpenid = String((pet && pet.ownerOpenid) || '').trim();
    if (!ownerOpenid) return;
    const user = userByOpenid.get(ownerOpenid);
    const visitId = String((user && (user.visitStoreId || user.store_id)) || '');
    push({
      day: toDay(pet.createTime),
      role: 'guest',
      openid: ownerOpenid,
      user,
      storeId: visitId,
      storeName: storeName(visitId)
    });
  });

  (users || []).forEach((user) => {
    if (!inRange(user && user.updateTime)) return;
    const openid = String((user && user.openid) || '').trim();
    if (!openid) return;
    const ids = [];
    if (user.openid) ids.push(String(user.openid).trim());
    const openids = user.openids || {};
    if (openids.user) ids.push(String(openids.user).trim());
    if (openids.merchant) ids.push(String(openids.merchant).trim());
    const merchantIdSet = merchantOpenids instanceof Set
      ? merchantOpenids
      : new Set(merchantOpenids || []);
    const isMerchant = user.isMerchant === true
      || user.isMerchant === 1
      || String(user.isMerchant || '').toLowerCase() === 'true'
      || String(user.merchantStatus || '') === 'approved'
      || String(user.merchantRole || '').toLowerCase() === 'staff'
      || ids.some((id) => merchantIdSet.has(id));
    let storeId = '';
    let merchantRole = '';
    if (isMerchant) {
      storeId = String(user.merchantStoreId || '').trim();
      const matched = Object.values(storeById || {}).find((item) => {
        if (!item) return false;
        if (storeId && String(item.store_id || '') === storeId) return true;
        return ids.some((id) => String(item.ownerOpenid || '') === id
          || (Array.isArray(item.staffOpenids) ? item.staffOpenids : []).some((staff) => String(staff || '') === id));
      });
      if (matched) storeId = String(matched.store_id || storeId);
      merchantRole = String(user.merchantRole || '').toLowerCase() === 'staff' ? 'staff' : 'owner';
      if (matched) merchantRole = merchantRoleOf(openid, matched);
    } else {
      storeId = String(user.visitStoreId || user.store_id || '').trim();
      const merchantId = String(user.merchantStoreId || '').trim();
      if (merchantId && storeId === merchantId) storeId = '';
    }
    push({
      day: toDay(user.updateTime),
      role: isMerchant ? 'merchant' : 'guest',
      openid,
      user,
      storeId,
      storeName: storeName(storeId),
      merchantRole
    });
  });

  return records;
}

function aggregateDauTrend(records, {
  dayKeys = [],
  storeNameById = {},
  excludedOpenids = [],
  excludedStoreIds = []
} = {}) {
  const openidSet = new Set(excludedOpenids || []);
  const storeSet = new Set(excludedStoreIds || []);
  const byDay = new Map();

  (records || []).forEach((rec) => {
    if (!rec || !rec.day || !rec.userKey) return;
    if (isExcludedRecord(rec, openidSet, storeSet)) return;
    const role = rec.role === 'merchant' ? 'merchant' : 'guest';
    if (!byDay.has(rec.day)) {
      byDay.set(rec.day, { merchant: new Map(), guest: new Map() });
    }
    const bucket = byDay.get(rec.day);
    if (bucket[role].has(rec.userKey)) return;
    const storeId = String(rec.storeId || '');
    bucket[role].set(rec.userKey, {
      ...rec,
      role,
      storeId,
      storeName: rec.storeName || storeNameById[storeId] || (storeId ? storeId : UNBOUND_STORE_NAME)
    });
  });

  return (dayKeys || []).map((day) => {
    const bucket = byDay.get(day) || { merchant: new Map(), guest: new Map() };
    return {
      date: day,
      merchantCount: bucket.merchant.size,
      guestCount: bucket.guest.size,
      merchants: summarizeStores(bucket.merchant, { includeNames: true }),
      guests: summarizeStores(bucket.guest, { includeNames: false })
    };
  });
}

module.exports = {
  UNBOUND_STORE_NAME,
  NAME_LIMIT_PER_STORE,
  STORE_LIMIT_PER_ROLE,
  normalizeRole,
  summarizeStores,
  aggregateDauTrend,
  recordsFromExistingApiData
};
