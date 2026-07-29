const { uploadLocalImage } = require('./upload');
const { isLocalTempPath, isRemotePhoto } = require('./photoPath');

const LEGACY_ROOM_META = {
  small: { name: '小房间', maxWeight: 5 },
  medium: { name: '中房间', maxWeight: 15 },
  large: { name: '大房间', maxWeight: 40 }
};

/** 房间描述选填，上限与店铺介绍一致量级 */
const MAX_ROOM_DESCRIPTION = 200;

let roomIdSeed = 0;

function createRoomId() {
  roomIdSeed += 1;
  return `room_${Date.now()}_${roomIdSeed}`;
}

function normalizeRoomPhoto(url) {
  if (!url || typeof url !== 'string') return '';
  const text = url.trim();
  if (!text) return '';
  if (isRemotePhoto(text) || isLocalTempPath(text)) return text;
  return '';
}

function normalizeRoomItem(item, fallbackId) {
  const id = (item && item.id) || fallbackId || createRoomId();
  const name = ((item && item.name) || '').trim();
  const maxWeight = parseFloat(item && item.maxWeight);
  const price = parseFloat(item && item.price);
  const description = ((item && item.description) || '').trim().slice(0, MAX_ROOM_DESCRIPTION);
  const photo = normalizeRoomPhoto(item && item.photo);
  return {
    id,
    name,
    maxWeight: Number.isFinite(maxWeight) && maxWeight > 0 ? maxWeight : 0,
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    description,
    photo
  };
}

function getDefaultRoomPricing() {
  return [
    { id: 'small', name: '小房间', maxWeight: 5, price: 60 },
    { id: 'medium', name: '中房间', maxWeight: 15, price: 100 },
    { id: 'large', name: '大房间', maxWeight: 40, price: 150 }
  ].map((item) => normalizeRoomItem(item, item.id));
}

function migrateLegacyRoomPricing(legacy) {
  return Object.keys(LEGACY_ROOM_META)
    .filter((key) => legacy[key] != null && legacy[key] !== '')
    .map((key) => normalizeRoomItem({
      id: key,
      name: LEGACY_ROOM_META[key].name,
      maxWeight: LEGACY_ROOM_META[key].maxWeight,
      price: legacy[key]
    }, key));
}

function normalizeRoomPricing(input) {
  if (Array.isArray(input) && input.length) {
    return input.map((item) => normalizeRoomItem(item));
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const migrated = migrateLegacyRoomPricing(input);
    if (migrated.length) return migrated;
  }

  return getDefaultRoomPricing();
}

function addRoom(list) {
  const normalized = normalizeRoomPricing(list);
  const last = normalized[normalized.length - 1];
  const nextWeight = last ? last.maxWeight + 5 : 5;
  return [
    ...normalized,
    normalizeRoomItem({
      id: createRoomId(),
      name: `房间${normalized.length + 1}`,
      maxWeight: nextWeight,
      price: 0
    })
  ];
}

function removeRoom(list, index) {
  const normalized = normalizeRoomPricing(list);
  if (normalized.length <= 1) return normalized;
  if (index < 0 || index >= normalized.length) return normalized;
  return normalized.filter((_, idx) => idx !== index);
}

function updateRoomField(list, index, field, rawValue) {
  const normalized = normalizeRoomPricing(list);
  if (index < 0 || index >= normalized.length) return normalized;

  const next = normalized.map((item) => ({ ...item }));
  const target = next[index];

  if (field === 'name') {
    target.name = String(rawValue || '').trim();
  } else if (field === 'description') {
    target.description = String(rawValue || '').trim().slice(0, MAX_ROOM_DESCRIPTION);
  } else if (field === 'photo') {
    target.photo = normalizeRoomPhoto(rawValue);
  } else if (field === 'maxWeight' || field === 'price') {
    const parsed = parseFloat(rawValue);
    target[field] = Number.isFinite(parsed) ? parsed : 0;
  }

  return next.map((item) => normalizeRoomItem(item, item.id));
}

/**
 * 保存前将房间本地临时图上传为远端 URL；描述与照片均为选填。
 */
