const { getHolidaySurchargeAmount } = require('./legalHolidays');

const CHECK_IN_CHARGE_OPTIONS = [
  { value: 'full', label: '全价' },
  { value: 'half', label: '半价' },
  { value: 'free', label: '免费' }
];

const DEPARTURE_DAY_CHARGE_OPTIONS = [
  { value: 'full', label: '全价' },
  { value: 'free', label: '免费' },
  { value: 'half', label: '时间段' }
];

const DEFAULT_DEPARTURE_CHARGE = {
  freeUntil: '12:00',
  halfUntil: '18:00',
  fullFrom: '18:00'
};

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function getCheckInDayFactor(charge) {
  const map = { full: 1, half: 0.5, free: 0 };
  return map[charge] != null ? map[charge] : 1;
}

function getDepartureChargeConfig(rules) {
  return {
    ...DEFAULT_DEPARTURE_CHARGE,
    ...(rules && rules.departureCharge ? rules.departureCharge : {})
  };
}

function getDepartureDayFactor(departureTime, rules) {
  const mode = (rules && rules.departureDayCharge) || 'full';
  if (mode === 'full') return 1;
  if (mode === 'free') return 0;

  const config = getDepartureChargeConfig(rules);
  const mins = timeToMinutes(departureTime || '12:00');
  const freeEnd = timeToMinutes(config.freeUntil);
  const halfEnd = timeToMinutes(config.halfUntil);
  const fullFrom = timeToMinutes(config.fullFrom);

  if (mins < freeEnd) return 0;
  if (mins < halfEnd) return 0.5;
  if (mins >= fullFrom) return 1;
  return 1;
}

function addDaysToDate(dateStr, offset) {
  const d = new Date(String(dateStr).replace(/-/g, '/'));
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(dateStr) {
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
}

function formatFactorText(factor) {
  if (factor === 0) return '免费';
  if (factor === 0.5) return '半价';
  return '全价';
}

function formatMoney(amount) {
  const num = Math.round((parseFloat(amount) || 0) * 100) / 100;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function calcStayFeeBreakdown(startDate, endDate, startTime, endTime, rules, basePrice) {
  const empty = {
    ready: false,
    days: 0,
    baseFee: 0,
    dailyBreakdown: [],
    chargeSummary: buildChargeSummary(rules)
  };

  if (!startDate || !endDate || !startTime || !endTime) {
    return empty;
  }

  const price = parseFloat(basePrice) || 0;
  const calendarDays = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  if (calendarDays <= 0) return empty;

  const billingRules = rules || {};
  const checkInFactor = getCheckInDayFactor(billingRules.checkInDayCharge || 'full');
  const departureFactor = getDepartureDayFactor(endTime, billingRules);
  const dailyBreakdown = [];

  for (let i = 0; i < calendarDays; i += 1) {
    const date = addDaysToDate(startDate, i);
    let factor;
    let dayLabel;

    if (calendarDays === 1) {
      // 开始=结束：当日寄养按全价计费（不受入住/离店当天规则影响）
      factor = 1;
      dayLabel = '当日';
    } else if (i === 0) {
      factor = checkInFactor;
      dayLabel = '入住当天';
    } else if (i === calendarDays - 1) {
      factor = departureFactor;
      dayLabel = '离店当天';
    } else {
      factor = 1;
      dayLabel = '寄养期间';
    }

    const baseDayFee = Math.round(price * factor * 100) / 100;
    const holidayFee = factor > 0
      ? getHolidaySurchargeAmount(billingRules.holidayPricing, date)
      : 0;
    const fee = Math.round((baseDayFee + holidayFee) * 100) / 100;
    if (holidayFee > 0) {
      dayLabel = `${dayLabel} · 休息日+¥${formatMoney(holidayFee)}`;
    }
    dailyBreakdown.push({
      date,
      dateDisplay: formatDisplayDate(date),
      dayLabel,
      factor,
      factorText: formatFactorText(factor),
      baseDayFee,
      baseDayFeeText: formatMoney(baseDayFee),
      holidayFee,
      holidayFeeText: formatMoney(holidayFee),
      fee,
      feeText: formatMoney(fee)
    });
  }

  const days = dailyBreakdown.reduce((sum, item) => sum + item.factor, 0);
  const baseFee = dailyBreakdown.reduce((sum, item) => sum + item.fee, 0);

  return {
    ready: true,
    days,
    daysText: Number.isInteger(days) ? String(days) : days.toFixed(1),
    baseFee,
    baseFeeText: formatMoney(baseFee),
    dailyBreakdown,
    chargeSummary: buildChargeSummary(billingRules)
  };
}

function calcStayDays(startDate, endDate, startTime, endTime, rules) {
  if (!startDate || !endDate) return 0;

  const calendarDays = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  const checkInFactor = getCheckInDayFactor((rules && rules.checkInDayCharge) || 'full');

  if (calendarDays <= 1) {
    // 当日寄养按全价（1 天）
    return 1;
  }

  const departureFactor = getDepartureDayFactor(endTime, rules);
  const middleDays = Math.max(0, calendarDays - 2);
  return checkInFactor + middleDays + departureFactor;
}

function getChargeLabel(charge, options) {
  const item = options.find((opt) => opt.value === charge);
  return item ? item.label : '全价';
}

function getCheckInChargeLabel(charge) {
  return getChargeLabel(charge, CHECK_IN_CHARGE_OPTIONS);
}

function getDepartureDayChargeLabel(charge) {
  return getChargeLabel(charge, DEPARTURE_DAY_CHARGE_OPTIONS);
}

function buildChargeSummary(rules) {
  const checkInLabel = getCheckInChargeLabel((rules && rules.checkInDayCharge) || 'full');
  const departureMode = (rules && rules.departureDayCharge) || 'full';

  if (departureMode === 'half') {
    const config = getDepartureChargeConfig(rules);
    return `入住当天计${checkInLabel}；离店当天按时间分段：${config.freeUntil} 前免费，${config.halfUntil} 前计半天，${config.fullFrom} 后起计全天；当日寄养按全价`;
  }

  const departureLabel = getDepartureDayChargeLabel(departureMode);
  return `入住当天计${checkInLabel}；离店当天计${departureLabel}；当日寄养按全价`;
}

function normalizeDepartureCharge(departureCharge) {
  const merged = {
    ...DEFAULT_DEPARTURE_CHARGE,
    ...(departureCharge || {})
  };
  let freeUntil = timeToMinutes(merged.freeUntil);
  let halfUntil = timeToMinutes(merged.halfUntil);
  let fullFrom = timeToMinutes(merged.fullFrom);

  if (halfUntil < freeUntil) halfUntil = freeUntil;
  if (fullFrom < halfUntil) fullFrom = halfUntil;

  const toTime = (mins) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  return {
    freeUntil: toTime(freeUntil),
    halfUntil: toTime(halfUntil),
    fullFrom: toTime(fullFrom)
  };
}

module.exports = {
  CHECK_IN_CHARGE_OPTIONS,
  DEPARTURE_DAY_CHARGE_OPTIONS,
  DEFAULT_DEPARTURE_CHARGE,
  getCheckInDayFactor,
  getDepartureDayFactor,
  calcStayDays,
  calcStayFeeBreakdown,
  formatMoney,
  getCheckInChargeLabel,
  getDepartureDayChargeLabel,
  buildChargeSummary,
  normalizeDepartureCharge,
  getDepartureChargeConfig
};
