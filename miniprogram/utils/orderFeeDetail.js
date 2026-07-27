const util = require('./util');
const { calcStayFeeBreakdown, formatMoney } = require('./billing');
const { normalizeOrderFees } = require('./orderFees');

function parseDeposit(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : 0;
}

function hasStoredFeeSnapshot(order) {
  const snap = order && order.feeSnapshot;
  return !!(snap && Array.isArray(snap.dailyBreakdown) && snap.dailyBreakdown.length);
}

function resolveOrderDeposit(order, store) {
  if (!order) return 0;
  const fromOrder = parseDeposit(order.deposit);
  if (fromOrder > 0) return fromOrder;

  const contract = order.contractSnapshot || {};
  const fromContract = parseDeposit(contract.deposit);
  if (fromContract > 0) return fromContract;

  if (store && store.deposit != null) {
    return parseDeposit(store.deposit);
  }
  return 0;
}

function resolveBasePrice(order, rules) {
  const snap = order && order.feeSnapshot;
  if (snap && snap.basePrice != null && parseFloat(snap.basePrice) > 0) {
    return parseFloat(snap.basePrice);
  }
  if (order.basePrice != null && parseFloat(order.basePrice) > 0) {
    return parseFloat(order.basePrice);
  }

  const fromRules = util.getPriceByMode(rules || {}, order.petWeight, order.roomType);
  if (fromRules > 0) return fromRules;

  const fees = normalizeOrderFees(order);
  const days = parseFloat(order.days);
  if (days > 0 && fees.boardingFee > 0) {
    return Math.round((fees.boardingFee / days) * 100) / 100;
  }
  return 0;
}

function buildOrderFeeDetail(order, rules, options = {}) {
  const store = (options && options.store) || null;
  const fees = normalizeOrderFees(order);
  const deposit = resolveOrderDeposit(order, store);
  const needPickup = !!(order && order.needPickup);

  if (hasStoredFeeSnapshot(order)) {
    const snap = order.feeSnapshot;
    return {
      ready: true,
      needPickup,
      boardingFee: fees.boardingFee,
      boardingFeeText: formatMoney(fees.boardingFee),
      shippingFee: fees.shippingFee,
      shippingFeeText: formatMoney(fees.shippingFee),
      totalFee: fees.totalFee,
      totalFeeText: formatMoney(fees.totalFee),
      basePrice: snap.basePrice,
      basePriceText: formatMoney(snap.basePrice || 0),
      dailyBreakdown: snap.dailyBreakdown,
      chargeSummary: snap.chargeSummary || '',
      daysText: snap.daysText || String((order && order.days) || '0'),
      deposit,
      depositText: formatMoney(deposit),
      showDeposit: deposit > 0,
      priceAdjusted: false
    };
  }

  const basePrice = resolveBasePrice(order, rules);
  const breakdown = calcStayFeeBreakdown(
    order.startDate,
    order.endDate,
    order.startTime,
    order.endTime,
    rules,
    basePrice
  );

  const priceAdjusted = breakdown.ready
    && Math.abs(breakdown.baseFee - fees.boardingFee) > 0.01;

  return {
    ready: breakdown.ready,
    needPickup,
    boardingFee: fees.boardingFee,
    boardingFeeText: formatMoney(fees.boardingFee),
    shippingFee: fees.shippingFee,
    shippingFeeText: formatMoney(fees.shippingFee),
    totalFee: fees.totalFee,
    totalFeeText: formatMoney(fees.totalFee),
    basePrice,
    basePriceText: formatMoney(basePrice),
    dailyBreakdown: breakdown.dailyBreakdown,
    chargeSummary: breakdown.chargeSummary,
    daysText: breakdown.daysText || String((order && order.days) || '0'),
    deposit,
    depositText: formatMoney(deposit),
    showDeposit: deposit > 0,
    priceAdjusted
  };
}

function loadOrderFeeDetail(app, order) {
  if (!order) return Promise.resolve(null);

  const build = () => buildOrderFeeDetail(
    order,
    app.getStoreBillingRules(),
    { store: app.getCurrentStore() }
  );

  if (hasStoredFeeSnapshot(order)) {
    return Promise.resolve(build());
  }

  const storeId = order.store_id;
  if (!storeId || typeof app.bindStore !== 'function') {
    return Promise.resolve(build());
  }

  return app.bindStore(storeId, { syncUser: false, force: false })
    .then(() => build())
    .catch((err) => {
      console.warn('[orderFeeDetail] bindStore failed', err);
      return build();
    });
}

module.exports = {
  buildOrderFeeDetail,
  loadOrderFeeDetail,
  resolveOrderDeposit
};
