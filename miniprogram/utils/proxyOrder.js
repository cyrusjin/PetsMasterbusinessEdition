const orderApi = require('./order');
const { buildPetSnapshot } = require('./petSnapshot');
const { resolveShareImageUrl } = require('./storeShare');
const { formatAgeText } = require('./petAge');

const DRAFT_PETS_KEY = 'pet_proxy_draft_pets';
const UNASSIGNED_PETS_KEY = 'pet_proxy_unassigned_pets';
const SESSION_KEY = 'pet_proxy_session';
const CLAIM_PREFIX = 'pet_proxy_claim_';
const PROXY_CLAIM_PATH = 'packageUser/user/proxy-claim/proxy-claim';
const PROXY_HOME_PATH = 'pages/index/index';
const PROXY_GUEST_PICKER_PATH = '/packageExtra/customers/customers?mode=proxy';
const UNASSIGNED_GUEST_ID = 'unassigned';

function createProxyToken() {
  return `px_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readJson(key, fallback) {
  try {
    const raw = wx.getStorageSync(key);
    return raw == null || raw === '' ? fallback : raw;
  } catch (err) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (err) {
    // ignore quota
  }
}

function listDraftPets() {
  const list = readJson(DRAFT_PETS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function getDraftPet(petId) {
  const id = String(petId || '').trim();
  if (!id) return null;
  return listDraftPets().find((pet) => pet && pet.id === id) || null;
}

function upsertDraftPet(pet) {
  const next = { ...(pet || {}) };
  if (!next.id) {
    next.id = `pp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
  const list = listDraftPets();
  const idx = list.findIndex((item) => item && item.id === next.id);
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  writeJson(DRAFT_PETS_KEY, list);
  return next;
}

function clearDraftPets() {
  try {
    wx.removeStorageSync(DRAFT_PETS_KEY);
  } catch (err) {
    writeJson(DRAFT_PETS_KEY, []);
  }
}

function isUnassignedSession(session) {
  return !!(session && (session.isNew || session.customerId === UNASSIGNED_GUEST_ID));
}

