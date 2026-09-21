const assert = require('node:assert/strict');
const {
  buildHomeVisitSlots,
  parseVisitTimeSlot,
  isBusinessDate,
  decorateSlotsForDate,
  formatVisitSlotText,
  resolveHomeVisitOrderTimes,
  weekdayFromDateStr
} = require('../src/utils/homeVisitSlots');

function main() {
  const slots = buildHomeVisitSlots({
    weekdays: [1, 2, 3, 4, 5],
    openTime: '08:00',
    closeTime: '20:00'
  });
  assert.deepEqual(slots.map((item) => item.key), [
    '08:00-10:00',
    '10:00-12:00',
    '12:00-14:00',
    '14:00-16:00',
    '16:00-18:00',
    '18:00-20:00'
  ]);

  const leftover = buildHomeVisitSlots({
    weekdays: [1],
    openTime: '08:30',
    closeTime: '19:00'
  });
  assert.deepEqual(leftover.map((item) => item.key), [
    '08:30-10:30',
    '10:30-12:30',
    '12:30-14:30',
    '14:30-16:30',
    '16:30-18:30'
  ]);

  const shortWindow = buildHomeVisitSlots({
    weekdays: [1],
    openTime: '09:00',
    closeTime: '10:30'
  });
  assert.deepEqual(shortWindow.map((item) => item.key), ['09:00-10:30']);

  const fromLegacy = buildHomeVisitSlots(null, '9:00-18:00');
  assert.equal(fromLegacy[0].key, '09:00-11:00');
  assert.equal(fromLegacy[fromLegacy.length - 1].key, '15:00-17:00');

  assert.equal(weekdayFromDateStr('2026-09-21'), 1);
  assert.equal(isBusinessDate('2026-09-21', { weekdays: [1, 2, 3, 4, 5], openTime: '08:00', closeTime: '20:00' }), true);
  assert.equal(isBusinessDate('2026-09-20', { weekdays: [1, 2, 3, 4, 5], openTime: '08:00', closeTime: '20:00' }), false);

  const now = new Date('2026-09-21T11:10:00+08:00');
  const decorated = decorateSlotsForDate(slots, '2026-09-21', now);
  assert.equal(decorated[0].disabled, true);
  assert.equal(decorated[1].disabled, true);
  assert.equal(decorated[2].disabled, false);

  const store = {
    businessHours: { weekdays: [1, 2, 3, 4, 5], openTime: '08:00', closeTime: '20:00' }
  };

  const legacy = resolveHomeVisitOrderTimes({
    serviceLine: 'homeFeeding',
    startDate: '2026-09-21',
    endDate: '2026-09-21',
    startTime: '09:30',
    endTime: '10:30'
  }, store, now);
  assert.deepEqual(legacy.patch, {});
  assert.equal(legacy.errMsg, undefined);

  const accepted = resolveHomeVisitOrderTimes({
    serviceLine: 'homeFeeding',
    startDate: '2026-09-21',
    endDate: '2026-09-21',
    startTime: '14:00',
    endTime: '16:00',
    visitTimeSlot: '14:00-16:00'
  }, store, now);
  assert.deepEqual(accepted.patch, {
    visitTimeSlot: '14:00-16:00',
    startTime: '14:00',
    endTime: '16:00'
  });

  const inferred = resolveHomeVisitOrderTimes({
    serviceLine: 'homeFeeding',
    startDate: '2026-09-22',
    endDate: '2026-09-22',
    startTime: '10:00',
    endTime: '12:00'
  }, store, now);
  assert.equal(inferred.patch.visitTimeSlot, '10:00-12:00');

  const closedDay = resolveHomeVisitOrderTimes({
    serviceLine: 'homeFeeding',
    startDate: '2026-09-20',
    visitTimeSlot: '10:00-12:00'
  }, store, now);
  assert.equal(closedDay.errMsg, '该日期不在商家营业时间内');

  const pastSlot = resolveHomeVisitOrderTimes({
    serviceLine: 'homeFeeding',
    startDate: '2026-09-21',
    visitTimeSlot: '08:00-10:00'
  }, store, now);
  assert.equal(pastSlot.errMsg, '该上门时段已过，请选择其他时段');

  const invalidSlot = resolveHomeVisitOrderTimes({
    serviceLine: 'homeFeeding',
    startDate: '2026-09-22',
    visitTimeSlot: '09:00-11:00'
  }, store, now);
  assert.equal(invalidSlot.errMsg, '请选择商家营业时间内的上门时段');

  const boarding = resolveHomeVisitOrderTimes({
    serviceLine: 'boarding',
    startDate: '2026-09-21',
    visitTimeSlot: '08:00-10:00'
  }, store, now);
  assert.deepEqual(boarding.patch, {});

  assert.equal(formatVisitSlotText({ startTime: '09:30', endTime: '10:30' }), '09:30');
  assert.equal(formatVisitSlotText({ startTime: '14:00', endTime: '16:00' }), '14:00-16:00');
  assert.equal(formatVisitSlotText({ visitTimeSlot: '08:00-10:00', startTime: '08:00' }), '08:00-10:00');
  assert.equal(parseVisitTimeSlot('8:00~10:00').key, '08:00-10:00');

  console.log('home-visit-slots.test.js ok');
}

main();
