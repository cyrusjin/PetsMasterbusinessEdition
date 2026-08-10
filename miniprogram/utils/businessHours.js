const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' }
];

const DEFAULT_BUSINESS_HOURS = {
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  openTime: '08:00',
  closeTime: '20:00'
};

function normalizeTime(value, fallback) {
  const text = (value || fallback || DEFAULT_BUSINESS_HOURS.openTime).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback || DEFAULT_BUSINESS_HOURS.openTime;
  const hour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function parseLegacyHours(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  return {
    weekdays: [...DEFAULT_BUSINESS_HOURS.weekdays],
    openTime: normalizeTime(match[1], DEFAULT_BUSINESS_HOURS.openTime),
    closeTime: normalizeTime(match[2], DEFAULT_BUSINESS_HOURS.closeTime)
  };
}

function normalizeWeekdays(weekdays) {
  if (!Array.isArray(weekdays)) return [...DEFAULT_BUSINESS_HOURS.weekdays];
  const values = weekdays
    .map((item) => parseInt(item, 10))
    .filter((item) => item >= 1 && item <= 7);
  return values.length ? [...new Set(values)].sort((a, b) => a - b) : [...DEFAULT_BUSINESS_HOURS.weekdays];
}

function normalizeBusinessHours(source, legacyHours) {
  if (source && (source.openTime || source.closeTime || source.weekdays)) {
    return {
      weekdays: normalizeWeekdays(source.weekdays),
      openTime: normalizeTime(source.openTime, DEFAULT_BUSINESS_HOURS.openTime),
      closeTime: normalizeTime(source.closeTime, DEFAULT_BUSINESS_HOURS.closeTime)
    };
  }

  const legacy = parseLegacyHours(legacyHours);
  if (legacy) return legacy;
  return { ...DEFAULT_BUSINESS_HOURS };
}

function formatWeekdays(weekdays) {
  const sorted = normalizeWeekdays(weekdays);
  if (sorted.length === 7) return '周一至周日';
  if (sorted.length === 0) return '未设置营业日';

  const labels = sorted.map((value) => {
    const item = WEEKDAY_OPTIONS.find((day) => day.value === value);
    return item ? item.label : '';
  }).filter(Boolean);

  return labels.join('、');
}

function formatBusinessHoursText(businessHours) {
  const normalized = normalizeBusinessHours(businessHours);
  return `${formatWeekdays(normalized.weekdays)} ${normalized.openTime}-${normalized.closeTime}`;
}

function isWeekdaySelected(weekdays, value) {
  return normalizeWeekdays(weekdays).includes(value);
}

function toggleWeekday(weekdays, value) {
  const day = parseInt(value, 10);
  const current = normalizeWeekdays(weekdays);
  const index = current.indexOf(day);
  if (index >= 0) {
    if (current.length === 1) return current;
    current.splice(index, 1);
    return current;
  }
  current.push(day);
  return current.sort((a, b) => a - b);
}

module.exports = {
  WEEKDAY_OPTIONS,
  DEFAULT_BUSINESS_HOURS,
  normalizeBusinessHours,
  formatBusinessHoursText,
  formatWeekdays,
  isWeekdaySelected,
  toggleWeekday
};