function listUnassignedPets() {
  const list = readJson(UNASSIGNED_PETS_KEY, []);
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

function getUnassignedPet(petId) {
  const id = String(petId || '').trim();
  if (!id) return null;
  return listUnassignedPets().find((pet) => pet && pet.id === id) || null;
}

function upsertUnassignedPet(pet) {
  const next = { ...(pet || {}) };
  if (!next.id) {
    next.id = `pp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }
  const list = listUnassignedPets();
  const idx = list.findIndex((item) => item && item.id === next.id);
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  writeJson(UNASSIGNED_PETS_KEY, list);
  return next;
}

function removeUnassignedPetsByIds(ids) {
  const idSet = {};
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    const key = String(id || '').trim();
    if (key) idSet[key] = true;
  });
  if (!Object.keys(idSet).length) return listUnassignedPets();
  const next = listUnassignedPets().filter((pet) => !pet || !idSet[String(pet.id || '')]);
  writeJson(UNASSIGNED_PETS_KEY, next);
  return next;
}

function consumeUnassignedPetsFromOrders(orders) {
  const ids = (Array.isArray(orders) ? orders : [])
    .map((order) => order && (order.petId || order.pet_id))
    .filter(Boolean);
  return removeUnassignedPetsByIds(ids);
}

function customerPetFromDraft(pet) {
  const source = pet || {};
  const name = String(source.name || '').trim() || '未命名宠物';
  const ageText = formatAgeText(source) || '';
  const type = String(source.type || source.petType || '').trim();
  const breed = String(source.breed || '').trim();
  const gender = String(source.gender || '').trim();
  const metaParts = [type, breed, gender, ageText].filter(Boolean);
  return {
    key: source.id ? `id:${source.id}` : `name:${name}`,
    petId: String(source.id || '').trim(),
    name,
    type,
    breed,
    gender,
    age: source.age,
    ageText,
    weight: source.weight,
    weightText: source.weight !== '' && source.weight != null ? `${source.weight}kg` : '',
    photo: source.photo || '',
    metaText: metaParts.join(' · ') || '暂无更多信息',
    snapshot: source
  };
}

function buildUnassignedGuest() {
  const pets = listUnassignedPets().map(customerPetFromDraft);
  if (!pets.length) return null;
  return {
    id: UNASSIGNED_GUEST_ID,
    name: '未分配客人',
    isUnassigned: true,
    phone: '',
    nickName: '',
    avatarText: '未',
    orderCount: 0,
    lastOrderTime: 0,
    lastOrderTimeText: '',
    petCount: pets.length,
    pets,
    metaText: `尚未绑定客人 · ${pets.length}只宠物`
  };
}

function readProxySession() {
  const session = readJson(SESSION_KEY, null);
  return session && typeof session === 'object' ? session : null;
}

function saveProxySession(session) {
  if (!session || typeof session !== 'object') {
    clearProxySession();
    return null;
  }
  writeJson(SESSION_KEY, session);
  return session;
}

function clearProxySession() {
  try {
    wx.removeStorageSync(SESSION_KEY);
  } catch (err) {
    writeJson(SESSION_KEY, null);
  }
}

function draftPetFromCustomerPet(pet) {
  const snap = (pet && pet.snapshot) || {};
  const id = String((pet && (pet.petId || pet.id)) || snap.id || '').trim();
  return {
    ...snap,
    id: id || undefined,
    name: (pet && pet.name) || snap.name || '',
    type: (pet && pet.type) || snap.type || '',
    breed: (pet && pet.breed) || snap.breed || '',
    gender: (pet && pet.gender) || snap.gender || '',
    photo: (pet && pet.photo) || snap.photo || '',
    weight: pet && pet.weight !== '' && pet.weight != null ? pet.weight : snap.weight,
    age: pet && pet.age !== '' && pet.age != null ? pet.age : snap.age,
    ageYears: snap.ageYears != null ? snap.ageYears : (pet && pet.ageYears),
    ageMonths: snap.ageMonths != null ? snap.ageMonths : (pet && pet.ageMonths)
  };
}

function startProxySessionFromCustomer(customer) {
  clearDraftPets();
  const pets = Array.isArray(customer && customer.pets) ? customer.pets : [];
  pets.forEach((pet) => {
    upsertDraftPet(draftPetFromCustomerPet(pet));
  });
  const unassigned = !!(customer && (customer.isUnassigned || customer.id === UNASSIGNED_GUEST_ID));
  return saveProxySession({
    customerId: (customer && customer.id) || '',
    contactName: unassigned ? '' : ((customer && (customer.name || customer.nickName)) || ''),
    contactPhone: unassigned ? '' : ((customer && customer.phone) || ''),
    isNew: unassigned
  });
}

function startNewProxyGuestSession() {
  clearDraftPets();
  return saveProxySession({
    customerId: '',
    contactName: '',
    contactPhone: '',
    isNew: true
  });
}

function buildProxyReserveUrl(serviceLine) {
  const line = String(serviceLine || '').trim();
  const parts = ['proxy=1'];
  if (line) parts.push(`serviceLine=${encodeURIComponent(line)}`);
  return `/packageUser/user/reserve/reserve?${parts.join('&')}`;
}

function buildProxyPetFormUrl(serviceLine, extra = {}) {
  const line = String(serviceLine || extra.serviceLine || '').trim();
  const parts = ['proxy=1'];
  if (extra.next) parts.push(`next=${encodeURIComponent(extra.next)}`);
  if (extra.pool) parts.push(`pool=${encodeURIComponent(extra.pool)}`);
  if (line) parts.push(`serviceLine=${encodeURIComponent(line)}`);
  return `/packageUser/user/pet-form/pet-form?${parts.join('&')}`;
}

function stashProxyClaim(token, payload) {
  const key = String(token || '').trim();
  if (!key) return;
  writeJson(CLAIM_PREFIX + key, {
    token: key,
    ...(payload || {}),
    savedAt: Date.now()
  });
}

function readStashedProxyClaim(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  const payload = readJson(CLAIM_PREFIX + key, null);
  return payload && typeof payload === 'object' ? payload : null;
}

function isProxyOrder(order) {
  return !!(order && (order.placedByMerchant || order.proxyClaimToken));
}

function canShareProxyOrder(order) {
  return !!(order && order.placedByMerchant && order.proxyClaimToken);
}

function confirmedProxyStatus(order) {
  const status = order && order.status;
  if (status === 'boarding' || status === 'completed' || status === 'cancelled') {
    return status;
  }
  return 'awaiting_arrival';
}

function attachProxyFields(order, token) {
  const claimToken = String(token || '').trim();
  if (!order || !claimToken) return order;
  return {
    ...order,
    placedByMerchant: true,
    proxyClaimed: false,
    proxyOwnerPending: true,
    proxyClaimToken: claimToken,
    pricePendingConfirm: false,
    editPendingConfirm: false,
    status: confirmedProxyStatus(order)
  };
}

function extractProxyClaimToken(options) {
  if (!options) return '';
  const query = options.query || options;
  return String((query && (query.token || query.proxy_token)) || '').trim();
}

function buildProxySharePath(storeId, token) {
  const id = String(storeId || '').trim();
  const claimToken = String(token || '').trim();
  const parts = [];
  if (id) parts.push(`store_id=${encodeURIComponent(id)}`);
  if (claimToken) parts.push(`token=${encodeURIComponent(claimToken)}`);
  if (!parts.length) return PROXY_HOME_PATH;
  return `${PROXY_HOME_PATH}?${parts.join('&')}`;
}

function buildProxyShareConfig({ shop, storeId, token, petName } = {}) {
  const id = String(storeId || (shop && shop.store_id) || '').trim();
  const name = (shop && shop.name) || '本店';
  const pet = String(petName || '').trim();
  const title = pet
    ? `${name}已为「${pet}」代下预约，点开查看`
    : `${name}已为您代下预约，点开查看`;
  return {
    title,
    path: buildProxySharePath(id, token),
    imageUrl: resolveShareImageUrl(shop)
  };
}

function openUrl(url, options = {}) {
  const failToast = () => wx.showToast({
    title: options.failTitle || '无法打开页面',
    icon: 'none'
  });
  if (options.redirect) {
    wx.redirectTo({ url, fail: failToast });
    return;
  }
  wx.navigateTo({ url, fail: failToast });
}

function openProxyGuestPicker(serviceLine, options = {}) {
  const line = String(serviceLine || '').trim();
  const extra = [];
  if (line) extra.push(`serviceLine=${encodeURIComponent(line)}`);
  if (options.continueOrder) extra.push('continueOrder=1');
  const url = extra.length
    ? `${PROXY_GUEST_PICKER_PATH}&${extra.join('&')}`
    : PROXY_GUEST_PICKER_PATH;
  openUrl(url, { ...options, failTitle: '无法打开客人列表' });
}

function openProxyReserve(serviceLine, options = {}) {
  if (options.clearDrafts !== false) {
    clearDraftPets();
    if (!options.keepSession) clearProxySession();
  }
  openUrl(buildProxyReserveUrl(serviceLine), { ...options, failTitle: '无法打开预约页' });
}

function openProxyPetForm(serviceLine, options = {}) {
  openUrl(buildProxyPetFormUrl(serviceLine, options), {
    ...options,
    failTitle: '无法打开宠物档案'
  });
}

function petsFromClaim(claim) {
  if (Array.isArray(claim && claim.pets) && claim.pets.length) {
    return claim.pets.filter(Boolean);
  }
  const map = new Map();
  ((claim && claim.orders) || []).forEach((order) => {
    if (!order) return;
    const id = String(order.petId || order.pet_id || '').trim() || `tmp_${map.size}`;
    if (map.has(id)) return;
    const snap = order.petSnapshot || {};
    map.set(id, {
      ...snap,
      id,
      name: order.petName || snap.name || '',
      type: order.petType || snap.type || '',
      photo: snap.photo || order.petPhoto || '',
      breed: snap.breed || order.petBreed || '',
      gender: snap.gender || order.petGender || '',
      weight: snap.weight || order.petWeight || '',
      age: snap.age || order.petAge || '',
      ageYears: snap.ageYears != null ? snap.ageYears : order.petAgeYears,
      ageMonths: snap.ageMonths != null ? snap.ageMonths : order.petAgeMonths
    });
  });
  return Array.from(map.values());
}

function saveClaimPet(app, pet) {
  const payload = {
    ...pet,
    id: '',
    pet_id: '',
    petSnapshot: undefined
  };
  if (app && app.globalData && app.globalData.env && typeof app.savePet === 'function') {
    return app.savePet(payload);
  }
  const saved = {
    ...payload,
    id: `pet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  };
  if (app && typeof app._upsertLocalPet === 'function') {
    app._upsertLocalPet(saved);
  }
  return Promise.resolve(saved);
}

function runSerial(list, mapper) {
  const items = Array.isArray(list) ? list : [];
  const out = [];
  const next = (index) => {
    if (index >= items.length) return Promise.resolve(out);
    return Promise.resolve(mapper(items[index], index)).then((item) => {
      out.push(item);
      return next(index + 1);
    });
  };
  return next(0);
}

function bindClaimPetsAndOrders(app, claim) {
  const orders = ((claim && claim.orders) || []).filter(Boolean);
  const draftPets = petsFromClaim(claim);
  if (!orders.length) {
    return Promise.reject(new Error('未找到待领取的代下单'));
  }

  return runSerial(draftPets, (pet) => saveClaimPet(app, pet)).then((savedPets) => {
    const idMap = {};
    draftPets.forEach((pet, index) => {
      if (pet && pet.id && savedPets[index] && savedPets[index].id) {
        idMap[pet.id] = savedPets[index].id;
      }
    });
    const fallbackPetId = savedPets[0] && savedPets[0].id;

    return runSerial(orders, (order) => {
      const newPetId = idMap[order.petId] || idMap[order.pet_id] || fallbackPetId || order.petId;
      const savedPet = savedPets.find((pet) => pet && pet.id === newPetId) || savedPets[0];
      const patch = {
        petId: newPetId,
        petPhoto: (savedPet && savedPet.photo) || order.petPhoto || '',
        petSnapshot: savedPet ? buildPetSnapshot(savedPet) : order.petSnapshot,
        proxyClaimed: true,
        proxyClaimedAt: Date.now(),
        proxyOwnerPending: false,
        pricePendingConfirm: false,
        editPendingConfirm: false,
        status: confirmedProxyStatus(order)
      };
      const applyLocal = (updated) => {
        const next = { ...(updated || order), ...patch, id: (updated && updated.id) || order.id };
        if (app && typeof app._upsertLocalOrder === 'function') {
          app._upsertLocalOrder(next);
        }
        return next;
      };
      if (app && app.globalData && app.globalData.env && order.id && typeof app.updateOrder === 'function') {
        return app.updateOrder(order.id, patch)
          .then((updated) => applyLocal(updated || order))
          .catch(() => applyLocal(order));
      }
      return Promise.resolve(applyLocal(order));
    }).then((claimedOrders) => ({
      success: true,
      orders: claimedOrders,
      pets: savedPets
    }));
  });
}

function cacheClaimResult(app, result) {
  const orders = ((result && result.orders) || []).map((order) => ({
    ...order,
    proxyClaimed: true,
    proxyOwnerPending: false,
    pricePendingConfirm: false,
    editPendingConfirm: false,
    status: confirmedProxyStatus(order)
  }));
  orders.forEach((order) => {
    if (app && typeof app._upsertLocalOrder === 'function') {
      app._upsertLocalOrder(order);
    }
  });
  ((result && result.pets) || []).forEach((pet) => {
    if (app && typeof app._upsertLocalPet === 'function') {
      app._upsertLocalPet(pet);
    }
  });
  return {
    ...(result || {}),
    orders
  };
}

function alreadyClaimedLocally(app, token) {
  const key = String(token || '').trim();
  if (!key || !app || typeof app.getOrders !== 'function') return [];
  return (app.getOrders() || []).filter((order) => (
    order && order.proxyClaimToken === key && order.proxyClaimed
  ));
}

function claimProxyOrdersForGuest(app, token) {
  const claimToken = String(token || '').trim();
  if (!claimToken) {
    return Promise.reject(new Error('领取链接无效'));
  }

  const localClaimed = alreadyClaimedLocally(app, claimToken);
  if (localClaimed.length) {
    return Promise.resolve({
      success: true,
      alreadyClaimed: true,
      orders: localClaimed,
      pets: []
    });
  }

  const fallbackLocal = () => {
    const local = readStashedProxyClaim(claimToken);
    if (!local) return Promise.reject(new Error('领取失败，请让商家重新发送'));
    return bindClaimPetsAndOrders(app, local);
  };

  if (!(app && app.globalData && app.globalData.env)) {
    return fallbackLocal();
  }

  return orderApi.claimProxyOrders({
    token: claimToken,
    confirmed: true,
    status: 'awaiting_arrival'
  })
    .then((res) => {
      if (res && res.success) {
        return cacheClaimResult(app, {
          success: true,
          alreadyClaimed: !!res.alreadyClaimed,
          orders: res.orders || [],
          pets: res.pets || []
        });
      }
      throw new Error((res && res.errMsg) || '领取失败');
    })
    .catch((err) => orderApi.getProxyOrderClaim({ token: claimToken })
      .then((res) => {
        const claim = (res && (res.claim || res.data)) || (res && res.success ? res : null);
        const orders = (claim && claim.orders) || (res && res.orders);
        if (res && res.success && Array.isArray(orders) && orders.length) {
          return bindClaimPetsAndOrders(app, {
            ...(claim || {}),
            orders,
            pets: (claim && claim.pets) || res.pets
          });
        }
        throw err;
      })
      .catch(() => fallbackLocal().catch(() => {
        throw err;
      })));
}

module.exports = {
  PROXY_CLAIM_PATH,
  PROXY_GUEST_PICKER_PATH,
  UNASSIGNED_GUEST_ID,
  createProxyToken,
  listDraftPets,
  getDraftPet,
  upsertDraftPet,
  clearDraftPets,
  listUnassignedPets,
  getUnassignedPet,
  upsertUnassignedPet,
  removeUnassignedPetsByIds,
  consumeUnassignedPetsFromOrders,
  buildUnassignedGuest,
  isUnassignedSession,
  readProxySession,
  saveProxySession,
  clearProxySession,
  startProxySessionFromCustomer,
  startNewProxyGuestSession,
  stashProxyClaim,
  readStashedProxyClaim,
  isProxyOrder,
  canShareProxyOrder,
  attachProxyFields,
  extractProxyClaimToken,
  buildProxySharePath,
  buildProxyShareConfig,
  buildProxyReserveUrl,
  buildProxyPetFormUrl,
  openProxyGuestPicker,
  openProxyReserve,
  openProxyPetForm,
  claimProxyOrdersForGuest
};
