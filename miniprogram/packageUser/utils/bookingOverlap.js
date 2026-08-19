/** 占用时段、不可再约同时间的订单状态 */
const OCCUPYING_STATUSES = ['pending', 'confirmed', 'awaiting_arrival', 'boarding', 'toPay'];

function toRangeMs(date, time, fallbackTime) {
  const d = String(date || '').trim();
  if (!d) return NaN;
  const t = String(time || fallbackTime || '00:00').trim() || '00:00';
  const ms = new Date(`${d.replace(/-/g, '/')} ${t}:00`).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  // 边界相接（前单离店时刻 = 后单入住时刻）不算冲突
  return aStart < bEnd && aEnd > bStart;
}

function isOccupyingStatus(status) {
  return OCCUPYING_STATUSES.indexOf(String(status || '')) >= 0;
}

function orderMatchesPet(order, pet) {
  if (!order || !pet) return false;
  const petId = String(pet.id || pet.petId || pet.pet_id || '').trim();
  const orderPetId = String(order.petId || order.pet_id || '').trim();
  if (petId && orderPetId) return petId === orderPetId;
  // 当前宠物已有 id：只按 id 判断，避免同名宠物（尤其是新建的「猫」）误撞老订单
  if (petId) return false;
  // 仅双方都没有宠物 id 时，才用姓名兼容线上老数据
  if (!orderPetId) {
    const name = String(pet.name || pet.petName || '').trim();
    return !!(name && name === String(order.petName || '').trim());
  }
  return false;
}

/**
 * 查找与指定宠物、时段冲突的占用订单
 * @returns {object|null} 冲突订单
 */
function findPetBookingConflict(orders, pet, range, options = {}) {
  const list = Array.isArray(orders) ? orders : [];
  const startDate = range && range.startDate;
  const endDate = range && range.endDate;
  const startTime = range && range.startTime;
  const endTime = range && range.endTime;
  const excludeOrderId = options.excludeOrderId ? String(options.excludeOrderId) : '';
  const excludeGroupId = options.excludeGroupId ? String(options.excludeGroupId) : '';

  const newStart = toRangeMs(startDate, startTime, '00:00');
  const newEnd = toRangeMs(endDate, endTime, '23:59');
  if (!Number.isFinite(newStart) || !Number.isFinite(newEnd) || newEnd <= newStart) {
    return null;
  }

  for (let i = 0; i < list.length; i += 1) {
    const order = list[i];
    if (!order || !isOccupyingStatus(order.status)) continue;
    const oid = String(order.id || order.order_id || '');
    if (excludeOrderId && oid === excludeOrderId) continue;
    const gid = String(order.orderGroupId || '');
    if (excludeGroupId && gid && gid === excludeGroupId) continue;
    if (!orderMatchesPet(order, pet)) continue;

    const oldStart = toRangeMs(order.startDate, order.startTime, '00:00');
    const oldEnd = toRangeMs(order.endDate, order.endTime, '23:59');
    if (rangesOverlap(newStart, newEnd, oldStart, oldEnd)) {
      return order;
    }
  }
  return null;
}

function getPetBookingConflictMessage(orders, pet, range, options) {
  const hit = findPetBookingConflict(orders, pet, range, options);
  if (!hit) return '';
  const name = (pet && (pet.name || pet.petName)) || hit.petName || '该宠物';
  const status = hit.status === 'boarding' ? '正在寄养' : '已有预约';
  return `${name}${status}（${hit.startDate || ''} ~ ${hit.endDate || ''}），不能再预约重叠时段`;
}

function findFirstPetsBookingConflict(orders, pets, range, options) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  for (let i = 0; i < list.length; i += 1) {
    const msg = getPetBookingConflictMessage(orders, list[i], range, options);
    if (msg) return msg;
  }
  return '';
}

module.exports = {
  OCCUPYING_STATUSES,
  toRangeMs,
  rangesOverlap,
  isOccupyingStatus,
  orderMatchesPet,
  findPetBookingConflict,
  getPetBookingConflictMessage,
  findFirstPetsBookingConflict
};
