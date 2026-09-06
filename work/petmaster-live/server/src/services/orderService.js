const db = require('../db');
const identity = require('./identity');
const userFields = require('./userFields');
const notifyService = require('./notifyService');
const crypto = require('crypto');
const membershipService = require('./membershipService');

const INSURANCE_SHARE_COLLECTION = 'insurance_share_links';
const INSURANCE_EVENT_COLLECTION = 'insurance_events';
const INSURANCE_SHARE_TTL_MS = 6 * 60 * 60 * 1000;
const INSURANCE_COMMISSION_RATE = 0.1;

let growthCollectionsPromise = null;
function ensureGrowthCollections() {
  if (!growthCollectionsPromise) {
    growthCollectionsPromise = db.ensureCollections(['promotion_events', 'customer_tags']).then(async () => {
      try {
        await db.collection('promotion_events').createIndex({ store_id: 1, createTime: -1 });
        await db.collection('promotion_events').createIndex({ store_id: 1, shareCode: 1, type: 1 });
        await db.collection('customer_tags').createIndex({ store_id: 1, customer_key: 1 }, { unique: true });
      } catch (err) {
        console.warn('[growth] index setup skipped:', err.message || err);
      }
    }).catch((err) => {
      growthCollectionsPromise = null;
      throw err;
    });
  }
  return growthCollectionsPromise;
}

let insuranceShareCollectionPromise = null;
function ensureInsuranceShareCollection() {
  if (!insuranceShareCollectionPromise) {
    insuranceShareCollectionPromise = db.ensureCollections([
      INSURANCE_SHARE_COLLECTION,
      INSURANCE_EVENT_COLLECTION
    ]).then(async () => {
      try {
        const collection = db.collection(INSURANCE_SHARE_COLLECTION);
        await collection.createIndex({ shareToken: 1 }, { unique: true });
        await collection.createIndex({ store_id: 1, createTime: -1 });
        await collection.createIndex({ expireAtDate: 1 }, { expireAfterSeconds: 0 });
        const eventCollection = db.collection(INSURANCE_EVENT_COLLECTION);
        await eventCollection.createIndex({ eventType: 1, eventId: 1 }, { unique: true });
        await eventCollection.createIndex({ source: 1, createTime: -1 });
        await eventCollection.createIndex({ store_id: 1, createTime: -1 });
      } catch (err) {
        console.warn('[insurance-share] index setup skipped:', err.message || err);
      }
    }).catch((err) => {
      insuranceShareCollectionPromise = null;
      throw err;
    });
  }
  return insuranceShareCollectionPromise;
}

function normalizePromotion(value, storeId) {
  if (!value || typeof value !== 'object') return null;
  const shareCode = String(value.shareCode || '').trim().slice(0, 80);
  const source = String(value.source || '').trim().slice(0, 40);
  if (!shareCode && !source) return null;
  return { shareCode, source, store_id: storeId };
}

function hashViewer(openid) {
  return crypto.createHash('sha256').update(String(openid || '')).digest('hex').slice(0, 32);
}

function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

const ORDER_STATUSES = ['pending', 'confirmed', 'awaiting_arrival', 'boarding', 'toPay', 'completed', 'cancelled'];
const EDITABLE_PRICE_STATUSES = ['pending', 'confirmed', 'awaiting_arrival', 'boarding'];
const MERCHANT_PATCH_FIELDS = ['pickupOutboundDone', 'pickupReturnDone'];
const USER_CANCEL_STATUSES = ['pending', 'confirmed', 'awaiting_arrival'];
const USER_EDIT_STATUSES = ['pending', 'confirmed', 'awaiting_arrival', 'boarding'];
const USER_EDIT_FIELDS_FULL = [
  'startDate', 'endDate', 'startTime', 'endTime', 'days',
  'contactName', 'contactPhone', 'contactIdCard', 'emergencyPhone', 'specialNeeds',
  'needPickup', 'pickupAddress', 'pickupLocationName', 'pickupLatitude', 'pickupLongitude',
  'pickupContactPhone', 'pickupTime', 'pickupIncludeOutbound', 'pickupIncludeReturn',
  'needWash', 'washFee',
  'visitFee', 'visitAddress', 'visitLocationName', 'visitLatitude', 'visitLongitude',
  'visitDistanceKm', 'visitDistanceMode', 'visitRoomNo', 'visitEntryMethod',
  'valueAddedFee', 'valueAddedServices',
  'boardingFee', 'shippingFee', 'totalFee', 'feeSnapshot', 'basePrice'
];
const USER_EDIT_FIELDS_BOARDING = [
  'endDate', 'endTime', 'days',
  'needWash', 'washFee',
  'visitFee',
  'boardingFee', 'shippingFee', 'totalFee', 'feeSnapshot', 'basePrice'
];

function parseFee(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : fallback;
}

function getOrderServiceLine(doc) {
  const raw = String((doc && (doc.serviceLine || doc.serviceKind)) || '').trim();
  if (raw === 'wash' || raw === 'homeFeeding') return raw;
  const snapLine = doc && doc.feeSnapshot && doc.feeSnapshot.serviceLine;
  if (snapLine === 'wash' || snapLine === 'homeFeeding') return snapLine;
  return '';
}

function hasValueAddedServices(doc) {
  if (Array.isArray(doc && doc.valueAddedServices) && doc.valueAddedServices.length > 0) return true;
  const snap = doc && doc.feeSnapshot && doc.feeSnapshot.valueAdded;
  return !!(snap && Array.isArray(snap.items) && snap.items.length);
}

function normalizeOrderFees(doc) {
  const needPickup = !!doc.needPickup;
  const needWash = !!doc.needWash;
  const serviceLine = getOrderServiceLine(doc);
  const hasValueAdded = hasValueAddedServices(doc);
  const totalFee = parseFee(doc.totalFee, 0);
  let boardingFee = parseFee(doc.boardingFee, NaN);
  let shippingFee = parseFee(doc.shippingFee, 0);
  let washFee = parseFee(doc.washFee, 0);
  let visitFee = parseFee(doc.visitFee, 0);
  let valueAddedFee = parseFee(doc.valueAddedFee, 0);

  if (!needPickup) {
    shippingFee = 0;
  }
  if (!needWash && serviceLine !== 'wash') {
    washFee = 0;
  }
  if (!hasValueAdded) {
    valueAddedFee = 0;
  } else if (!(valueAddedFee > 0) && doc.feeSnapshot && doc.feeSnapshot.valueAdded) {
    valueAddedFee = parseFee(doc.feeSnapshot.valueAdded.fee, 0);
  }

  if (!Number.isFinite(boardingFee)) {
    boardingFee = Math.max(0, totalFee - shippingFee - washFee - visitFee - valueAddedFee);
  }

  return {
    boardingFee,
    shippingFee,
    washFee,
    visitFee,
    valueAddedFee,
    needWash,
    totalFee: parseFee(boardingFee + shippingFee + washFee + visitFee + valueAddedFee, totalFee)
  };
}

function buildOrderId() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DISPLAY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function buildRandomDisplayNo(length = 10) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += DISPLAY_CODE_CHARS[Math.floor(Math.random() * DISPLAY_CODE_CHARS.length)];
  }
  return out;
}

function deriveDisplayNo(seed, length = 10) {
  const str = String(seed || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  let state = hash >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += DISPLAY_CODE_CHARS[state % DISPLAY_CODE_CHARS.length];
  }
  return out;
}

function resolveStoreDisplayNo(doc) {
  if (!doc) return '';
  if (doc.displayNo) return String(doc.displayNo).trim();
  const seed = doc.store_id || '';
  return seed ? deriveDisplayNo(`store:${seed}`, 8) : '';
}

function formatOrderDisplayTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/** 订单号：店铺编号 + yyyyMMddHHmmss + 4位随机 */
function buildOrderDisplayNo(storeDisplayNo, now = Date.now()) {
  const storePart = String(storeDisplayNo || '').trim() || '00000000';
  const timePart = formatOrderDisplayTime(new Date(now));
  const randomPart = buildRandomDisplayNo(4);
  return `${storePart}${timePart}${randomPart}`;
}

function resolveOrderDisplayNo(doc) {
  if (!doc) return '';
  if (doc.displayNo) return String(doc.displayNo).trim();
  const seed = doc.order_id || '';
  return seed ? deriveDisplayNo(`order:${seed}`) : '';
}

function buildPetSnapshotFromDoc(pet) {
  if (!pet) return null;
  return {
    photo: pet.photo || '',
    breed: pet.breed || '',
    gender: pet.gender || '',
    age: pet.age != null ? String(pet.age) : '',
    weight: pet.weight != null ? String(pet.weight) : '',
    color: pet.color || '',
    vaccination: pet.vaccination || '',
    dewormDate: pet.dewormDate || '',
    allergyStatus: pet.allergyStatus || '',
    allergy: pet.allergy || '',
    medicalHistoryStatus: pet.medicalHistoryStatus || '',
    medicalHistory: pet.medicalHistory || '',
    isPregnant: pet.isPregnant || '',
    inHeat: pet.inHeat || '',
    isNeutered: pet.isNeutered || '',
    hasDogLicense: pet.hasDogLicense || '',
    character: pet.character || '',
    dietTaboo: pet.dietTaboo || '',
    specialCare: pet.specialCare || '',
    remark: pet.remark || ''
  };
}

function mergePetSnapshot(stored, petDoc, orderDoc) {
  const fromPet = buildPetSnapshotFromDoc(petDoc) || {};
  const fromStored = stored && typeof stored === 'object' ? stored : {};
  const breed = fromStored.breed || fromPet.breed || orderDoc.petBreed || '';
  const photo = fromStored.photo || fromPet.photo || orderDoc.petPhoto || '';
  const gender = orderDoc.petGender || fromStored.gender || fromPet.gender || '';
  const age = orderDoc.petAge != null && orderDoc.petAge !== ''
    ? String(orderDoc.petAge)
    : (fromStored.age || fromPet.age || '');
  const weight = orderDoc.petWeight != null && orderDoc.petWeight !== ''
    ? String(orderDoc.petWeight)
    : (fromStored.weight || fromPet.weight || '');
  return {
    ...fromPet,
    ...fromStored,
    photo,
    breed,
    gender,
    age,
    weight
  };
}

function formatOrder(doc, petDoc) {
  if (!doc) return null;
  const fees = normalizeOrderFees(doc);
  const petSnapshot = mergePetSnapshot(doc.petSnapshot, petDoc, doc);
  return {
    id: doc.order_id,
    order_id: doc.order_id,
    displayNo: resolveOrderDisplayNo(doc),
    store_id: doc.store_id || '',
    merchantOpenid: doc.merchantOpenid || '',
    userOpenid: doc.userOpenid || '',
    userNickName: doc.userNickName || '',
    userPhone: doc.userPhone || '',
    petId: doc.petId || '',
    petName: doc.petName || '',
    petType: doc.petType || '',
    petGender: petSnapshot.gender || doc.petGender || '',
    petAge: petSnapshot.age || (doc.petAge != null ? String(doc.petAge) : ''),
    petWeight: petSnapshot.weight || (doc.petWeight != null ? String(doc.petWeight) : ''),
    petBreed: petSnapshot.breed || doc.petBreed || '',
    petPhoto: petSnapshot.photo || doc.petPhoto || '',
    petSnapshot,
    startDate: doc.startDate || '',
    endDate: doc.endDate || '',
    startTime: doc.startTime || '',
    endTime: doc.endTime || '',
    days: doc.days != null ? doc.days : 0,
    boardingFee: fees.boardingFee,
    shippingFee: fees.shippingFee,
    washFee: fees.washFee,
    visitFee: fees.visitFee,
    totalFee: fees.totalFee,
    basePrice: doc.basePrice != null ? doc.basePrice : 0,
    deposit: doc.deposit != null ? doc.deposit : 0,
    feeSnapshot: doc.feeSnapshot || null,
    extras: Array.isArray(doc.extras) ? doc.extras : [],
    needPickup: !!doc.needPickup,
    needWash: !!doc.needWash,
    valueAddedFee: fees.valueAddedFee || 0,
    valueAddedServices: Array.isArray(doc.valueAddedServices) ? doc.valueAddedServices : [],
    specialNeeds: doc.specialNeeds || '',
    contactName: doc.contactName || '',
    contactPhone: doc.contactPhone || '',
    contactIdCard: doc.contactIdCard || '',
    emergencyPhone: doc.emergencyPhone || '',
    pickupAddress: doc.pickupAddress || '',
    pickupLocationName: doc.pickupLocationName || '',
    pickupLatitude: doc.pickupLatitude != null ? doc.pickupLatitude : '',
    pickupLongitude: doc.pickupLongitude != null ? doc.pickupLongitude : '',
    pickupContactPhone: doc.pickupContactPhone || '',
    pickupTime: doc.pickupTime || '',
    pickupIncludeOutbound: doc.pickupIncludeOutbound !== false,
    pickupIncludeReturn: doc.pickupIncludeReturn !== false,
    pickupOutboundDone: !!doc.pickupOutboundDone,
    pickupReturnDone: !!doc.pickupReturnDone,
    visitAddress: doc.visitAddress || '',
    visitLocationName: doc.visitLocationName || '',
    visitLatitude: doc.visitLatitude != null ? doc.visitLatitude : '',
    visitLongitude: doc.visitLongitude != null ? doc.visitLongitude : '',
    visitDistanceKm: doc.visitDistanceKm != null ? doc.visitDistanceKm : '',
    visitDistanceMode: doc.visitDistanceMode || '',
    visitRoomNo: doc.visitRoomNo || '',
    visitEntryMethod: doc.visitEntryMethod || '',
    billingMode: doc.billingMode || 'weight',
    roomType: doc.roomType || '',
    roomName: doc.roomName || '',
    storeName: doc.storeName || '',
    storeLogo: doc.storeLogo || '',
    storeAddress: doc.storeAddress || '',
    serviceLine: doc.serviceLine || 'boarding',
    serviceType: doc.serviceType || '寄养预约',
    orderGroupId: doc.orderGroupId || '',
    petCountInGroup: doc.petCountInGroup != null ? doc.petCountInGroup : 0,
    isGroupPrimary: !!doc.isGroupPrimary,
    status: doc.status || 'pending',
    placedByMerchant: !!doc.placedByMerchant,
    proxyClaimed: !!doc.proxyClaimed,
    proxyOwnerPending: !!doc.proxyOwnerPending,
    proxyClaimToken: doc.proxyClaimToken || '',
    proxyClaimedAt: doc.proxyClaimedAt || 0,
    pricePendingConfirm: !!doc.pricePendingConfirm,
    priceConfirmedAt: doc.priceConfirmedAt || 0,
    editPendingConfirm: !!doc.editPendingConfirm,
    pendingEdit: doc.pendingEdit || null,
    contractId: doc.contractId || '',
    contractSigned: !!doc.contractSigned,
    contractSignTime: doc.contractSignTime || '',
    contractSnapshot: doc.contractSnapshot || null,
    promotion: doc.promotion || null,
    createTime: doc.createTime,
    updateTime: doc.updateTime
  };
}

async function getStoreById(storeId) {
  const data = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  return data.length ? data[0] : null;
}

function isStoreClosed(store) {
  const status = (store && store.status) || '';
  return status === '已闭店' || status === '暂停接单' || status === '未营业';
}

const RECEPTION_RANGE_OPTIONS = ['小型犬', '中型犬', '大型犬', '猫咪', '其他'];

