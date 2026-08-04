/**
 * 节假日加价：放假休息日日历 + 商家按日固定加价。
 * 休息日列表由服务端提供（免费日历 API + 缓存），本地仅保留加价金额与自定义日期。
 */

const FESTIVAL_ORDER = [
  'newYear',
  'springFestival',
  'qingming',
  'laborDay',
  'dragonBoat',
  'midAutumn',
  'nationalDay'
];

const FESTIVAL_NAMES = {
  newYear: '元旦',
  springFestival: '春节',
  qingming: '清明节',
  laborDay: '劳动节',
  dragonBoat: '端午节',
  midAutumn: '中秋节',
  nationalDay: '国庆节'
};

/** 本地兜底：与服务端 FALLBACK 对齐，网络失败时仍可配置 */
const FALLBACK_BY_YEAR = {
  2026: [
    {
      id: 'newYear',
      name: '元旦',
      days: [
        { date: '2026-01-01', dayName: '元旦' },
        { date: '2026-01-02', dayName: '元旦假期' },
        { date: '2026-01-03', dayName: '元旦假期' }
      ]
    },
    {
      id: 'springFestival',
      name: '春节',
      days: [
        { date: '2026-02-15', dayName: '春节假期' },
        { date: '2026-02-16', dayName: '除夕' },
        { date: '2026-02-17', dayName: '初一' },
        { date: '2026-02-18', dayName: '初二' },
        { date: '2026-02-19', dayName: '初三' },
        { date: '2026-02-20', dayName: '初四' },
        { date: '2026-02-21', dayName: '初五' },
        { date: '2026-02-22', dayName: '初六' },
        { date: '2026-02-23', dayName: '初七' }
      ]
    },
    {
      id: 'qingming',
      name: '清明节',
      days: [
        { date: '2026-04-04', dayName: '清明假期' },
        { date: '2026-04-05', dayName: '清明' },
        { date: '2026-04-06', dayName: '清明假期' }
      ]
    },
    {
      id: 'laborDay',
      name: '劳动节',
      days: [
        { date: '2026-05-01', dayName: '劳动节' },
        { date: '2026-05-02', dayName: '劳动节假期' },
        { date: '2026-05-03', dayName: '劳动节假期' },
        { date: '2026-05-04', dayName: '劳动节假期' },
        { date: '2026-05-05', dayName: '劳动节假期' }
      ]
    },
    {
      id: 'dragonBoat',
      name: '端午节',
      days: [
        { date: '2026-06-19', dayName: '端午' },
        { date: '2026-06-20', dayName: '端午假期' },
        { date: '2026-06-21', dayName: '端午假期' }
      ]
    },
    {
      id: 'midAutumn',
      name: '中秋节',
      days: [
        { date: '2026-09-25', dayName: '中秋' },
        { date: '2026-09-26', dayName: '中秋假期' },
        { date: '2026-09-27', dayName: '中秋假期' }
      ]
    },
    {
      id: 'nationalDay',
      name: '国庆节',
      days: [
        { date: '2026-10-01', dayName: '国庆' },
        { date: '2026-10-02', dayName: '国庆假期' },
        { date: '2026-10-03', dayName: '国庆假期' },
        { date: '2026-10-04', dayName: '国庆假期' },
        { date: '2026-10-05', dayName: '国庆假期' },
        { date: '2026-10-06', dayName: '国庆假期' },
        { date: '2026-10-07', dayName: '国庆假期' }
      ]
    }
  ]
};

