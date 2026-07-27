const { normalizeOrderFees } = require('./orderFees');
const { formatOrderCreateTime } = require('./util');

const PERIOD_OPTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' }
];

function parseDateYmd(text) {
  if (!text || typeof text !== 'string') return null;
  const parts = text.trim().split(/[-/]/);
  if (parts.length < 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (!y || m < 0 || m > 11 || !d) return null;
  return new Date(y, m, d);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getOrderTimestamp(order) {
  if (order && order.createTime) return Number(order.createTime) || 0;
  const fromStart = parseDateYmd(order && order.startDate);
  return fromStart ? fromStart.getTime() : 0;
}

function getBoardingDays(order) {
  const start = parseDateYmd(order && order.startDate);
  const end = parseDateYmd(order && order.endDate);
  if (!start || !end) return 0;
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

function getPeriodRange(periodKey, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (periodKey === 'today') {
    return { start: startOfDay(now), end, label: '今日' };
  }
  if (periodKey === 'week') {
    return { start: startOfWeek(now), end, label: '本周' };
  }
  if (periodKey === 'month') {
    return { start: startOfMonth(now), end, label: '本月' };
  }
  return { start: null, end, label: '全部' };
}

function getPreviousPeriodRange(periodKey, now = new Date()) {
  if (periodKey === 'today') {
    const day = addDays(startOfDay(now), -1);
    return {
      start: day,
      end: new Date(day.getTime() + 86400000 - 1)
    };
  }
  if (periodKey === 'week') {
    const start = addDays(startOfWeek(now), -7);
    const end = addDays(startOfWeek(now), -1);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (periodKey === 'month') {
    const cur = startOfMonth(now);
    const end = addDays(cur, -1);
    end.setHours(23, 59, 59, 999);
    const start = startOfMonth(end);
    return { start, end };
  }
  return null;
}

function isInRange(ts, range) {
  if (!ts) return false;
  if (!range || !range.start) return true;
  return ts >= range.start.getTime() && ts <= range.end.getTime();
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatMoneyDisplay(value) {
  const n = roundMoney(value);
  if (n >= 10000) {
    return `${(n / 10000).toFixed(2)}万`;
  }
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function formatCompareText(current, previous, periodLabel) {
  if (previous <= 0) {
    if (current > 0) return `较${periodLabel}同期 — 新增营收`;
    return `较${periodLabel}同期 持平`;
  }
  const rate = Math.round(((current - previous) / previous) * 1000) / 10;
  if (rate > 0) return `较${periodLabel}同期 +${rate}%`;
  if (rate < 0) return `较${periodLabel}同期 ${rate}%`;
  return `较${periodLabel}同期 持平`;
}

function sumFees(orders, predicate) {
  let boardingFee = 0;
  let shippingFee = 0;
  let totalFee = 0;
  (orders || []).forEach((order) => {
    if (predicate && !predicate(order)) return;
    const fees = normalizeOrderFees(order);
    boardingFee += fees.boardingFee;
    shippingFee += fees.shippingFee;
    totalFee += fees.totalFee;
  });
  return {
    boardingFee: roundMoney(boardingFee),
    shippingFee: roundMoney(shippingFee),
    totalFee: roundMoney(totalFee)
  };
}

function filterByPeriod(orders, range) {
  return (orders || []).filter((order) => isInRange(getOrderTimestamp(order), range));
}

function buildStatusLabel(status) {
  const map = {
    pending: '待确认',
    awaiting_arrival: '待到店',
    confirmed: '待入住',
    boarding: '寄养中',
    completed: '已完成',
    cancelled: '已取消'
  };
  return map[status] || status || '--';
}

function buildMerchantStatistics(orders, periodKey = 'month', now = new Date()) {
  const list = Array.isArray(orders) ? orders : [];
  const range = getPeriodRange(periodKey, now);
  const prevRange = getPreviousPeriodRange(periodKey, now);

  const inPeriod = filterByPeriod(list, range);
  const prevPeriod = prevRange ? filterByPeriod(list, prevRange) : [];

  const completedInPeriod = inPeriod.filter((o) => o.status === 'completed');
  const boardingAll = list.filter((o) => o.status === 'boarding');
  const pendingAll = list.filter((o) => o.status === 'pending' || o.status === 'confirmed');
  const cancelledInPeriod = inPeriod.filter((o) => o.status === 'cancelled');

  const recognized = sumFees(completedInPeriod);
  const prevRecognized = sumFees(prevPeriod.filter((o) => o.status === 'completed'));
  const inTransit = sumFees(boardingAll);
  const pendingAmount = sumFees(pendingAll);
  const periodPipeline = sumFees(
    inPeriod.filter((o) => o.status === 'boarding' || o.status === 'completed')
  );

  const completedCount = completedInPeriod.length;
  const avgOrderValue = completedCount
    ? roundMoney(recognized.totalFee / completedCount)
    : 0;

  const boardingDaysList = completedInPeriod
    .map(getBoardingDays)
    .filter((d) => d > 0);
  const avgBoardingDays = boardingDaysList.length
    ? Math.round(boardingDaysList.reduce((s, d) => s + d, 0) / boardingDaysList.length)
    : 0;

  const petSet = new Set();
  completedInPeriod.forEach((o) => {
    if (o.petName) petSet.add(o.petName);
    else if (o.petId) petSet.add(o.petId);
  });

  const compositionTotal = recognized.boardingFee + recognized.shippingFee;
  const boardingPct = compositionTotal
    ? Math.round((recognized.boardingFee / compositionTotal) * 100)
    : 0;
  const shippingPct = compositionTotal ? 100 - boardingPct : 0;

  const orderStats = {
    pending: list.filter((o) => o.status === 'pending').length,
    boarding: boardingAll.length,
    completed: list.filter((o) => o.status === 'completed').length,
    cancelled: list.filter((o) => o.status === 'cancelled').length,
    periodTotal: inPeriod.length,
    periodCancelled: cancelledInPeriod.length
  };

  const recentOrders = list
    .slice()
    .sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a))
    .slice(0, 6)
    .map((order) => {
      const fees = normalizeOrderFees(order);
      return {
        id: order.id,
        petName: order.petName || '未知宠物',
        status: order.status,
        statusLabel: buildStatusLabel(order.status),
        amount: formatMoneyDisplay(fees.totalFee),
        createTimeText: formatOrderCreateTime(order) || '--',
        dateText: order.startDate && order.endDate
          ? `${order.startDate} ~ ${order.endDate}`
          : (order.createTime ? formatShortDate(order.createTime) : '--')
      };
    });

  const prevLabel = periodKey === 'today' ? '昨日' : (periodKey === 'week' ? '上周' : '上月');

  return {
    periodKey,
    periodLabel: range.label,
    summary: {
      revenue: formatMoneyDisplay(recognized.totalFee),
      revenueRaw: recognized.totalFee,
      compareText: prevRange ? formatCompareText(recognized.totalFee, prevRecognized.totalFee, prevLabel) : '',
      pipeline: formatMoneyDisplay(periodPipeline.totalFee),
      inTransit: formatMoneyDisplay(inTransit.totalFee),
      pending: formatMoneyDisplay(pendingAmount.totalFee)
    },
    kpis: [
      { key: 'inTransit', label: '在途金额', value: `¥${formatMoneyDisplay(inTransit.totalFee)}`, hint: '寄养中订单' },
      { key: 'pending', label: '待确认', value: `¥${formatMoneyDisplay(pendingAmount.totalFee)}`, hint: `${orderStats.pending} 单待处理` },
      { key: 'avg', label: '客单价', value: `¥${formatMoneyDisplay(avgOrderValue)}`, hint: '已完成均值' },
      { key: 'pets', label: '服务宠物', value: String(petSet.size), hint: avgBoardingDays ? `均 ${avgBoardingDays} 天` : '本期完成' }
    ],
    composition: {
      boardingFee: formatMoneyDisplay(recognized.boardingFee),
      shippingFee: formatMoneyDisplay(recognized.shippingFee),
      boardingPct,
      shippingPct,
      hasData: compositionTotal > 0
    },
    orderStats,
    recentOrders,
    updatedAt: formatDateTime(now)
  };
}

function formatShortDate(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatShortDate(d.getTime())} ${h}:${min}`;
}

module.exports = {
  PERIOD_OPTIONS,
  buildMerchantStatistics,
  formatMoneyDisplay
};