function normalizeReceptionRange(source) {
  let values = [];
  if (Array.isArray(source)) {
    values = source;
  } else if (typeof source === 'string' && source.trim()) {
    values = source.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean);
  }
  const normalized = [];
  values.forEach((item) => {
    const text = item === '其他宠物' ? '其他' : item;
    if (RECEPTION_RANGE_OPTIONS.includes(text) && !normalized.includes(text)) {
      normalized.push(text);
    }
  });
  return RECEPTION_RANGE_OPTIONS.filter((value) => normalized.includes(value));
}

function formatReceptionRangeText(source) {
  const normalized = normalizeReceptionRange(source);
  return normalized.length ? normalized.join('、') : '';
}

function normalizePetTypeForReception(petType) {
  const text = String(petType || '').trim();
  if (!text) return '';
  if (text === '其他宠物') return '其他';
  if (text === '猫') return '猫咪';
  return text;
}

function isPetAllowedByReceptionRange(petType, receptionRange) {
  const allowed = normalizeReceptionRange(receptionRange);
  if (!allowed.length) return true;

  const type = normalizePetTypeForReception(petType);
  if (!type) return false;
  if (allowed.includes(type)) return true;
  if ((type === '狗' || type === '犬') && allowed.some((item) => item.includes('犬'))) {
    return true;
  }
  return false;
}

function getOrderPetType(order) {
  if (!order || typeof order !== 'object') return '';
  const snapshot = order.petSnapshot && typeof order.petSnapshot === 'object'
    ? order.petSnapshot
    : null;
  return order.petType || (snapshot && snapshot.type) || '';
}

function validateOrderReceptionRange(order, store) {
  const receptionRange = normalizeReceptionRange(
    store && (store.receptionRange || store.range)
  );
  if (!receptionRange.length) return '';

  const petType = getOrderPetType(order);
  if (isPetAllowedByReceptionRange(petType, receptionRange)) return '';

  const rangeText = formatReceptionRangeText(receptionRange);
  const type = normalizePetTypeForReception(petType) || '该类型';
  return `「${type}」不在本店接待范围内（仅接待：${rangeText}）`;
}

function validateCreatePayload(order) {
  if (!order || !order.store_id) return '缺少店铺信息';
  if (!(order.petName || '').trim()) return '缺少宠物信息';
  const line = String(order.serviceLine || '').trim();
  if (!order.startDate || !order.endDate) {
    if (line === 'wash') return '请选择到店时间';
    if (line === 'homeFeeding') return '请选择上门时间';
    return '请选择寄养时间';
  }
  if (!order.startTime || !order.endTime) {
    if (line === 'wash') return '请选择到店时间';
    if (line === 'homeFeeding') return '请选择上门时间';
    return '请选择入住和离店时间';
  }
  return '';
}

function buildOrderData(order, userOpenid, merchantOpenid, userProfile, storeDisplayNo) {
  const now = Date.now();
  const fees = normalizeOrderFees({
    boardingFee: order.boardingFee,
    shippingFee: order.shippingFee,
    washFee: order.washFee,
    visitFee: order.visitFee,
    totalFee: order.totalFee,
    needPickup: order.needPickup,
    needWash: order.needWash,
    serviceLine: order.serviceLine,
    valueAddedFee: order.valueAddedFee,
    valueAddedServices: order.valueAddedServices,
    feeSnapshot: order.feeSnapshot
  });
  return {
    order_id: buildOrderId(),
    displayNo: buildOrderDisplayNo(storeDisplayNo, now),
    store_id: order.store_id,
    merchantOpenid,
    userOpenid,
    userNickName: (userProfile && (userProfile.realName || userProfile.nickName)) || '',
    userPhone: (userProfile && userProfile.phone) || '',
    petId: order.petId || '',
    petName: order.petName || '',
    petType: order.petType || '',
    petGender: order.petGender || '',
    petAge: order.petAge != null ? String(order.petAge) : '',
    petWeight: order.petWeight != null ? String(order.petWeight) : '',
    petBreed: order.petBreed || (order.petSnapshot && order.petSnapshot.breed) || '',
    petPhoto: order.petPhoto || (order.petSnapshot && order.petSnapshot.photo) || '',
    petSnapshot: order.petSnapshot || null,
    startDate: order.startDate,
    endDate: order.endDate,
    startTime: order.startTime,
    endTime: order.endTime,
    days: parseFloat(order.days) || 0,
    boardingFee: fees.boardingFee,
    shippingFee: fees.shippingFee,
    washFee: fees.washFee,
    visitFee: fees.visitFee,
    totalFee: fees.totalFee,
    basePrice: order.basePrice != null ? order.basePrice : 0,
    deposit: order.deposit != null ? order.deposit : 0,
    feeSnapshot: order.feeSnapshot || null,
    extras: Array.isArray(order.extras) ? order.extras : [],
    needPickup: !!order.needPickup,
    needWash: !!order.needWash,
    valueAddedFee: fees.valueAddedFee || 0,
    valueAddedServices: Array.isArray(order.valueAddedServices) ? order.valueAddedServices : [],
    specialNeeds: order.specialNeeds || '',
    contactName: order.contactName || '',
    contactPhone: order.contactPhone || '',
    contactIdCard: order.contactIdCard || '',
    emergencyPhone: order.emergencyPhone || '',
    pickupAddress: order.pickupAddress || '',
    pickupLocationName: order.pickupLocationName || '',
    pickupLatitude: order.pickupLatitude != null ? order.pickupLatitude : '',
    pickupLongitude: order.pickupLongitude != null ? order.pickupLongitude : '',
    pickupContactPhone: order.pickupContactPhone || '',
    pickupTime: order.pickupTime || '',
    pickupIncludeOutbound: order.pickupIncludeOutbound !== false,
    pickupIncludeReturn: order.pickupIncludeReturn !== false,
    pickupOutboundDone: false,
    pickupReturnDone: false,
    visitAddress: order.visitAddress || '',
    visitLocationName: order.visitLocationName || '',
    visitLatitude: order.visitLatitude != null ? order.visitLatitude : '',
    visitLongitude: order.visitLongitude != null ? order.visitLongitude : '',
    visitDistanceKm: order.visitDistanceKm != null ? order.visitDistanceKm : '',
    visitDistanceMode: order.visitDistanceMode || '',
    visitRoomNo: order.visitRoomNo || '',
    visitEntryMethod: order.visitEntryMethod || '',
    billingMode: order.billingMode || 'weight',
    roomType: order.roomType || '',
    roomName: order.roomName || '',
    storeName: order.storeName || '',
    storeLogo: order.storeLogo || '',
    storeAddress: order.storeAddress || '',
    serviceLine: order.serviceLine || 'boarding',
    serviceType: order.serviceType || '寄养预约',
    orderGroupId: order.orderGroupId || '',
    petCountInGroup: order.petCountInGroup != null ? order.petCountInGroup : 0,
    isGroupPrimary: !!order.isGroupPrimary,
    status: order.placedByMerchant
      ? (ORDER_STATUSES.includes(order.status) ? order.status : 'awaiting_arrival')
      : 'pending',
    placedByMerchant: !!order.placedByMerchant,
    proxyClaimed: !!order.proxyClaimed,
    proxyOwnerPending: !!(order.placedByMerchant && !order.proxyClaimed),
    proxyClaimToken: String(order.proxyClaimToken || '').trim(),
    proxyClaimedAt: order.proxyClaimedAt || 0,
    pricePendingConfirm: false,
    editPendingConfirm: false,
    pendingEdit: null,
    contractId: order.contractId || '',
    contractSigned: !!order.contractSigned,
    contractSignTime: order.contractSignTime || '',
    contractSnapshot: order.contractSnapshot || null,
    promotion: normalizePromotion(order.promotion, order.store_id),
    createTime: now,
    updateTime: now
  };
}

