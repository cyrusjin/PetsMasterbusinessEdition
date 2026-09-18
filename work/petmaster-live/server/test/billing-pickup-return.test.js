const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(serverRoot, '..', '..', '..');
const billing = require(path.join(workspaceRoot, 'miniprogram/utils/billing.js'));
const { calcMultiPetBoardingFees } = require(path.join(workspaceRoot, 'miniprogram/utils/multiPetPricing.js'));

const HALF_RULES = {
  checkInDayCharge: 'full',
  departureDayCharge: 'half',
  departureCharge: {
    freeUntil: '12:00',
    halfUntil: '18:00',
    fullFrom: '18:00'
  }
};

const WITH_SEND_FULL = {
  ...HALF_RULES,
  pickupReturnFullDeparture: true
};

const PICKUP_WITH_RETURN = {
  needPickup: true,
  pickupIncludeReturn: true
};

function departureDay(breakdown) {
  return breakdown.dailyBreakdown.find((item) => String(item.dayLabel).includes('离店当天'));
}

function main() {
  const missingField = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-18', '10:00', '10:00', HALF_RULES, 100, PICKUP_WITH_RETURN
  );
  assert.equal(missingField.days, 2);
  assert.equal(departureDay(missingField).factor, 0);

  const noPickup = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-18', '10:00', '10:00', WITH_SEND_FULL, 100, { needPickup: false }
  );
  assert.equal(noPickup.days, 2);
  assert.equal(departureDay(noPickup).factor, 0);

  const outboundOnly = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-18', '10:00', '10:00', WITH_SEND_FULL, 100, {
      needPickup: true,
      pickupIncludeReturn: false
    }
  );
  assert.equal(outboundOnly.days, 2);
  assert.equal(departureDay(outboundOnly).factor, 0);

  const withSend = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-18', '10:00', '10:00', WITH_SEND_FULL, 100, PICKUP_WITH_RETURN
  );
  assert.equal(withSend.days, 3);
  assert.equal(withSend.baseFee, 300);
  const sendDay = departureDay(withSend);
  assert.equal(sendDay.factor, 1);
  assert.equal(sendDay.factorText, '全价');
  assert.equal(sendDay.dayLabel, '离店当天 · 含送全价');
  assert.match(withSend.chargeSummary, /离店当天因含送按全价/);

  const wouldBeHalf = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-18', '10:00', '15:00', WITH_SEND_FULL, 80, PICKUP_WITH_RETURN
  );
  assert.equal(wouldBeHalf.days, 3);
  assert.equal(departureDay(wouldBeHalf).factor, 1);

  const sameDay = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-16', '10:00', '10:00', WITH_SEND_FULL, 100, PICKUP_WITH_RETURN
  );
  assert.equal(sameDay.days, 1);
  assert.equal(sameDay.dailyBreakdown[0].dayLabel, '当日');

  assert.equal(
    billing.calcStayDays('2026-09-16', '2026-09-18', '10:00', '10:00', WITH_SEND_FULL, PICKUP_WITH_RETURN),
    3
  );
  assert.equal(
    billing.calcStayDays('2026-09-16', '2026-09-18', '10:00', '10:00', WITH_SEND_FULL, {
      needPickup: true,
      pickupIncludeReturn: false
    }),
    2
  );

  const onlineDefault = billing.normalizePickupReturnFullDeparture(undefined);
  assert.equal(onlineDefault, false);
  assert.equal(billing.normalizePickupReturnFullDeparture(false), false);
  assert.equal(billing.normalizePickupReturnFullDeparture('true'), false);
  assert.equal(billing.normalizePickupReturnFullDeparture(true), true);

  const merchantSummary = billing.buildChargeSummary(WITH_SEND_FULL);
  assert.match(merchantSummary, /预约接送且含送时离店当天改按全价/);

  const fullModeIgnored = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-18', '10:00', '10:00',
    { ...WITH_SEND_FULL, departureDayCharge: 'full' },
    100,
    PICKUP_WITH_RETURN
  );
  assert.equal(fullModeIgnored.days, 3);
  assert.equal(departureDay(fullModeIgnored).factor, 1);
  assert.equal(departureDay(fullModeIgnored).dayLabel, '离店当天');
  assert.doesNotMatch(billing.buildChargeSummary({
    ...WITH_SEND_FULL,
    departureDayCharge: 'full'
  }), /含送/);

  const freeModeIgnored = billing.calcStayFeeBreakdown(
    '2026-09-16', '2026-09-18', '10:00', '10:00',
    { ...WITH_SEND_FULL, departureDayCharge: 'free' },
    100,
    PICKUP_WITH_RETURN
  );
  assert.equal(freeModeIgnored.days, 2);
  assert.equal(departureDay(freeModeIgnored).factor, 0);

  const multi = calcMultiPetBoardingFees({
    pets: [{ id: 'a', name: '豆豆', weight: 3 }],
    rules: {
      ...WITH_SEND_FULL,
      billingMode: 'weight',
      weightPricing: [
        { min: 0, max: 5, price: 100, isAbove: false },
        { min: 5, max: null, price: 100, isAbove: true }
      ]
    },
    startDate: '2026-09-16',
    endDate: '2026-09-18',
    startTime: '10:00',
    endTime: '10:00',
    needPickup: true,
    pickupIncludeReturn: true
  });
  assert.equal(multi.boardingTotal, 300);
  assert.equal(multi.items[0].breakdown.days, 3);

  const storeService = fs.readFileSync(
    path.join(__dirname, '../src/services/storeService.js'),
    'utf8'
  );
  assert.match(storeService, /pickupReturnFullDeparture/);
  assert.match(storeService, /\(next\.departureDayCharge \|\| 'full'\) !== 'half'/);
  assert.match(storeService, /next\.pickupReturnFullDeparture = incoming\.pickupReturnFullDeparture === true/);

  console.log('billing-pickup-return.test.js ok');
}

main();