function formatDateLabel(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr || '';
  return `${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
}

function decorateGroups(groups, year) {
  return (groups || []).map((group) => ({
    id: group.id,
    name: group.name || FESTIVAL_NAMES[group.id] || group.id,
    year,
    days: (group.days || []).map((day) => ({
      date: day.date,
      label: day.label || formatDateLabel(day.date),
      dayName: day.dayName || day.name || (group.name || '休息日'),
      custom: !!day.custom
    })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }));
}

function getFallbackRestDayGroups(year) {
  const y = parseInt(year, 10);
  return decorateGroups(FALLBACK_BY_YEAR[y] || [], y);
}

function getDefaultHolidayPricing() {
  return { amounts: {}, customDays: {}, removedDays: {} };
}

/** 节日 → 日期列表（customDays / removedDays 共用） */
function normalizeCustomDays(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const customDays = {};
  Object.keys(src).forEach((festivalId) => {
    const id = String(festivalId || '').trim();
    if (!id) return;
    const list = Array.isArray(src[festivalId]) ? src[festivalId] : [];
    const dates = [];
    const seen = {};
    list.forEach((date) => {
      const key = String(date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || seen[key]) return;
      seen[key] = true;
      dates.push(key);
    });
    dates.sort();
    if (dates.length) customDays[id] = dates;
  });
  return customDays;
}

function normalizeHolidayPricing(holidayPricing) {
  const raw = (holidayPricing && holidayPricing.amounts) || {};
  const amounts = {};
  Object.keys(raw).forEach((date) => {
    const key = String(date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const n = parseFloat(raw[date]);
    if (!Number.isFinite(n) || n <= 0) return;
    amounts[key] = Math.round(n * 100) / 100;
  });
  return {
    amounts,
    customDays: normalizeCustomDays(holidayPricing && holidayPricing.customDays),
    removedDays: normalizeCustomDays(holidayPricing && holidayPricing.removedDays)
  };
}

function countHolidayPricingDays(holidayPricing) {
  return Object.keys(normalizeHolidayPricing(holidayPricing).amounts).length;
}

function formatHolidayPricingSummary(holidayPricing) {
  const count = countHolidayPricingDays(holidayPricing);
  return count > 0 ? `已设置 ${count} 天` : '默认不加价';
}

function getHolidaySurchargeAmount(holidayPricing, date) {
  const amounts = normalizeHolidayPricing(holidayPricing).amounts;
  const n = amounts[String(date || '')];
  return n > 0 ? n : 0;
}

function getAvailableHolidayYears(extraYears) {
  const nowY = new Date().getFullYear();
  const set = {};
  [nowY - 1, nowY, nowY + 1].forEach((y) => { set[y] = true; });
  Object.keys(FALLBACK_BY_YEAR).forEach((y) => { set[parseInt(y, 10)] = true; });
  (extraYears || []).forEach((y) => {
    const n = parseInt(y, 10);
    if (Number.isFinite(n)) set[n] = true;
  });
  return Object.keys(set)
    .map((y) => parseInt(y, 10))
    .filter((y) => y >= 2010 && y <= 2100)
    .sort((a, b) => a - b);
}

function resolveHolidayYear(year, availableYears) {
  const years = (availableYears && availableYears.length)
    ? availableYears
    : getAvailableHolidayYears();
  const y = parseInt(year, 10);
  if (years.indexOf(y) >= 0) return y;
  const nowY = new Date().getFullYear();
  if (years.indexOf(nowY) >= 0) return nowY;
  return years[years.length - 1];
}

/** @deprecated 兼容旧调用名，等同 getFallbackRestDayGroups */
function getLegalHolidayGroups(year) {
  return getFallbackRestDayGroups(year);
}

function getLegalHolidayDateSet(year) {
  const set = {};
  getFallbackRestDayGroups(year).forEach((group) => {
    (group.days || []).forEach((day) => {
      set[day.date] = true;
    });
  });
  return set;
}

/**
 * 合并官方休息日与商家自定义日期，并排除已删除日期。
 * customDays / removedDays: { festivalId: ['YYYY-MM-DD', ...] }
 */
function mergeRestDayGroups(baseGroups, customDays, year, removedDays) {
  const y = parseInt(year, 10);
  const customs = normalizeCustomDays(customDays);
  const removed = normalizeCustomDays(removedDays);
  const byId = {};
  decorateGroups(baseGroups || [], y).forEach((group) => {
    const removedSet = {};
    (removed[group.id] || []).forEach((date) => { removedSet[date] = true; });
    byId[group.id] = {
      ...group,
      days: (group.days || [])
        .filter((d) => !removedSet[d.date])
        .map((d) => ({ ...d, custom: false }))
    };
  });

  Object.keys(customs).forEach((festivalId) => {
    if (!byId[festivalId]) {
      byId[festivalId] = {
        id: festivalId,
        name: FESTIVAL_NAMES[festivalId] || festivalId,
        year: y,
        days: []
      };
    }
    const removedSet = {};
    (removed[festivalId] || []).forEach((date) => { removedSet[date] = true; });
    const existing = {};
    byId[festivalId].days.forEach((d) => { existing[d.date] = true; });
    customs[festivalId].forEach((date) => {
      if (existing[date] || removedSet[date]) return;
      // 只把同年自定义日期并入当年分组
      if (String(date).slice(0, 4) !== String(y)) return;
      byId[festivalId].days.push({
        date,
        label: formatDateLabel(date),
        dayName: '自定义',
        custom: true
      });
      existing[date] = true;
    });
    byId[festivalId].days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  });

  const ordered = FESTIVAL_ORDER
    .filter((id) => byId[id])
    .map((id) => byId[id]);
  Object.keys(byId).forEach((id) => {
    if (FESTIVAL_ORDER.indexOf(id) < 0) ordered.push(byId[id]);
  });
  return ordered;
}

function collectCustomDaysFromGroups(groups) {
  const customDays = {};
  (groups || []).forEach((group) => {
    const dates = (group.days || [])
      .filter((day) => day.custom)
      .map((day) => day.date)
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
    if (dates.length) customDays[group.id] = dates;
  });
  return normalizeCustomDays(customDays);
}

/**
 * 相对官方休息日，收集商家删除的日期（按节日分组）。
 */
function collectRemovedDaysFromGroups(baseGroups, groups, year) {
  const y = String(year || '');
  const currentById = {};
  (groups || []).forEach((group) => {
    currentById[group.id] = {};
    (group.days || []).forEach((day) => {
      if (day && day.date) currentById[group.id][day.date] = true;
    });
  });
  const removed = {};
  (baseGroups || []).forEach((group) => {
    const kept = currentById[group.id] || {};
    const dates = (group.days || [])
      .map((day) => day && day.date)
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)
        && String(date).slice(0, 4) === y
        && !kept[date]);
    if (dates.length) removed[group.id] = dates;
  });
  return normalizeCustomDays(removed);
}

/**
 * 休息日日历：优先请求服务端（timor 缓存），失败时回退本地国务院放假安排。
 */
function fetchRestDayCalendar(year) {
  const { API_BASE_URL } = require('../config/api');
  const { request } = require('./api');
  const y = parseInt(year, 10) || new Date().getFullYear();
  const fallback = () => ({
    success: true,
    year: y,
    source: 'fallback',
    groups: getFallbackRestDayGroups(y),
    years: getAvailableHolidayYears()
  });

  if (!API_BASE_URL) {
    return Promise.resolve(fallback());
  }

  return request(`/api/config/holiday-rest-days?year=${y}`, {}, {
    method: 'GET',
    auth: false
  }).then((res) => {
    if (!res || res.success === false || !Array.isArray(res.groups) || !res.groups.length) {
      const fb = fallback();
      fb.errMsg = (res && res.errMsg) || '';
      fb.years = getAvailableHolidayYears(res && res.years);
      return fb;
    }
    return {
      success: true,
      year: res.year || y,
      source: res.source || 'api',
      groups: decorateGroups(res.groups, res.year || y),
      years: getAvailableHolidayYears(res.years)
    };
  }).catch(() => fallback());
}

module.exports = {
  FESTIVAL_NAMES,
  FESTIVAL_ORDER,
  getDefaultHolidayPricing,
  normalizeHolidayPricing,
  normalizeCustomDays,
  countHolidayPricingDays,
  formatHolidayPricingSummary,
  getHolidaySurchargeAmount,
  getAvailableHolidayYears,
  resolveHolidayYear,
  getFallbackRestDayGroups,
  getLegalHolidayGroups,
  getLegalHolidayDateSet,
  mergeRestDayGroups,
  collectCustomDaysFromGroups,
  collectRemovedDaysFromGroups,
  formatDateLabel,
  fetchRestDayCalendar
};
