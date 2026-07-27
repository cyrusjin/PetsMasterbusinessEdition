const LEGACY_ROOM_META = {
  small: { name: '小房间', maxWeight: 5 },
  medium: { name: '中房间', maxWeight: 15 },
  large: { name: '大房间', maxWeight: 40 }
};

let roomIdSeed = 0;

function createRoomId() {
  roomIdSeed += 1;
  return `room_${Date.now()}_${roomIdSeed}`;
}

function normalizeRoomItem(item, fallbackId) {
  const id = (item && item.id) || fallbackId || createRoomId();
  const name = ((item && item.name) || '').trim();
  const maxWeight = parseFloat(item && item.maxWeight);
  const price = parseFloat(item && item.price);
  return {
    id,
    name,
    maxWeight: Number.isFinite(maxWeight) && maxWeight > 0 ? maxWeight : 0,
    price: Number.isFinite(price) && price >= 0 ? price : 0
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
  } else if (field === 'maxWeight' || field === 'price') {
    const parsed = parseFloat(rawValue);
    target[field] = Number.isFinite(parsed) ? parsed : 0;
  }

  return next.map((item) => normalizeRoomItem(item, item.id));
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

function buildRoomOptions(list, petWeight) {
  const normalized = normalizeRoomPricing(list);
  const weight = parsePetWeight(petWeight);

  return normalized.map((room) => ({
    ...room,
    weightLimitText: `≤${room.maxWeight}kg`,
    disabled: weight != null ? !supportsPetWeight(room, weight) : true
  }));
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
  getDefaultRoomPricing,
  normalizeRoomPricing,
  addRoom,
  removeRoom,
  updateRoomField,
  findRoom,
  findRoomPrice,
  supportsPetWeight,
  buildRoomOptions,
  validateRoomPricing,
  parsePetWeight
};