function uploadRoomPricingPhotos(list, fallbackList) {
  const normalized = normalizeRoomPricing(list);
  const fallback = normalizeRoomPricing(fallbackList || []);
  const fallbackById = {};
  fallback.forEach((room) => {
    fallbackById[room.id] = room;
  });

  return Promise.all(normalized.map((room) => {
    const photo = room.photo;
    if (!photo) {
      return Promise.resolve(normalizeRoomItem({ ...room, photo: '' }, room.id));
    }
    if (isRemotePhoto(photo) && !isLocalTempPath(photo)) {
      return Promise.resolve(room);
    }
    if (isLocalTempPath(photo)) {
      return uploadLocalImage(photo, 'room-photos').then((url) => {
        if (!isRemotePhoto(url)) {
          return Promise.reject(new Error('房间照片上传失败，请重试'));
        }
        return normalizeRoomItem({ ...room, photo: url }, room.id);
      });
    }
    const fallbackRoom = fallbackById[room.id];
    if (fallbackRoom && isRemotePhoto(fallbackRoom.photo)) {
      return Promise.resolve(normalizeRoomItem({ ...room, photo: fallbackRoom.photo }, room.id));
    }
    return Promise.resolve(normalizeRoomItem({ ...room, photo: '' }, room.id));
  }));
}

function findRoom(list, roomType) {
  const normalized = normalizeRoomPricing(list);
  return normalized.find((item) => item.id === roomType) || null;
}

function findRoomPrice(list, roomType) {
  const room = findRoom(list, roomType);
  if (room) return room.price;
  const normalized = normalizeRoomPricing(list);
  return normalized[0] ? normalized[0].price : 0;
}

function parsePetWeight(petWeight) {
  const weight = parseFloat(petWeight);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function supportsPetWeight(room, petWeight) {
  const weight = parsePetWeight(petWeight);
  if (!room || weight == null) return false;
  return weight <= room.maxWeight;
}

/** 用户端可展示的房间图：排除商家本地临时路径 */
function getDisplayRoomPhoto(photo) {
  const text = normalizeRoomPhoto(photo);
  if (!text) return '';
  if (isLocalTempPath(text)) return '';
  return text;
}

function buildRoomOptions(list, petWeight) {
  const normalized = normalizeRoomPricing(list);
  const weight = parsePetWeight(petWeight);

  return normalized.map((room) => ({
    ...room,
    photo: getDisplayRoomPhoto(room.photo),
    weightLimitText: `≤${room.maxWeight}kg`,
    // 未选宠物时不标超限；选了宠物体重后才按上限禁用
    disabled: weight != null ? !supportsPetWeight(room, weight) : false
  }));
}

/**
 * 解析房间选项中的远程图片（cloud:// / https）为可展示地址
 */
function resolveRoomOptionsPhotos(options) {
  const list = Array.isArray(options) ? options : [];
  const indexes = [];
  const urls = [];
  list.forEach((room, index) => {
    const photo = getDisplayRoomPhoto(room && room.photo);
    if (!photo) return;
    indexes.push(index);
    urls.push(photo);
  });
  if (!urls.length) return Promise.resolve(list.map((room) => ({ ...room })));

  const { resolveImageUrls } = require('./imageCache');
  return resolveImageUrls(urls).then((resolved) => {
    const next = list.map((room) => ({ ...room }));
    indexes.forEach((roomIndex, i) => {
      const url = resolved[i];
      if (url) next[roomIndex].photo = url;
    });
    return next;
  }).catch(() => list.map((room) => ({ ...room })));
}

function validateRoomPricing(list) {
  const normalized = normalizeRoomPricing(list);
  if (!normalized.length) return '请至少添加一个房间类型';

  for (let i = 0; i < normalized.length; i += 1) {
    const room = normalized[i];
    if (!room.name) return `请填写第${i + 1}个房间名称`;
    if (!(parseFloat(room.maxWeight) > 0)) return `请填写${room.name || `第${i + 1}个房间`}的最大体重`;
    if (!(parseFloat(room.price) > 0)) return `请填写${room.name}价格`;
  }

  const names = normalized.map((item) => item.name);
  const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicateName) return `房间名称「${duplicateName}」重复，请修改`;

  return '';
}

module.exports = {
  MAX_ROOM_DESCRIPTION,
  getDefaultRoomPricing,
  normalizeRoomPricing,
  addRoom,
  removeRoom,
  updateRoomField,
  uploadRoomPricingPhotos,
  findRoom,
  findRoomPrice,
  supportsPetWeight,
  getDisplayRoomPhoto,
  buildRoomOptions,
  resolveRoomOptionsPhotos,
  validateRoomPricing,
  parsePetWeight
};
