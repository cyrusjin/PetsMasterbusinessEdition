function normalizeOrderId(value) {
  return String(value || '').trim();
}

function getLogOrderId(log) {
  return normalizeOrderId(log && (log.orderId || log.order_id));
}

function getTodayDateStr(refDate = new Date()) {
  const y = refDate.getFullYear();
  const m = String(refDate.getMonth() + 1).padStart(2, '0');
  const d = String(refDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isExpiringToday(endDate, refDate = new Date()) {
  if (!endDate) return false;
  return endDate === getTodayDateStr(refDate);
}

function parseLogTimestamp(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  }
  if (typeof value === 'object' && value) {
    if (value.$date) return parseLogTimestamp(value.$date);
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getLogDateKey(log) {
  if (!log) return '';
  const timestamp = parseLogTimestamp(log.createTime);
  if (timestamp) {
    return getTodayDateStr(new Date(timestamp));
  }
  const text = String(log.time || '');
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function buildTodayCheckCountMap(logs, refDate = new Date()) {
  const todayKey = getTodayDateStr(refDate);
  const map = {};
  (logs || []).forEach((log) => {
    const orderId = getLogOrderId(log);
    if (!orderId) return;
    if (getLogDateKey(log) !== todayKey) return;
    map[orderId] = (map[orderId] || 0) + 1;
  });
  return map;
}

function countTodayCheckIns(logs, orderId, refDate = new Date()) {
  const orderKey = normalizeOrderId(orderId);
  if (!orderKey) return 0;
  return buildTodayCheckCountMap(logs, refDate)[orderKey] || 0;
}

function buildBoardingListWithDailyStats(orders, pets, logs, refDate = new Date()) {
  const { formatOrderCreateTime } = require('./util');
  const todayCountMap = buildTodayCheckCountMap(logs, refDate);
  const list = (orders || []).map((order) => {
    const pet = (pets || []).find((item) => item.id === order.petId);
    const orderKey = normalizeOrderId(order.id || order.order_id);
    const todayCheckCount = orderKey ? (todayCountMap[orderKey] || 0) : 0;
    const expiringToday = isExpiringToday(order.endDate, refDate);
    // 只保留列表展示字段，减小 setData 体积
    return {
      id: order.id || order.order_id,
      petName: order.petName || (pet && pet.name) || '宠物',
      petPhoto: pet ? pet.photo : '',
      endDate: order.endDate || '',
      createTimeText: formatOrderCreateTime(order) || '--',
      todayCheckCount,
      needsCheck: todayCheckCount === 0,
      isExpiringToday: expiringToday,
      expiring: expiringToday
    };
  });

  return list.sort((a, b) => {
    const countDiff = (a.todayCheckCount || 0) - (b.todayCheckCount || 0);
    if (countDiff !== 0) return countDiff;
    if (a.isExpiringToday !== b.isExpiringToday) {
      return a.isExpiringToday ? -1 : 1;
    }
    return (a.endDate || '').localeCompare(b.endDate || '');
  });
}

function buildDailyCheckOrderOptions(orders, logs, options = {}) {
  const { selectedIds = [], refDate = new Date() } = options;
  const selectedSet = new Set(selectedIds);
  const todayCountMap = buildTodayCheckCountMap(logs, refDate);

  return (orders || []).map((order) => {
    const orderKey = normalizeOrderId(order.id || order.order_id);
    const todayCheckCount = orderKey ? (todayCountMap[orderKey] || 0) : 0;
    const snapshot = order.petSnapshot || {};
    const petGender = order.petGender || snapshot.gender || '--';
    const petBreed = order.petBreed || snapshot.breed || '--';
    return {
      id: order.id,
      petName: order.petName,
      startDate: order.startDate,
      endDate: order.endDate,
      petGender,
      petBreed,
      todayCheckCount,
      selected: selectedSet.has(order.id)
    };
  }).sort((a, b) => {
    const countDiff = (a.todayCheckCount || 0) - (b.todayCheckCount || 0);
    if (countDiff !== 0) return countDiff;
    return (a.petName || '').localeCompare(b.petName || '', 'zh-CN');
  });
}

function countUncheckedBoardingPets(boardingList) {
  return (boardingList || []).filter((item) => (item.todayCheckCount || 0) === 0).length;
}

module.exports = {
  getTodayDateStr,
  getLogDateKey,
  isExpiringToday,
  countTodayCheckIns,
  buildBoardingListWithDailyStats,
  buildDailyCheckOrderOptions,
  countUncheckedBoardingPets
};