async function createOrder(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const payload = event.order || {};
  const err = validateCreatePayload(payload);
  if (err) return { success: false, errMsg: err };

  const store = await getStoreById(payload.store_id);
  if (!store) return { success: false, errMsg: '店铺不存在，请确认商家已保存店铺设置' };
  if (isStoreClosed(store)) return { success: false, errMsg: '店铺已闭店，暂不可预约' };

  const receptionErr = validateOrderReceptionRange(payload, store);
  if (receptionErr) return { success: false, errMsg: receptionErr };

  await db.ensureCollections(['orders']);

  let merchantOpenid = store.ownerOpenid || '';
  if (!merchantOpenid) {
    const merchantUsers = await db.findMany('users', {
      store_id: payload.store_id,
      isMerchant: true
    }, { limit: 1 });
    if (merchantUsers.length) {
      merchantOpenid = merchantUsers[0].openid || '';
    }
  }

  const orderData = buildOrderData(
    payload,
    openid,
    merchantOpenid,
    event.userProfile || {},
    resolveStoreDisplayNo(store)
  );
  await db.insertOne('orders', orderData);

  if (orderData.promotion) {
    recordPromotionEvent({
      store_id: orderData.store_id,
      shareCode: orderData.promotion.shareCode,
      source: orderData.promotion.source,
      type: 'order',
      order_id: orderData.order_id,
      amount: orderData.totalFee
    }, openid).catch(() => {});
  }

  const formatted = formatOrder(orderData);
  if (!orderData.placedByMerchant) {
    notifyService.notifyMerchantNewOrder(formatted).catch(() => {});
  }
  return { success: true, order: formatted };
}

async function fetchPetsMap(petIds) {
  const ids = [...new Set((petIds || []).filter(Boolean))];
  const map = {};
  if (!ids.length) return map;

  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const data = await db.findMany('pets', { pet_id: { $in: chunk } });
    (data || []).forEach((doc) => {
      map[doc.pet_id] = doc;
    });
  }
  return map;
}

async function listUserOrders(openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const user = await identity.findPrimaryUserByOpenid(openid);
  const openids = user ? identity.collectOpenids(user) : [openid];
  const data = await db.findMany('orders', { userOpenid: { $in: openids } }, { limit: 100 });
  const sorted = (data || []).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  const petMap = await fetchPetsMap(sorted.map((item) => item.petId));
  return {
    success: true,
    orders: sorted.map((doc) => formatOrder(doc, petMap[doc.petId]))
  };
}

async function isMerchantUser(openid, storeId) {
  if (!openid || !storeId) return false;
  const user = await identity.findPrimaryUserByOpenid(openid);
  if (!user) return false;
  if (userFields.resolveMerchantStoreId(user) === storeId
    && userFields.isMerchantApprovedFromDoc(user)) {
    return true;
  }
  const openids = identity.collectOpenids(user);
  const owned = await db.findMany('stores', {
    store_id: storeId,
    ownerOpenid: { $in: openids }
  }, { limit: 1 });
  if (owned.length) return true;
  const staff = await db.findMany('stores', {
    store_id: storeId,
    staffOpenids: { $in: openids }
  }, { limit: 1 });
  return staff.length > 0;
}

async function canManageOrder(order, openid) {
  if (!openid || !order) return false;

  if (order.merchantOpenid && order.merchantOpenid === openid) {
    return true;
  }

  const storeId = order.store_id;
  if (!storeId) return false;

  const store = await getStoreById(storeId);
  if (store) {
    const ownerOpenid = store.ownerOpenid || '';
    if (ownerOpenid === openid) return true;
    if (!ownerOpenid && await isMerchantUser(openid, storeId)) {
      return true;
    }
  }

  if (await isMerchantUser(openid, storeId)) {
    return true;
  }

  const openids = identity.collectOpenids(await identity.findPrimaryUserByOpenid(openid) || openid);
  const ownedStores = await db.findMany('stores', {
    ownerOpenid: { $in: openids },
    store_id: storeId
  }, { limit: 1 });
  return ownedStores.length > 0;
}

async function listMerchantOrders(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = event.store_id;
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };

  const store = await getStoreById(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  const canView = await canManageOrder({ store_id: storeId, merchantOpenid: store.ownerOpenid || '' }, openid);
  if (!canView) {
    return { success: false, errMsg: '无权查看该店铺订单' };
  }

  const data = await db.findMany('orders', { store_id: storeId }, { limit: 200 });
  const sorted = (data || []).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  const petMap = await fetchPetsMap(sorted.map((item) => item.petId));
  return {
    success: true,
    orders: sorted.map((doc) => formatOrder(doc, petMap[doc.petId]))
  };
}

function assignOrderFieldValue(key, value) {
  if (
    key === 'needPickup'
    || key === 'needWash'
    || key === 'pickupIncludeOutbound'
    || key === 'pickupIncludeReturn'
  ) {
    return !!value;
  }
  return value;
}

function buildPendingEditPayload(updates, allowedFields) {
  const pending = {};
  allowedFields.forEach((key) => {
    if (updates[key] !== undefined) {
      pending[key] = assignOrderFieldValue(key, updates[key]);
    }
  });
  pending.submittedAt = Date.now();
  return pending;
}

function applyPendingEditToPatch(pendingEdit, patch) {
  if (!pendingEdit || typeof pendingEdit !== 'object') return;
  Object.keys(pendingEdit).forEach((key) => {
    if (key === 'submittedAt') return;
    patch[key] = assignOrderFieldValue(key, pendingEdit[key]);
  });
}

