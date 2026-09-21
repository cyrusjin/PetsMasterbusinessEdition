const db = require('../db');
const identity = require('./identity');
const userFields = require('./userFields');
const {
  NATURAL_TRAFFIC_NAME,
  UNBOUND_STORE_NAME,
  normalizeRole,
  aggregateDauTrend,
  recordsFromExistingApiData
} = require('./userActivityStats');

const COLLECTION = 'user_activity_daily';

let indexesReady = false;
let seen = new Set();
let seenDay = '';
let seededDay = '';

function cnDayStart(daysAgo = 0, now = Date.now()) {
  const cn = new Date(now + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = cn.getUTCMonth();
  const d = cn.getUTCDate() - daysAgo;
  return Date.UTC(y, m, d) - 8 * 3600 * 1000;
}

function cnDayKey(ts) {
  const cn = new Date((Number(ts) || 0) + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = String(cn.getUTCMonth() + 1).padStart(2, '0');
  const d = String(cn.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function displayNameOf(user) {
  if (!user) return '';
  return String(user.nickName || user.realName || '').trim();
}

function rememberSeen(day, cacheKey) {
  if (seenDay !== day) {
    seen = new Set();
    seenDay = day;
  }
  if (seen.has(cacheKey)) return false;
  seen.add(cacheKey);
  return true;
}

function forgetSeen(cacheKey) {
  seen.delete(cacheKey);
}

async function ensureReady() {
  await db.ensureCollections([COLLECTION]);
  if (indexesReady) return;
  try {
    const col = db.collection(COLLECTION);
    await col.createIndex({ day: 1, userKey: 1, role: 1 }, { unique: true });
    await col.createIndex({ day: 1, role: 1 });
    indexesReady = true;
  } catch (err) {
    console.warn('[userActivity] ensure indexes failed', err.message || err);
  }
}

function activityOpenids(user, openid) {
  const set = new Set(identity.collectOpenids(user || openid));
  if (user && Array.isArray(user.linkedOpenids)) {
    user.linkedOpenids.forEach((id) => {
      const value = String(id || '').trim();
      if (value) set.add(value);
    });
  }
  return [...set];
}

function resolveMerchantRole(user, store, openid) {
  if (String((user && user.merchantRole) || '').toLowerCase() === 'staff') return 'staff';
  const openids = new Set(activityOpenids(user, openid));
  const staffIds = Array.isArray(store && store.staffOpenids) ? store.staffOpenids : [];
  if (staffIds.some((id) => openids.has(String(id || '').trim()))) return 'staff';
  return 'owner';
}

function storeNameOf(store, storeId) {
  if (store && (store.name || store.legalName)) {
    return String(store.name || store.legalName).trim();
  }
  return storeId || NATURAL_TRAFFIC_NAME;
}

function buildStoreLookup(stores) {
  const byId = new Map();
  const byOpenid = new Map();
  (stores || []).forEach((store) => {
    if (!store) return;
    const storeId = String(store.store_id || '').trim();
    if (storeId) byId.set(storeId, store);
    const owner = String(store.ownerOpenid || '').trim();
    if (owner && !byOpenid.has(owner)) byOpenid.set(owner, store);
    (Array.isArray(store.staffOpenids) ? store.staffOpenids : []).forEach((id) => {
      const staff = String(id || '').trim();
      if (staff && !byOpenid.has(staff)) byOpenid.set(staff, store);
    });
  });
  return { byId, byOpenid };
}

function resolveActivityStore(user, role, storeLookup, openid) {
  if (role === 'merchant') {
    const explicit = userFields.resolveMerchantStoreId(user);
    if (explicit && storeLookup.byId.has(explicit)) {
      return storeLookup.byId.get(explicit);
    }
    return activityOpenids(user, openid).map((id) => storeLookup.byOpenid.get(id)).find(Boolean) || null;
  }
  const visitId = userFields.resolveVisitStoreId(user);
  if (visitId && storeLookup.byId.has(visitId)) return storeLookup.byId.get(visitId);
  return null;
}

function resolveActivityIdentity(user, storeLookup, openid) {
  const merchantStore = resolveActivityStore(user, 'merchant', storeLookup, openid);
  const merchantStoreId = merchantStore ? String(merchantStore.store_id || '').trim() : '';
  if (merchantStoreId) {
    return {
      role: 'merchant',
      store: merchantStore,
      storeId: merchantStoreId
    };
  }
  const guestStore = resolveActivityStore(user, 'guest', storeLookup, openid);
  const guestStoreId = guestStore ? String(guestStore.store_id || '').trim() : '';
  return {
    role: 'guest',
    store: guestStore,
    storeId: guestStoreId
  };
}

function activityUserKey(user, openid) {
  if (user && user._id) return String(user._id);
  return String(openid || '').trim();
}

async function writeActivity({ openid, client, user, stores }) {
  const now = Date.now();
  const day = cnDayKey(now);
  const userKey = activityUserKey(user, openid);
  if (!userKey) return null;

  let storeLookup = stores ? buildStoreLookup(stores) : { byId: new Map(), byOpenid: new Map() };
  if (!stores) {
    const openids = activityOpenids(user, openid);
    const query = [];
    const merchantHint = userFields.resolveMerchantStoreId(user);
    const visitHint = userFields.resolveVisitStoreId(user);
    if (merchantHint) query.push({ store_id: merchantHint });
    if (visitHint && visitHint !== merchantHint) query.push({ store_id: visitHint });
    if (openids.length) {
      query.push({ ownerOpenid: { $in: openids } });
      query.push({ staffOpenids: { $in: openids } });
    }
    const found = query.length
      ? await db.findMany('stores', { $or: query }, { limit: 8 })
      : [];
    storeLookup = buildStoreLookup(found);
  }

  const resolved = resolveActivityIdentity(user, storeLookup, openid);
  const role = resolved.role;
  const store = resolved.store;
  const storeId = resolved.storeId;
  const cacheKey = `${day}:${userKey}:${role}:${storeId}`;
  if (!rememberSeen(day, cacheKey)) return null;

  const doc = {
    day,
    userKey,
    role,
    client: role === 'merchant' ? 'merchant' : (client === 'merchant' ? 'merchant' : 'user'),
    storeId,
    storeName: storeNameOf(store, storeId),
    merchantRole: role === 'merchant' ? resolveMerchantRole(user, store, openid) : '',
    displayName: displayNameOf(user),
    openid: String(openid || (user && user.openid) || '').trim(),
    openids: activityOpenids(user, openid),
    createTime: now
  };

  await ensureReady();
  try {
    const col = db.collection(COLLECTION);
    await col.updateOne(
      { day, userKey, role },
      {
        $setOnInsert: {
          day,
          userKey,
          role,
          openid: doc.openid,
          openids: doc.openids,
          createTime: now
        },
        $set: {
          client: doc.client,
          storeId: doc.storeId,
          storeName: doc.storeName,
          merchantRole: doc.merchantRole,
          displayName: doc.displayName,
          openid: doc.openid,
          openids: doc.openids,
          updateTime: now
        }
      },
      { upsert: true }
    );
    await col.deleteMany({ day, userKey, role: { $ne: role } });
  } catch (err) {
    forgetSeen(cacheKey);
    if (!(err && err.code === 11000)) throw err;
  }
  return doc;
}

function recordActivity({ openid, client, user, stores } = {}) {
  const trimmed = String(openid || (user && user.openid) || '').trim();
  if (!trimmed && !(user && user._id)) return;

  Promise.resolve()
    .then(async () => {
      let resolved = user;
      if (!resolved && trimmed) {
        resolved = await identity.findPrimaryUserByOpenid(trimmed);
      }
      await writeActivity({
        openid: trimmed || (resolved && resolved.openid) || '',
        client,
        user: resolved,
        stores
      });
    })
    .catch((err) => {
      console.warn('[userActivity] record failed', (err && err.message) || err);
    });
}

function merchantOpenidSet(stores) {
  const set = new Set();
  (stores || []).forEach((store) => {
    if (!store || store.merchantApplyStatus !== 'approved') return;
    const owner = String(store.ownerOpenid || '').trim();
    if (owner) set.add(owner);
    (Array.isArray(store.staffOpenids) ? store.staffOpenids : []).forEach((id) => {
      const staff = String(id || '').trim();
      if (staff) set.add(staff);
    });
  });
  return set;
}

async function seedTodayFromUsers({ now = Date.now(), stores = [], excludedOpenids = [] } = {}) {
  const todayStart = cnDayStart(0, now);
  const day = cnDayKey(now);
  if (seededDay === day) return 0;
  const excluded = new Set(excludedOpenids || []);
  const users = await db.collection('users')
    .find({
      updateTime: { $gte: todayStart },
      ...(excluded.size ? { openid: { $nin: [...excluded] } } : {})
    })
    .project({
      openid: 1,
      openids: 1,
      linkedOpenids: 1,
      nickName: 1,
      realName: 1,
      merchantRole: 1,
      merchantStatus: 1,
      isMerchant: 1,
      merchantStoreId: 1,
      visitStoreId: 1,
      store_id: 1
    })
    .limit(5000)
    .toArray();

  const storeLookup = buildStoreLookup(stores);
  await ensureReady();
  const col = db.collection(COLLECTION);
  const ops = [];

  users.forEach((user) => {
    const openids = activityOpenids(user, user.openid);
    if (openids.some((id) => excluded.has(id))) return;
    const resolved = resolveActivityIdentity(user, storeLookup, user.openid);
    const role = resolved.role;
    const store = resolved.store;
    const storeId = resolved.storeId;
    const userKey = activityUserKey(user, user.openid);
    if (!userKey) return;
    const createTime = now;
    ops.push({
      updateOne: {
        filter: { day, userKey, role },
        update: {
          $setOnInsert: {
            day,
            userKey,
            role,
            openid: String(user.openid || '').trim(),
            openids,
            createTime,
            seeded: true
          },
          $set: {
            client: role === 'merchant' ? 'merchant' : 'user',
            storeId,
            storeName: storeNameOf(store, storeId),
            merchantRole: role === 'merchant' ? resolveMerchantRole(user, store, user.openid) : '',
            displayName: displayNameOf(user),
            openid: String(user.openid || '').trim(),
            openids,
            updateTime: createTime
          }
        },
        upsert: true
      }
    });
    ops.push({
      deleteMany: {
        filter: { day, userKey, role: { $ne: role } }
      }
    });
  });

  if (ops.length) {
    await col.bulkWrite(ops, { ordered: false });
  }
  seededDay = day;
  return ops.length;
}

async function loadUsersByOpenids(openids) {
  const ids = [...new Set((openids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const rows = [];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const found = await db.collection('users')
      .find({
        $or: [
          { openid: { $in: chunk } },
          { 'openids.user': { $in: chunk } },
          { 'openids.merchant': { $in: chunk } },
          { linkedOpenids: { $in: chunk } }
        ]
      })
      .project({
        openid: 1,
        openids: 1,
        linkedOpenids: 1,
        nickName: 1,
        realName: 1,
        merchantRole: 1,
        merchantStatus: 1,
        isMerchant: 1,
        merchantStoreId: 1,
        visitStoreId: 1,
        store_id: 1,
        updateTime: 1
      })
      .toArray();
    rows.push(...found);
  }
  return rows;
}

function indexUsersByOpenid(users) {
  const map = new Map();
  (users || []).forEach((user) => {
    identity.collectOpenids(user).forEach((id) => {
      if (id && !map.has(id)) map.set(id, user);
    });
  });
  return map;
}

async function collectExistingApiActivity({
  now = Date.now(),
  start,
  stores = []
} = {}) {
  const dayStart = Number(start) || cnDayStart(6, now);
  const storeById = {};
  (stores || []).forEach((store) => {
    const storeId = String((store && store.store_id) || '').trim();
    if (storeId) storeById[storeId] = store;
  });

  const [orders, dailyLogs, recentUsers, pets] = await Promise.all([
    db.collection('orders')
      .find({ createTime: { $gte: dayStart, $lte: now } })
      .project({
        userOpenid: 1,
        merchantOpenid: 1,
        store_id: 1,
        createTime: 1
      })
      .limit(8000)
      .toArray()
      .catch(() => []),
    db.collection('daily_logs')
      .find({
        $or: [
          { createTime: { $gte: dayStart, $lte: now } },
          { publishedAt: { $gte: dayStart, $lte: now } },
          { userViewedAt: { $gte: dayStart, $lte: now } }
        ]
      })
      .project({
        store_id: 1,
        merchantOpenid: 1,
        userOpenid: 1,
        createTime: 1,
        publishedAt: 1,
        userViewedAt: 1,
        status: 1
      })
      .limit(8000)
      .toArray()
      .catch(() => []),
    db.collection('users')
      .find({ updateTime: { $gte: dayStart, $lte: now } })
      .project({
        openid: 1,
        openids: 1,
        linkedOpenids: 1,
        nickName: 1,
        realName: 1,
        merchantRole: 1,
        merchantStatus: 1,
        isMerchant: 1,
        merchantStoreId: 1,
        visitStoreId: 1,
        store_id: 1,
        updateTime: 1
      })
      .limit(8000)
      .toArray()
      .catch(() => []),
    db.collection('pets')
      .find({ createTime: { $gte: dayStart, $lte: now } })
      .project({ ownerOpenid: 1, createTime: 1 })
      .limit(5000)
      .toArray()
      .catch(() => [])
  ]);

  const openids = [];
  (orders || []).forEach((order) => {
    if (order.userOpenid) openids.push(order.userOpenid);
    if (order.merchantOpenid) openids.push(order.merchantOpenid);
  });
  (dailyLogs || []).forEach((log) => {
    if (log.userOpenid) openids.push(log.userOpenid);
    if (log.merchantOpenid) openids.push(log.merchantOpenid);
  });
  (pets || []).forEach((pet) => {
    if (pet.ownerOpenid) openids.push(pet.ownerOpenid);
  });

  const extraUsers = await loadUsersByOpenids(openids);
  const users = [...recentUsers, ...extraUsers];
  const userByOpenid = indexUsersByOpenid(users);

  return recordsFromExistingApiData({
    orders,
    dailyLogs,
    users: recentUsers,
    pets,
    dayStart,
    now,
    dayKeyFn: cnDayKey,
    storeById,
    userByOpenid,
    merchantOpenids: merchantOpenidSet(stores)
  });
}

async function buildDauTrend({
  now = Date.now(),
  days = 7,
  stores = [],
  excludedOpenids = [],
  excludedStoreIds = []
} = {}) {
  const start = cnDayStart(Math.max(days, 1) - 1, now);
  const dayKeys = [];
  for (let i = Math.max(days, 1) - 1; i >= 0; i -= 1) {
    dayKeys.push(cnDayKey(cnDayStart(i, now)));
  }

  await ensureReady();
  try {
    await seedTodayFromUsers({ now, stores, excludedOpenids });
  } catch (err) {
    console.warn('[userActivity] seed today failed', (err && err.message) || err);
  }

  const [records, historical] = await Promise.all([
    db.collection(COLLECTION)
      .find({ day: { $gte: cnDayKey(start) } })
      .project({
        day: 1,
        userKey: 1,
        role: 1,
        storeId: 1,
        storeName: 1,
        merchantRole: 1,
        displayName: 1,
        openid: 1,
        openids: 1
      })
      .toArray()
      .catch(() => []),
    collectExistingApiActivity({ now, start, stores }).catch((err) => {
      console.warn('[userActivity] existing api activity failed', (err && err.message) || err);
      return [];
    })
  ]);

  const storeNameById = {};
  (stores || []).forEach((store) => {
    const storeId = String((store && store.store_id) || '').trim();
    if (!storeId) return;
    storeNameById[storeId] = storeNameOf(store, storeId);
  });

  return aggregateDauTrend([...(records || []), ...(historical || [])], {
    dayKeys,
    storeNameById,
    excludedOpenids,
    excludedStoreIds
  });
}

async function initialize() {
  await ensureReady();
}

module.exports = {
  COLLECTION,
  UNBOUND_STORE_NAME,
  NATURAL_TRAFFIC_NAME,
  cnDayKey,
  cnDayStart,
  normalizeRole,
  aggregateDauTrend,
  recordActivity,
  buildDauTrend,
  seedTodayFromUsers,
  initialize
};
