const SLOT_DURATION_MIN = 120;

const DEFAULT_BUSINESS_HOURS = {
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  openTime: '08:00',
  closeTime: '20:00'
};

function normalizeTime(value, fallback) {
  const text = String(value == null ? '' : value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback || '';
  const hour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
  return {
    weekdays: [...DEFAULT_BUSINESS_HOURS.weekdays],
    openTime: DEFAULT_BUSINESS_HOURS.openTime,
    closeTime: DEFAULT_BUSINESS_HOURS.closeTime
  };
}

function timeToMinutes(timeStr) {
  const normalized = normalizeTime(timeStr, '');
  if (!normalized) return null;
  const parts = normalized.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function minutesToTime(total) {
  const clamped = Math.max(0, Math.min(24 * 60, total));
  const hour = Math.min(23, Math.floor(clamped / 60));
  const minute = clamped >= 24 * 60 ? 59 : clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function makeSlot(startTime, endTime) {
  return {
    startTime,
    endTime,
    key: `${startTime}-${endTime}`,
    label: `${startTime}-${endTime}`
  };
}

function weekdayFromDateStr(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return 0;
  const dow = date.getUTCDay();
  return dow === 0 ? 7 : dow;
}

function shanghaiNow(now) {
  const date = now instanceof Date ? now : (now ? new Date(now) : new Date());
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = {};
  fmt.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
  });
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute || 0)
  };
}

function buildHomeVisitSlots(businessHours, legacyHours) {
  const hours = normalizeBusinessHours(businessHours, legacyHours);
  const open = timeToMinutes(hours.openTime);
  const close = timeToMinutes(hours.closeTime);
  if (open == null || close == null || close <= open) return [];

  if (close - open < SLOT_DURATION_MIN) {
    return [makeSlot(hours.openTime, hours.closeTime)];
  }

  const slots = [];
  for (let start = open; start + SLOT_DURATION_MIN <= close; start += SLOT_DURATION_MIN) {
    slots.push(makeSlot(minutesToTime(start), minutesToTime(start + SLOT_DURATION_MIN)));
  }
  return slots;
}

function parseVisitTimeSlot(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const startTime = normalizeTime(match[1], '');
  const endTime = normalizeTime(match[2], '');
  if (!startTime || !endTime) return null;
  return makeSlot(startTime, endTime);
}

function isBusinessDate(dateStr, businessHours, legacyHours) {
  const weekday = weekdayFromDateStr(dateStr);
  if (!weekday) return false;
  const hours = normalizeBusinessHours(businessHours, legacyHours);
  return hours.weekdays.indexOf(weekday) >= 0;
}

function decorateSlotsForDate(slots, dateStr, now) {
  const current = shanghaiNow(now);
  return (Array.isArray(slots) ? slots : []).map((slot) => {
    const startMin = timeToMinutes(slot && slot.startTime);
    const past = !!dateStr && dateStr === current.date && startMin != null && startMin <= current.minutes;
    return { ...slot, disabled: !!past };
  });
}

function inferSlotFromTimes(startTime, endTime) {
  const parsed = parseVisitTimeSlot(`${startTime}-${endTime}`);
  if (!parsed) return null;
  const startMin = timeToMinutes(parsed.startTime);
  const endMin = timeToMinutes(parsed.endTime);
  if (startMin == null || endMin == null || endMin - startMin !== SLOT_DURATION_MIN) return null;
  return parsed;
}

function formatVisitSlotText(order) {
  const slot = parseVisitTimeSlot(order && order.visitTimeSlot);
  if (slot) return slot.label;
  const inferred = inferSlotFromTimes(order && order.startTime, order && order.endTime);
  if (inferred) return inferred.label;
  return String((order && order.startTime) || '').trim();
}

function resolveHomeVisitOrderTimes(order, store, now) {
  const line = String((order && (order.serviceLine || order.serviceKind)) || '').trim();
  const snapLine = order && order.feeSnapshot && order.feeSnapshot.serviceLine;
  if (line !== 'homeFeeding' && snapLine !== 'homeFeeding') return { patch: {} };
  if (order && order.serviceRecord) return { patch: {} };

  const hoursSource = store && store.businessHours;
  const legacyHours = store && store.hours;
  const startDate = String((order && order.startDate) || '').trim();
  const endDate = String((order && order.endDate) || startDate).trim();

  const parsed = parseVisitTimeSlot(order && order.visitTimeSlot)
    || inferSlotFromTimes(order && order.startTime, order && order.endTime);
  if (!parsed) return { patch: {} };

  if (startDate && !isBusinessDate(startDate, hoursSource, legacyHours)) {
    return { errMsg: '该日期不在商家营业时间内' };
  }
  if (endDate && endDate !== startDate && !isBusinessDate(endDate, hoursSource, legacyHours)) {
    return { errMsg: '该日期不在商家营业时间内' };
  }

  const slots = buildHomeVisitSlots(hoursSource, legacyHours);
  const matched = slots.find((item) => item.key === parsed.key);
  if (!matched) return { errMsg: '请选择商家营业时间内的上门时段' };

  const decorated = decorateSlotsForDate([matched], startDate, now)[0];
  if (decorated && decorated.disabled) {
    return { errMsg: '该上门时段已过，请选择其他时段' };
  }

  return {
    patch: {
      visitTimeSlot: matched.key,
      startTime: matched.startTime,
      endTime: matched.endTime
    }
  };
}

module.exports = {
  SLOT_DURATION_MIN,
  DEFAULT_BUSINESS_HOURS,
  normalizeBusinessHours,
  buildHomeVisitSlots,
  parseVisitTimeSlot,
  isBusinessDate,
  decorateSlotsForDate,
  formatVisitSlotText,
  resolveHomeVisitOrderTimes,
  weekdayFromDateStr
};