async function updateOrder(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const orderId = event.order_id || event.id;
  const updates = event.updates || {};
  if (!orderId) return { success: false, errMsg: '缺少订单 ID' };

  const data = await db.findMany('orders', { order_id: orderId }, { limit: 1 });
  if (!data.length) return { success: false, errMsg: '订单不存在' };

  const existing = data[0];
  const isMerchant = await canManageOrder(existing, openid);
  const userDoc = await identity.findPrimaryUserByOpenid(openid);
  const openids = userDoc ? identity.collectOpenids(userDoc) : [openid];
  const isUser = openids.includes(existing.userOpenid);

  if (!isMerchant && !isUser) {
    return { success: false, errMsg: '无权操作该订单' };
  }

  const nextStatus = updates.status;
  const prevStatus = existing.status;
  if (nextStatus && !ORDER_STATUSES.includes(nextStatus)) {
    return { success: false, errMsg: '无效的订单状态' };
  }

  const hasPriceUpdate = ['boardingFee', 'shippingFee', 'totalFee', 'washFee', 'visitFee', 'valueAddedFee'].some((key) => updates[key] != null);
  const hasNonStatusUpdate = Object.keys(updates).some((key) => key !== 'status');
  // 商家端改价显式标记；勿把 needWash 等价格字段误判为用户改单
  const isMerchantPriceAdjust = isMerchant && updates.merchantPriceAdjust === true;
  const isUserEditPayload = [
    'feeSnapshot', 'basePrice', 'days',
    'endDate', 'endTime', 'startDate', 'startTime',
    'contactName', 'contactPhone', 'contactIdCard', 'emergencyPhone', 'specialNeeds',
    'needPickup', 'pickupAddress', 'pickupLocationName', 'pickupLatitude', 'pickupLongitude',
    'pickupContactPhone', 'pickupTime', 'pickupIncludeOutbound', 'pickupIncludeReturn',
    'visitFee', 'visitAddress', 'visitLocationName', 'visitLatitude', 'visitLongitude',
    'visitDistanceKm', 'visitDistanceMode', 'visitRoomNo', 'visitEntryMethod'
  ].some((key) => updates[key] !== undefined);
  // 用户端改单（含补选洗护/改离店时间）；商家改价即使同号也不走用户改单待确认
  const treatAsUserEdit = isUser && !isMerchantPriceAdjust && (!isMerchant || isUserEditPayload);
  const confirmingUserEdit = isMerchant
    && !treatAsUserEdit
    && !isMerchantPriceAdjust
    && existing.editPendingConfirm
    && updates.editPendingConfirm === false;
  const rejectingUserEdit = isMerchant
    && !treatAsUserEdit
    && !isMerchantPriceAdjust
    && existing.editPendingConfirm
    && updates.rejectUserEdit === true;
  const hasMerchantUpdate = isMerchant && !treatAsUserEdit && !confirmingUserEdit && !rejectingUserEdit && (
    hasPriceUpdate
    || !!nextStatus
    || MERCHANT_PATCH_FIELDS.some((key) => updates[key] != null)
  );

  if (isMerchant && !treatAsUserEdit) {
    try {
      await membershipService.assertActiveMembership(existing.store_id);
    } catch (err) {
      if (err && err.code === 'MEMBERSHIP_REQUIRED') {
        return { success: false, errCode: err.code, errMsg: err.message, membership: err.membership };
      }
      throw err;
    }
  }

  if (isMerchant && existing.pricePendingConfirm && hasMerchantUpdate && !isMerchantPriceAdjust) {
    return { success: false, errMsg: '价格待用户确认，暂不可修改订单' };
  }
  if (isMerchant && existing.editPendingConfirm && hasMerchantUpdate && !isMerchantPriceAdjust) {
    return { success: false, errMsg: '用户改单待确认，请先确认或拒绝后再操作' };
  }

  const patch = { updateTime: Date.now() };

  if (treatAsUserEdit) {
    const confirmingPrice = updates.pricePendingConfirm === false && existing.pricePendingConfirm;
    if (confirmingPrice) {
      // 用户确认商家改价
    } else if (nextStatus === 'cancelled') {
      if (hasNonStatusUpdate) {
        return { success: false, errMsg: '取消订单时不可修改其他信息' };
      }
      if (!USER_CANCEL_STATUSES.includes(existing.status)) {
        return { success: false, errMsg: '当前状态不可取消' };
      }
    } else if (hasNonStatusUpdate) {
      if (!USER_EDIT_STATUSES.includes(existing.status)) {
        return { success: false, errMsg: '当前状态不可修改订单' };
      }
      if (nextStatus) {
        return { success: false, errMsg: '无权修改订单状态' };
      }
      if (existing.pricePendingConfirm) {
        return { success: false, errMsg: '请先确认商家改价后再修改订单' };
      }
      const allowedFields = existing.status === 'boarding'
        ? USER_EDIT_FIELDS_BOARDING
        : USER_EDIT_FIELDS_FULL;
      const disallowed = Object.keys(updates).filter(
        (key) => updates[key] !== undefined && !allowedFields.includes(key)
      );
      if (disallowed.length) {
        return { success: false, errMsg: '当前状态不可修改该信息' };
      }
      // 用户改单不直接生效，写入待商家确认
      patch.pendingEdit = buildPendingEditPayload(updates, allowedFields);
      patch.editPendingConfirm = true;
      patch.pricePendingConfirm = false;
    } else if (nextStatus) {
      return { success: false, errMsg: '无权操作该订单' };
    }
  }

  if (nextStatus) {
    patch.status = nextStatus;
    if (nextStatus === 'completed' && prevStatus !== 'completed') patch.completedAt = Date.now();
  }

  if (isUser && updates.pricePendingConfirm === false && existing.pricePendingConfirm) {
    patch.pricePendingConfirm = false;
    patch.priceConfirmedAt = Date.now();
  }

  if (confirmingUserEdit) {
    applyPendingEditToPatch(existing.pendingEdit, patch);
    patch.editPendingConfirm = false;
    patch.pendingEdit = null;
    patch.editConfirmedAt = Date.now();
  } else if (rejectingUserEdit) {
    patch.editPendingConfirm = false;
    patch.pendingEdit = null;
    patch.editRejectedAt = Date.now();
  }

  if (isMerchant && !treatAsUserEdit) {
    MERCHANT_PATCH_FIELDS.forEach((key) => {
      if (updates[key] != null) {
        patch[key] = !!updates[key];
      }
    });
  }

  if (hasPriceUpdate && isMerchant && !treatAsUserEdit && !confirmingUserEdit && !rejectingUserEdit) {
    if (!EDITABLE_PRICE_STATUSES.includes(existing.status)) {
      return { success: false, errMsg: '当前状态不可修改价格' };
    }

    const boardingFee = updates.boardingFee != null
      ? parseFee(updates.boardingFee, 0)
      : parseFee(existing.boardingFee, parseFee(existing.totalFee, 0));
    const shippingFee = existing.needPickup
      ? (updates.shippingFee != null ? parseFee(updates.shippingFee, 0) : parseFee(existing.shippingFee, 0))
      : 0;
    const needWash = updates.needWash != null ? !!updates.needWash : !!existing.needWash;
    const keepWashFee = needWash || existing.serviceLine === 'wash';
    const washFee = keepWashFee
      ? (updates.washFee != null ? parseFee(updates.washFee, 0) : parseFee(existing.washFee, 0))
      : 0;
    const visitFee = updates.visitFee != null
      ? parseFee(updates.visitFee, 0)
      : parseFee(existing.visitFee, 0);
    const valueAddedServices = Array.isArray(updates.valueAddedServices)
      ? updates.valueAddedServices
      : (Array.isArray(existing.valueAddedServices) ? existing.valueAddedServices : []);
    const valueAddedFee = updates.valueAddedFee != null
      ? parseFee(updates.valueAddedFee, 0)
      : parseFee(existing.valueAddedFee, 0);
    const normalized = normalizeOrderFees({
      boardingFee,
      shippingFee,
      washFee,
      visitFee,
      valueAddedFee,
      valueAddedServices,
      totalFee: boardingFee + shippingFee + washFee + visitFee + valueAddedFee,
      needPickup: existing.needPickup,
      needWash,
      serviceLine: existing.serviceLine,
      feeSnapshot: existing.feeSnapshot
    });

    patch.boardingFee = normalized.boardingFee;
    patch.shippingFee = normalized.shippingFee;
    patch.washFee = normalized.washFee;
    patch.visitFee = normalized.visitFee;
    patch.valueAddedFee = normalized.valueAddedFee;
    patch.needWash = needWash;
    patch.totalFee = normalized.totalFee;
    if (updates.feeSnapshot && typeof updates.feeSnapshot === 'object') {
      patch.feeSnapshot = updates.feeSnapshot;
    }
    // 商家端改价直接生效，无需用户/商家再次确认
    patch.pricePendingConfirm = false;
    patch.editPendingConfirm = false;
    patch.pendingEdit = null;
    if (!existing.merchantOpenid || existing.merchantOpenid !== openid) {
      patch.merchantOpenid = openid;
    }
  }

  await db.updateById('orders', existing._id, patch);
  let petDoc = null;
  if (existing.petId) {
    const petMap = await fetchPetsMap([existing.petId]);
    petDoc = petMap[existing.petId] || null;
  }
  const updatedOrder = formatOrder({ ...existing, ...patch }, petDoc);

  if (patch.status === 'completed' && prevStatus !== 'completed') {
  }

  if (patch.status && patch.status !== prevStatus) {
    if (patch.status === 'cancelled') {
      const cancelledBy = (isUser && !isMerchant) ? 'user' : 'merchant';
      notifyService.notifyOrderCancelled(updatedOrder, { cancelledBy }).catch(() => {});
    } else {
      notifyService.notifyUserOrderStatus(updatedOrder, prevStatus).catch(() => {});
    }
  }

  return { success: true, order: updatedOrder };
}

