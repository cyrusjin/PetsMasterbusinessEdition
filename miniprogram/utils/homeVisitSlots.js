const { normalizeBusinessHours } = require('./businessHours');

const SLOT_DURATION_MIN = 120;

function normalizeTime(value, fallback) {
  const text = String(value == null ? '' : value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback || '';
  const hour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

function listHomeVisitSlots(store, dateStr, now) {
  const hours = store && store.businessHours;
  const legacy = store && store.hours;
  const slots = decorateSlotsForDate(buildHomeVisitSlots(hours, legacy), dateStr, now);
  return {
    weekdays: normalizeBusinessHours(hours, legacy).weekdays,
    slots,
    isBusinessDate: dateStr ? isBusinessDate(dateStr, hours, legacy) : true
  };
}

module.exports = {
  SLOT_DURATION_MIN,
  buildHomeVisitSlots,
  parseVisitTimeSlot,
  isBusinessDate,
  decorateSlotsForDate,
  formatVisitSlotText,
  weekdayFromDateStr,
  listHomeVisitSlots
};
