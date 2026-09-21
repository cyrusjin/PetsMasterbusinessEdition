const NATURAL_TRAFFIC_NAME = '自然量';
const UNBOUND_STORE_NAME = NATURAL_TRAFFIC_NAME;
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

function collectRecordOpenids(user, openid) {
  const ids = [];
  if (user) {
    if (user.openid) ids.push(String(user.openid).trim());
    const openids = user.openids || {};
    if (openids.user) ids.push(String(openids.user).trim());
    if (openids.merchant) ids.push(String(openids.merchant).trim());
    if (openids.oa) ids.push(String(openids.oa).trim());
    if (Array.isArray(user.linkedOpenids)) {
      user.linkedOpenids.forEach((id) => ids.push(String(id || '').trim()));
    }
  }
  if (openid) ids.push(String(openid).trim());
  return [...new Set(ids.filter(Boolean))];
}

function lookupStoreName(storeId, storeById) {
  if (!storeId) return NATURAL_TRAFFIC_NAME;
  const store = storeById && (storeById[storeId] || storeById[String(storeId)]);
  if (store && (store.name || store.legalName)) return String(store.name || store.legalName).trim();
  return String(storeId);
}

function matchMerchantStore(user, storeById) {
  const ids = collectRecordOpenids(user);
  const explicit = String((user && (user.merchantStoreId || '')) || '').trim();
  const stores = Object.values(storeById || {}).filter(Boolean);
  if (explicit) {
    const byId = stores.find((item) => String(item.store_id || '') === explicit);
    if (byId) return byId;
  }
  return stores.find((item) => ids.some((id) => (
    String(item.ownerOpenid || '') === id
    || (Array.isArray(item.staffOpenids) ? item.staffOpenids : []).some((staff) => String(staff || '') === id)
  ))) || null;
}

function guestStoreIdOf(user) {
  let storeId = String((user && (user.visitStoreId || user.store_id)) || '').trim();
  const merchantId = String((user && user.merchantStoreId) || '').trim();
  if (merchantId && storeId === merchantId) storeId = '';
  return storeId;
}

function merchantRoleOf(openid, store, user) {
  if (String((user && user.merchantRole) || '').toLowerCase() === 'staff') return 'staff';
  const staffIds = Array.isArray(store && store.staffOpenids) ? store.staffOpenids : [];
  const ids = new Set(collectRecordOpenids(user, openid));
  if (staffIds.some((id) => ids.has(String(id || '').trim()))) return 'staff';
  return 'owner';
}

function isNaturalStore(item) {
  return !String((item && item.storeId) || '').trim();
}

function summarizeStores(userMap, { includeNames } = {}) {
  const byStore = new Map();
  userMap.forEach((rec) => {
    const storeId = String((rec && rec.storeId) || '');
    const key = storeId || '__none__';
    const cur = byStore.get(key) || {
      storeId,
      storeName: rec.storeName || (storeId ? storeId : NATURAL_TRAFFIC_NAME),
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
    if (rec.storeName && (cur.storeName === (storeId || NATURAL_TRAFFIC_NAME) || cur.storeName === storeId)) {
      cur.storeName = rec.storeName;
    }
    byStore.set(key, cur);
  });

  const named = [...byStore.values()].filter((item) => !isNaturalStore(item));
  const natural = [...byStore.values()].filter((item) => isNaturalStore(item));
  named.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.storeName || '').localeCompare(String(b.storeName || ''), 'zh');
  });

  const result = named.length <= STORE_LIMIT_PER_ROLE
    ? named
    : (() => {
      const head = named.slice(0, STORE_LIMIT_PER_ROLE);
      const rest = named.slice(STORE_LIMIT_PER_ROLE);
      head.push({
        storeId: '__more__',
        storeName: `其他 ${rest.length} 家店`,
        count: rest.reduce((sum, item) => sum + (item.count || 0), 0),
        ownerCount: rest.reduce((sum, item) => sum + (item.ownerCount || 0), 0),
        staffCount: rest.reduce((sum, item) => sum + (item.staffCount || 0), 0),
        names: []
      });
      return head;
    })();

  natural.forEach((item) => {
    result.push({
      ...item,
      storeName: NATURAL_TRAFFIC_NAME
    });
  });
  return result;
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
  const resolvedStoreId = String(storeId || '');
  const resolvedRole = role === 'merchant' && resolvedStoreId ? 'merchant' : 'guest';
  return {
    day,
    role: resolvedRole,
    userKey,
    openid: trimmedOpenid,
    openids: collectRecordOpenids(user, trimmedOpenid),
    storeId: resolvedStoreId,
    storeName: resolvedStoreId
      ? (storeName || resolvedStoreId)
      : NATURAL_TRAFFIC_NAME,
    merchantRole: resolvedRole === 'merchant' ? (merchantRole || 'owner') : '',
    displayName: displayNameOf(user)
  };
}