async function listAdminStoreOrders(query = {}) {
  const storeId = (query.store_id || '').trim();
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };

  const store = await getStoreById(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };

  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 200);
  const data = await db.findMany('orders', { store_id: storeId }, { limit, sort: { createTime: -1 } });
  const petMap = await fetchPetsMap((data || []).map((item) => item.petId));
  const orders = (data || []).map((doc) => {
    const order = formatOrder(doc, petMap[doc.petId]);
    if (!order) return null;
    let createTimeText = '--';
    if (order.createTime) {
      try {
        createTimeText = new Date(order.createTime).toLocaleString('zh-CN');
      } catch (_) {
        createTimeText = '--';
      }
    }
    return {
      ...order,
      createTimeText
    };
  }).filter(Boolean);

  return {
    success: true,
    store_id: storeId,
    storeName: store.name || '',
    orders,
    total: orders.length
  };
}

function formatAdminTimeText(value) {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleString('zh-CN');
  } catch (_) {
    return '--';
  }
}

async function getAdminOrderDetail(query = {}) {
  const orderId = String(query.order_id || query.id || '').trim();
  if (!orderId) return { success: false, errMsg: '缺少订单 ID' };

  const data = await db.findMany('orders', { order_id: orderId }, { limit: 1 });
  if (!data.length) return { success: false, errMsg: '订单不存在' };

  const doc = data[0];
  const petMap = await fetchPetsMap([doc.petId]);
  const order = formatOrder(doc, petMap[doc.petId]);
  if (!order) return { success: false, errMsg: '订单数据异常' };

  let storeName = order.storeName || '';
  let storeDisplayNo = '';
  if (order.store_id) {
    const store = await getStoreById(order.store_id);
    if (store) {
      if (store.name) storeName = store.name;
      storeDisplayNo = resolveStoreDisplayNo(store);
    }
  }

  return {
    success: true,
    order: {
      ...order,
      storeName,
      storeDisplayNo,
      createTimeText: formatAdminTimeText(order.createTime),
      updateTimeText: formatAdminTimeText(order.updateTime),
      contractSignTimeText: formatAdminTimeText(order.contractSignTime),
      priceConfirmedAtText: formatAdminTimeText(order.priceConfirmedAt)
    }
  };
}

/**
 * 商家客户管理：按本店订单用户 openid 批量返回是否绑定服务号 openids.oa（可推送）。
 * 不返回 oa openid 明文，仅 boolean。
 */
async function listStoreCustomerPushStatus(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };

  const storeId = event.store_id || event.storeId;
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };

  const store = await getStoreById(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  const canView = await canManageOrder(
    { store_id: storeId, merchantOpenid: store.ownerOpenid || '' },
    openid
  );
  if (!canView) {
    return { success: false, errMsg: '无权查看该店铺客户' };
  }

  const orders = await db.findMany('orders', { store_id: storeId }, { limit: 1000 });
  const openids = [...new Set(
    (orders || [])
      .map((item) => String(item.userOpenid || '').trim())
      .filter(Boolean)
  )];

  const status = {};
  openids.forEach((id) => {
    status[id] = false;
  });

  if (!openids.length) {
    return { success: true, store_id: storeId, status, total: 0 };
  }

  const oaBindService = require('./oaBindService');
  const chunkSize = 40;
  for (let i = 0; i < openids.length; i += chunkSize) {
    const chunk = openids.slice(i, i + chunkSize);
    const users = await db.findMany('users', {
      $or: [
        { openid: { $in: chunk } },
        { 'openids.user': { $in: chunk } },
        { 'openids.merchant': { $in: chunk } },
        { linkedOpenids: { $in: chunk } }
      ]
    }, { limit: 500 });

    (users || []).forEach((user) => {
      const oaBound = !!oaBindService.getOaOpenidFromUser(user);
      if (!oaBound) return;
      identity.collectOpenids(user).forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(status, id)) {
          status[id] = true;
        }
      });
    });
  }

  const boundCount = Object.keys(status).filter((id) => status[id]).length;
  return {
    success: true,
    store_id: storeId,
    status,
    total: openids.length,
    boundCount
  };
}

function confirmedProxyStatus(status) {
  if (status === 'boarding' || status === 'completed' || status === 'cancelled') return status;
  return 'awaiting_arrival';
}

async function addPetIdToUser(openid, petId) {
  if (!openid || !petId) return;
  const user = await identity.findPrimaryUserByOpenid(openid);
  if (!user) return;
  const petIds = Array.isArray(user.pet_ids)
    ? user.pet_ids.filter((id) => typeof id === 'string' && id.trim())
    : [];
  if (petIds.includes(petId)) return;
  await db.updateById('users', user._id, {
    pet_ids: [...petIds, petId],
    updateTime: Date.now()
  });
}

function buildClaimPetFromOrder(order, sourceDoc) {
  const snap = (order && order.petSnapshot && typeof order.petSnapshot === 'object')
    ? order.petSnapshot
    : {};
  const src = sourceDoc && typeof sourceDoc === 'object' ? sourceDoc : {};
  return {
    name: src.name || order.petName || snap.name || '宠物',
    type: src.type || order.petType || snap.type || '',
    breed: src.breed || order.petBreed || snap.breed || '',
    gender: src.gender || order.petGender || snap.gender || '',
    age: src.age != null ? src.age : (order.petAge != null ? order.petAge : snap.age),
    ageYears: src.ageYears != null ? src.ageYears : snap.ageYears,
    ageMonths: src.ageMonths != null ? src.ageMonths : snap.ageMonths,
    weight: src.weight != null ? src.weight : (order.petWeight != null ? order.petWeight : snap.weight),
    color: src.color || snap.color || '',
    photo: src.photo || order.petPhoto || snap.photo || '',
    vaccination: src.vaccination || snap.vaccination || '未接种',
    dewormDate: src.dewormDate || snap.dewormDate || '',
    allergyStatus: src.allergyStatus || snap.allergyStatus || '否',
    allergy: src.allergy || snap.allergy || '',
    medicalHistoryStatus: src.medicalHistoryStatus || snap.medicalHistoryStatus || '否',
    medicalHistory: src.medicalHistory || snap.medicalHistory || '',
    isPregnant: src.isPregnant || snap.isPregnant || '否',
    inHeat: src.inHeat || snap.inHeat || '否',
    isNeutered: src.isNeutered || snap.isNeutered || '否',
    hasDogLicense: src.hasDogLicense || snap.hasDogLicense || '否',
    character: src.character || snap.character || '',
    behaviorHabits: src.behaviorHabits || snap.behaviorHabits || '',
    dietTaboo: src.dietTaboo || snap.dietTaboo || '',
    specialCare: src.specialCare || snap.specialCare || '',
    remark: src.remark || snap.remark || ''
  };
}

async function clonePetForClaim(order, sourceDoc, ownerOpenid) {
  const now = Date.now();
  const fields = buildClaimPetFromOrder(order, sourceDoc);
  const petId = `pet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newPet = {
    pet_id: petId,
    ownerOpenid,
    name: String(fields.name || '').trim() || '宠物',
    type: fields.type || '',
    breed: String(fields.breed || '').trim(),
    gender: fields.gender === '母' ? '母' : '公',
    age: fields.age != null ? String(fields.age) : '',
    ageYears: fields.ageYears != null ? fields.ageYears : '',
    ageMonths: fields.ageMonths != null ? fields.ageMonths : '',
    weight: fields.weight != null ? String(fields.weight) : '',
    color: String(fields.color || '').trim(),
    photo: fields.photo || '',
    vaccination: fields.vaccination || '',
    dewormDate: fields.dewormDate || '',
    allergyStatus: fields.allergyStatus || '',
    allergy: fields.allergy || '',
    medicalHistoryStatus: fields.medicalHistoryStatus || '',
    medicalHistory: fields.medicalHistory || '',
    isPregnant: fields.isPregnant || '',
    inHeat: fields.inHeat || '',
    isNeutered: fields.isNeutered || '',
    hasDogLicense: fields.hasDogLicense || '',
    character: fields.character || '',
    behaviorHabits: fields.behaviorHabits || '',
    dietTaboo: fields.dietTaboo || '',
    specialCare: fields.specialCare || '',
    remark: fields.remark || '',
    createTime: now,
    updateTime: now
  };
  await db.insertOne('pets', newPet);
  await addPetIdToUser(ownerOpenid, petId);
  return newPet;
}

async function loadProxyOrdersByToken(token) {
  const claimToken = String(token || '').trim();
  if (!claimToken) return [];
  await db.ensureCollections(['orders']);
  return db.findMany('orders', { proxyClaimToken: claimToken }, { limit: 50 });
}

async function formatProxyClaimResult(docs) {
  const list = Array.isArray(docs) ? docs : [];
  const petMap = await fetchPetsMap(list.map((item) => item.petId));
  const orders = list.map((doc) => formatOrder(doc, petMap[doc.petId]));
  const pets = [];
  const seen = {};
  list.forEach((doc) => {
    const petId = doc && doc.petId;
    if (!petId || seen[petId]) return;
    seen[petId] = true;
    const petDoc = petMap[petId];
    if (petDoc) {
      pets.push({
        id: petDoc.pet_id,
        pet_id: petDoc.pet_id,
        name: petDoc.name || doc.petName || '',
        type: petDoc.type || doc.petType || '',
        breed: petDoc.breed || doc.petBreed || '',
        gender: petDoc.gender || doc.petGender || '',
        age: petDoc.age != null ? String(petDoc.age) : (doc.petAge || ''),
        weight: petDoc.weight != null ? String(petDoc.weight) : (doc.petWeight || ''),
        photo: petDoc.photo || doc.petPhoto || '',
        petSnapshot: doc.petSnapshot || null
      });
      return;
    }
    pets.push({
      id: petId,
      pet_id: petId,
      name: doc.petName || '',
      type: doc.petType || '',
      breed: doc.petBreed || '',
      gender: doc.petGender || '',
      photo: doc.petPhoto || '',
      petSnapshot: doc.petSnapshot || null
    });
  });
  return { orders, pets };
}

async function getProxyOrderClaim(event, openid) {
  const token = String((event && event.token) || '').trim();
  if (!token) return { success: false, errMsg: '领取链接无效' };
  const docs = await loadProxyOrdersByToken(token);
  if (!docs.length) return { success: false, errMsg: '未找到待领取的代下单' };

  const user = await identity.findPrimaryUserByOpenid(openid);
  const openids = user ? identity.collectOpenids(user) : [openid];
  const claimed = docs.filter((doc) => doc && doc.proxyClaimed);
  if (claimed.length) {
    const mine = claimed.every((doc) => openids.includes(doc.userOpenid));
    if (!mine) return { success: false, errMsg: '该预约已被其他账号领取' };
    const result = await formatProxyClaimResult(docs);
    return { success: true, alreadyClaimed: true, ...result };
  }

  const result = await formatProxyClaimResult(docs);
  return { success: true, alreadyClaimed: false, ...result };
}

async function claimProxyOrders(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const token = String((event && event.token) || '').trim();
  if (!token) return { success: false, errMsg: '领取链接无效' };

  const docs = await loadProxyOrdersByToken(token);
  if (!docs.length) return { success: false, errMsg: '未找到待领取的代下单' };

  const user = await identity.findPrimaryUserByOpenid(openid);
  const openids = user ? identity.collectOpenids(user) : [openid];
  const claimed = docs.filter((doc) => doc && doc.proxyClaimed);
  if (claimed.length) {
    const mine = claimed.every((doc) => openids.includes(doc.userOpenid));
    if (!mine) return { success: false, errMsg: '该预约已被其他账号领取' };
    const result = await formatProxyClaimResult(docs);
    return { success: true, alreadyClaimed: true, ...result };
  }

  await db.ensureCollections(['pets']);
  const petMap = await fetchPetsMap(docs.map((item) => item.petId));
  const cloned = {};
  const now = Date.now();

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    const oldPetId = String((doc && doc.petId) || '').trim();
    let nextPetId = oldPetId;
    if (oldPetId && !cloned[oldPetId]) {
      const newPet = await clonePetForClaim(doc, petMap[oldPetId] || null, openid);
      cloned[oldPetId] = newPet;
      nextPetId = newPet.pet_id;
    } else if (oldPetId) {
      nextPetId = cloned[oldPetId].pet_id;
    }
    const clonedPet = oldPetId ? cloned[oldPetId] : null;
    await db.updateById('orders', doc._id, {
      userOpenid: openid,
      userNickName: (user && (user.realName || user.nickName)) || '',
      userPhone: (user && user.phone) || doc.userPhone || '',
      petId: nextPetId,
      petPhoto: (clonedPet && clonedPet.photo) || doc.petPhoto || '',
      proxyClaimed: true,
      proxyClaimedAt: now,
      proxyOwnerPending: false,
      status: confirmedProxyStatus(doc.status),
      updateTime: now
    });
  }

  const updated = await loadProxyOrdersByToken(token);
  const result = await formatProxyClaimResult(updated);
  return { success: true, alreadyClaimed: false, ...result };
}

function normalizeGrowthType(value) {
  const type = String(value || '').trim();
  return ['share', 'open', 'order'].includes(type) ? type : '';
}

async function assertStoreManager(storeId, openid, message = '无权操作该店铺') {
  if (!storeId || !openid) return false;
  const store = await getStoreById(storeId);
  if (!store) return false;
  const canManage = await canManageOrder({ store_id: storeId, merchantOpenid: store.ownerOpenid || '' }, openid);
  if (!canManage) return false;
  return true;
}

async function recordPromotionEvent(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const storeId = String(event.store_id || event.storeId || '').trim();
  const type = normalizeGrowthType(event.type || event.eventType);
  if (!storeId || !type) return { success: false, errMsg: '推广事件参数无效' };
  if (!(await getStoreById(storeId))) return { success: false, errMsg: '店铺不存在' };
  if (type === 'share' && !(await assertStoreManager(storeId, openid))) {
    return { success: false, errMsg: '无权记录该店铺推广' };
  }
  await ensureGrowthCollections();
  const now = Date.now();
  const shareCode = String(event.shareCode || '').trim().slice(0, 80);
  const source = String(event.source || '').trim().slice(0, 40);
  const doc = {
    store_id: storeId,
    type,
    shareCode,
    source,
    viewerKey: hashViewer(openid),
    order_id: String(event.order_id || '').trim().slice(0, 80),
    amount: Number.isFinite(Number(event.amount)) ? Math.max(0, Number(event.amount)) : 0,
    createTime: now
  };
  await db.insertOne('promotion_events', doc);
  return { success: true };
}

async function getPromotionStats(event, openid) {
  const storeId = String(event.store_id || event.storeId || '').trim();
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };
  if (!(await assertStoreManager(storeId, openid))) return { success: false, errMsg: '无权查看推广数据' };
  await ensureGrowthCollections();
  const days = Math.min(Math.max(parseInt(event.days, 10) || 30, 7), 90);
  const since = Date.now() - days * 86400000;
  const events = await db.findMany('promotion_events', { store_id: storeId, createTime: { $gte: since } }, { limit: 5000 });
  const summary = { shares: 0, opens: 0, orders: 0, uniqueViewers: 0, revenue: 0 };
  const viewers = new Set();
  (events || []).forEach((item) => {
    if (item.type === 'share') summary.shares += 1;
    if (item.type === 'open') {
      summary.opens += 1;
      if (item.viewerKey) viewers.add(item.viewerKey);
    }
    if (item.type === 'order') {
      summary.orders += 1;
      summary.revenue += Number(item.amount) || 0;
    }
  });
  summary.uniqueViewers = viewers.size;
  summary.conversionRate = summary.opens ? Math.round((summary.orders / summary.opens) * 1000) / 10 : 0;
  const bySource = {};
  (events || []).forEach((item) => {
    const source = item.source || 'direct';
    if (!bySource[source]) bySource[source] = { source, shares: 0, opens: 0, orders: 0, revenue: 0 };
    if (item.type === 'share') bySource[source].shares += 1;
    if (item.type === 'open') bySource[source].opens += 1;
    if (item.type === 'order') {
      bySource[source].orders += 1;
      bySource[source].revenue += Number(item.amount) || 0;
    }
  });
  return { success: true, store_id: storeId, days, summary, bySource: Object.values(bySource) };
}

async function createInsuranceShare(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const storeId = String(event.store_id || event.storeId || '').trim();
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };
  if (!(await assertStoreManager(storeId, openid))) {
    return { success: false, errMsg: '无权为该店铺生成保险推广链接' };
  }

  await ensureInsuranceShareCollection();
  const store = await getStoreById(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };

  const now = Date.now();
  const expireAt = now + INSURANCE_SHARE_TTL_MS;
  const shareToken = crypto.randomBytes(18).toString('hex');
  await db.insertOne(INSURANCE_SHARE_COLLECTION, {
    shareToken,
    store_id: storeId,
    storeName: String(store.name || '').trim(),
    creatorKey: hashViewer(openid),
    commissionRate: INSURANCE_COMMISSION_RATE,
    status: 'active',
    createTime: now,
    expireAt,
    expireAtDate: new Date(expireAt),
    openCount: 0,
    lastOpenAt: null
  });

  return {
    success: true,
    shareToken,
    store_id: storeId,
    storeName: String(store.name || '').trim(),
    commissionRate: INSURANCE_COMMISSION_RATE,
    expireAt,
    validSeconds: Math.floor(INSURANCE_SHARE_TTL_MS / 1000)
  };
}

async function validateInsuranceShare(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const shareToken = String(event.insurance_token || event.shareToken || '').trim();
  if (!shareToken) {
    return { success: false, valid: false, expired: true, code: 'INSURANCE_LINK_EXPIRED', errMsg: '链接已过期' };
  }

  await ensureInsuranceShareCollection();
  const link = await db.findOne(INSURANCE_SHARE_COLLECTION, { shareToken });
  const now = Date.now();
  if (!link || link.status !== 'active' || !link.expireAt || Number(link.expireAt) <= now) {
    if (link && link._id && link.status === 'active') {
      await db.updateById(INSURANCE_SHARE_COLLECTION, link._id, {
        status: 'expired',
        updateTime: now
      });
    }
    return { success: false, valid: false, expired: true, code: 'INSURANCE_LINK_EXPIRED', errMsg: '链接已过期' };
  }

  await db.collection(INSURANCE_SHARE_COLLECTION).updateOne(
    { _id: link._id },
    { $inc: { openCount: 1 }, $set: { lastOpenAt: now } }
  );
  return {
    success: true,
    valid: true,
    expired: false,
    store_id: link.store_id,
    storeName: link.storeName || '',
    commissionRate: Number(link.commissionRate) || INSURANCE_COMMISSION_RATE,
    expireAt: Number(link.expireAt)
  };
}

function normalizeInsuranceEventType(value) {
  const type = String(value || '').trim();
  return type === 'impression' || type === 'click' ? type : '';
}

async function upsertInsuranceEvent({ eventType, eventId, storeId, source, viewerKey, now }) {
  await db.collection(INSURANCE_EVENT_COLLECTION).updateOne(
    { eventType, eventId },
    {
      $setOnInsert: {
        eventType,
        eventId,
        store_id: storeId,
        source,
        viewerKey,
        createTime: now
      }
    },
    { upsert: true }
  );
}

async function recordInsuranceEvent(event, openid) {
  if (!openid) return { success: false, errMsg: '无法获取用户身份' };
  const eventType = normalizeInsuranceEventType(event.eventType || event.type);
  const eventId = String(event.eventId || '').trim().slice(0, 120);
  const storeId = String(event.store_id || event.storeId || '').trim();
  const source = String(event.source || '').trim() === 'checkout_success_popup'
    ? 'checkout_success_popup'
    : '';
  if (!eventType || !eventId || !storeId || !source || !eventId.startsWith('checkout_')) {
    return { success: false, errMsg: '保险打点参数无效' };
  }
  if (!(await getStoreById(storeId))) return { success: false, errMsg: '店铺不存在' };

  await ensureInsuranceShareCollection();
  const now = Date.now();
  const payload = {
    eventId,
    storeId,
    source,
    viewerKey: hashViewer(openid),
    now
  };
  // 点击一定来自已展示的弹窗；补写曝光可消除极快点击导致的网络竞态。
  if (eventType === 'click') {
    await upsertInsuranceEvent({ ...payload, eventType: 'impression' });
  }
  await upsertInsuranceEvent({ ...payload, eventType });
  return { success: true };
}

function sanitizeTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  return [...new Set(list.map((tag) => String(tag || '').trim()).filter(Boolean).map((tag) => tag.slice(0, 20)))].slice(0, 12);
}

async function listStoreCustomerTags(event, openid) {
  const storeId = String(event.store_id || event.storeId || '').trim();
  if (!storeId) return { success: false, errMsg: '缺少店铺 ID' };
  if (!(await assertStoreManager(storeId, openid))) return { success: false, errMsg: '无权查看该店铺客户标签' };
  await ensureGrowthCollections();
  const docs = await db.findMany('customer_tags', { store_id: storeId }, { limit: 5000 });
  const tags = {};
  (docs || []).forEach((doc) => {
    const key = String(doc.customer_key || '').trim();
    if (key) tags[key] = { tags: sanitizeTags(doc.tags), note: String(doc.note || '').slice(0, 200), updateTime: doc.updateTime || 0 };
  });
  return { success: true, store_id: storeId, tags };
}

async function updateStoreCustomerTags(event, openid) {
  const storeId = String(event.store_id || event.storeId || '').trim();
  const customerKey = String(event.customer_key || event.customerKey || '').trim().slice(0, 180);
  if (!storeId || !customerKey) return { success: false, errMsg: '客户标签参数无效' };
  if (!(await assertStoreManager(storeId, openid))) return { success: false, errMsg: '无权修改该店铺客户标签' };
  await ensureGrowthCollections();
  const doc = { store_id: storeId, customer_key: customerKey, tags: sanitizeTags(event.tags), note: String(event.note || '').trim().slice(0, 200), updateTime: Date.now(), updatedBy: hashViewer(openid) };
  await db.updateOne('customer_tags', { store_id: storeId, customer_key: customerKey }, doc, { $setOnInsert: { createTime: Date.now() } });
  return { success: true, customer_key: customerKey, data: { tags: doc.tags, note: doc.note, updateTime: doc.updateTime } };
}

async function handle(event, openid) {
  switch (event.action) {
    case 'createOrder':
      return createOrder(event, openid);
    case 'listUserOrders':
      return listUserOrders(openid);
    case 'listMerchantOrders':
      return listMerchantOrders(event, openid);
    case 'listStoreCustomerPushStatus':
      return listStoreCustomerPushStatus(event, openid);
    case 'updateOrder':
      return updateOrder(event, openid);
    case 'getProxyOrderClaim':
      return getProxyOrderClaim(event, openid);
    case 'claimProxyOrders':
      return claimProxyOrders(event, openid);
    case 'recordPromotionEvent':
      return recordPromotionEvent(event, openid);
    case 'getPromotionStats':
      return getPromotionStats(event, openid);
    case 'createInsuranceShare':
      return createInsuranceShare(event, openid);
    case 'validateInsuranceShare':
      return validateInsuranceShare(event, openid);
    case 'recordInsuranceEvent':
      return recordInsuranceEvent(event, openid);
    case 'listStoreCustomerTags':
      return listStoreCustomerTags(event, openid);
    case 'updateStoreCustomerTags':
      return updateStoreCustomerTags(event, openid);
    default:
      return { success: false, errMsg: '未知操作' };
  }
}

module.exports = {
  handle,
  canManageOrder,
  formatOrder,
  listAdminStoreOrders,
  getAdminOrderDetail
};