function isFlaggedMerchant(user, merchantOpenids) {
  if (!user) return false;
  const merchantIdSet = merchantOpenids instanceof Set
    ? merchantOpenids
    : new Set(merchantOpenids || []);
  const ids = collectRecordOpenids(user);
  return user.isMerchant === true
    || user.isMerchant === 1
    || String(user.isMerchant || '').toLowerCase() === 'true'
    || String(user.merchantStatus || '') === 'approved'
    || String(user.merchantRole || '').toLowerCase() === 'staff'
    || ids.some((id) => merchantIdSet.has(id));
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
        storeName: lookupStoreName(storeId, storeById)
      });
    }
    const merchantOpenid = String((order && order.merchantOpenid) || (store && store.ownerOpenid) || '').trim();
    if (merchantOpenid && storeId) {
      push({
        day,
        role: 'merchant',
        openid: merchantOpenid,
        user: userByOpenid.get(merchantOpenid),
        storeId,
        storeName: lookupStoreName(storeId, storeById),
        merchantRole: merchantRoleOf(merchantOpenid, store, userByOpenid.get(merchantOpenid))
      });
    }
  });

  (dailyLogs || []).forEach((log) => {
    const storeId = String((log && log.store_id) || '');
    const store = storeById[storeId];
    const publishedAt = Number((log && (log.publishedAt || log.createTime)) || 0);
    if (inRange(publishedAt) && String((log && log.status) || '') !== 'scheduled') {
      const merchantOpenid = String((log && log.merchantOpenid) || '').trim();
      if (merchantOpenid && storeId) {
        push({
          day: toDay(publishedAt),
          role: 'merchant',
          openid: merchantOpenid,
          user: userByOpenid.get(merchantOpenid),
          storeId,
          storeName: lookupStoreName(storeId, storeById),
          merchantRole: merchantRoleOf(merchantOpenid, store, userByOpenid.get(merchantOpenid))
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
        storeName: lookupStoreName(storeId, storeById)
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
      storeName: lookupStoreName(visitId, storeById)
    });
  });

  (users || []).forEach((user) => {
    if (!inRange(user && user.updateTime)) return;
    const openid = String((user && user.openid) || '').trim();
    if (!openid) return;
    const matched = isFlaggedMerchant(user, merchantOpenids)
      ? matchMerchantStore(user, storeById)
      : null;
    if (matched) {
      const storeId = String(matched.store_id || '').trim();
      push({
        day: toDay(user.updateTime),
        role: 'merchant',
        openid,
        user,
        storeId,
        storeName: lookupStoreName(storeId, storeById),
        merchantRole: merchantRoleOf(openid, matched, user)
      });
      return;
    }
    const storeId = guestStoreIdOf(user);
    push({
      day: toDay(user.updateTime),
      role: 'guest',
      openid,
      user,
      storeId,
      storeName: lookupStoreName(storeId, storeById)
    });
  });

  return records;
}

function recordScore(rec) {
  const isMerchant = rec.role === 'merchant' ? 4 : 0;
  const hasStore = rec.storeId ? 2 : 0;
  const named = rec.storeName && rec.storeName !== NATURAL_TRAFFIC_NAME ? 1 : 0;
  return isMerchant + hasStore + named;
}

function normalizeDauRecord(rec, storeNameById) {
  const storeId = String((rec && rec.storeId) || '').trim();
  const storeName = storeId
    ? (rec.storeName && rec.storeName !== NATURAL_TRAFFIC_NAME
      ? rec.storeName
      : (storeNameById[storeId] || storeId))
    : NATURAL_TRAFFIC_NAME;
  const isMerchant = rec.role === 'merchant' && !!storeId;
  return {
    ...rec,
    role: isMerchant ? 'merchant' : 'guest',
    storeId: isMerchant || storeId ? storeId : '',
    storeName: isMerchant || storeId ? storeName : NATURAL_TRAFFIC_NAME,
    merchantRole: isMerchant
      ? (rec.merchantRole === 'staff' ? 'staff' : 'owner')
      : ''
  };
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
    const normalized = normalizeDauRecord(rec, storeNameById);
    if (!byDay.has(rec.day)) {
      byDay.set(rec.day, new Map());
    }
    const users = byDay.get(rec.day);
    const prev = users.get(rec.userKey);
    if (!prev || recordScore(normalized) > recordScore(prev)) {
      users.set(rec.userKey, normalized);
    }
  });

  return (dayKeys || []).map((day) => {
    const users = byDay.get(day) || new Map();
    const merchant = new Map();
    const guest = new Map();
    users.forEach((rec, userKey) => {
      if (rec.role === 'merchant') merchant.set(userKey, rec);
      else guest.set(userKey, rec);
    });
    return {
      date: day,
      merchantCount: merchant.size,
      guestCount: guest.size,
      merchants: summarizeStores(merchant, { includeNames: true }),
      guests: summarizeStores(guest, { includeNames: false })
    };
  });
}

module.exports = {
  NATURAL_TRAFFIC_NAME,
  UNBOUND_STORE_NAME,
  NAME_LIMIT_PER_STORE,
  STORE_LIMIT_PER_ROLE,
  normalizeRole,
  summarizeStores,
  aggregateDauTrend,
  recordsFromExistingApiData
};
