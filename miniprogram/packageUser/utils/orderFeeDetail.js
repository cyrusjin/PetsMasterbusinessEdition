const util = require('../../utils/util');
const { calcStayFeeBreakdown, formatMoney } = require('../../utils/billing');
const { normalizeOrderFees } = require('../../utils/orderFees');

function parseDeposit(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : 0;
}

function hasStoredFeeSnapshot(order) {
  const snap = order && order.feeSnapshot;
  if (!snap) return false;
  if (Array.isArray(snap.dailyBreakdown) && snap.dailyBreakdown.length) return true;
  if (snap.visit || snap.wash) return true;
  return false;
}

function isWashLineOrder(order) {
  const line = String((order && (order.serviceLine || order.serviceKind)) || '').trim();
  if (line === 'wash') return true;
  const snapLine = order && order.feeSnapshot && order.feeSnapshot.serviceLine;
  return snapLine === 'wash';
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

function buildVisitItemLabel(item) {
  const name = String((item && item.name) || '').trim();
  const services = Array.isArray(item && item.serviceNames)
    ? item.serviceNames.filter(Boolean).join(' + ')
    : String((item && (item.serviceName || item.roomName)) || '').trim();
  if (name && services) return `${name} · ${services}`;
  return name || services || '上门服务';
}

function buildVisitFeeItems(order, visitSnap, fees) {
  const raw = (visitSnap && Array.isArray(visitSnap.items)) ? visitSnap.items : [];
  if (raw.length) {
    return raw.map((item, index) => ({
      id: item.petId || item.id || String(index),
      name: buildVisitItemLabel(item),
      feeText: formatMoney(item.fee)
    }));
  }
  const pkg = (visitSnap && visitSnap.packageName) || (order && order.roomName) || '';
  if (!pkg) return [];
  return [{
    id: 'pkg',
    name: pkg,
    feeText: formatMoney((fees && fees.visitFee) || (visitSnap && visitSnap.fee) || 0)
  }];
}

function buildVisitFeeFields(order, fees) {
  const isHomeVisit = (order && (order.serviceLine || order.serviceKind)) === 'homeFeeding'
    || !!(order && order.feeSnapshot && order.feeSnapshot.visit);
  const visitSnap = (order && order.feeSnapshot && order.feeSnapshot.visit) || {};
  const visitItems = isHomeVisit ? buildVisitFeeItems(order, visitSnap, fees) : [];
  return {
    isHomeVisit,
    visitFee: fees.visitFee || 0,
    visitFeeText: formatMoney(fees.visitFee || 0),
    visitCalcText: visitItems.length ? '' : (visitSnap.text || ''),
    visitPackageName: visitItems.length ? '' : (visitSnap.packageName || (order && order.roomName) || ''),
    visitItems,
    hasVisitItems: visitItems.length > 0,
    visitDistanceText: visitSnap.surchargeEnabled && visitSnap.distanceKm != null
      ? `约 ${visitSnap.distanceKm} 公里`
      : '',
    unitLabel: isHomeVisit ? '次' : '天'
  };
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

function buildWashDetailFields(order, fees) {
  const washSnap = (order && order.feeSnapshot && order.feeSnapshot.wash) || null;
  const washValueAddedItems = ((washSnap && washSnap.valueAdded && washSnap.valueAdded.items) || []).map((item) => ({
    id: item.id || item.name,
    name: item.name || item.title || '洗护增值服务',
    priceText: formatMoney(item.price)
  }));
  const washVasIds = {};
  washValueAddedItems.forEach((item) => {
    if (item.id) washVasIds[String(item.id)] = true;
  });
  const washItems = ((washSnap && washSnap.items) || []).map((item) => ({
    id: item.petId || item.productId || item.name,
    name: `${item.name || '宠物'}${item.title ? ` · ${item.title}` : ''}`,
    feeText: formatMoney(item.fee)
  }));
  const snapProductFee = washSnap && washSnap.fee != null ? parseFloat(washSnap.fee) : NaN;
  const productFee = Number.isFinite(snapProductFee) ? snapProductFee : fees.washFee;
  const washFeeText = !!(order && order.needWash) && productFee === 0 && washSnap && washSnap.freeByStay
    ? '0（满天免费）'
    : formatMoney(productFee);
  return {
    washSnap,
    washItems,
    washValueAddedItems,
    hasWashValueAdded: washValueAddedItems.length > 0,
    washVasIds,
    washFeeText,
    washCalcText: (washSnap && washSnap.text) || ''
  };
}

function buildOrderFeeDetail(order, rules, options = {}) {
  const store = (options && options.store) || null;
  const fees = normalizeOrderFees(order);
  const deposit = resolveOrderDeposit(order, store);
  const needPickup = !!(order && order.needPickup);
  const needWash = !!(order && order.needWash);
  const washFields = buildWashDetailFields(order, fees);
  const valueAddedItems = Array.isArray(order && order.valueAddedServices)
    ? order.valueAddedServices
    : ((order && order.feeSnapshot && order.feeSnapshot.valueAdded && order.feeSnapshot.valueAdded.items) || []);
  const valueAddedItemsView = valueAddedItems
    .filter((item) => !washFields.washVasIds[String(item.id || item.name || '')])
    .map((item) => ({
      id: item.id || item.name,
      name: item.name || '增值服务',
      priceText: formatMoney(item.price)
    }));
  const hasValueAdded = valueAddedItemsView.length > 0;
  const visitFields = buildVisitFeeFields(order, fees);

  if (hasStoredFeeSnapshot(order) || visitFields.isHomeVisit) {
    const snap = order.feeSnapshot || {};
    const visitSnap = snap.visit || {};
    const unitPrice = visitFields.isHomeVisit
      ? (visitSnap.unitPrice != null ? visitSnap.unitPrice : (snap.basePrice != null ? snap.basePrice : order.basePrice))
      : snap.basePrice;
    return {
      ready: true,
      needPickup,
      needWash,
      hasValueAdded,
      boardingFee: fees.boardingFee,
      boardingFeeText: formatMoney(fees.boardingFee),
      shippingFee: fees.shippingFee,
      shippingFeeText: formatMoney(fees.shippingFee),
      washFee: fees.washFee,
      washFeeText: washFields.washFeeText,
      washCalcText: washFields.washCalcText,
      washItems: washFields.washItems,
      washValueAddedItems: washFields.washValueAddedItems,
      hasWashValueAdded: washFields.hasWashValueAdded,
      valueAddedFee: fees.valueAddedFee,
      valueAddedFeeText: formatMoney(fees.valueAddedFee),
      valueAddedItems: valueAddedItemsView,
      totalFee: fees.totalFee,
      totalFeeText: formatMoney(fees.totalFee),
      basePrice: unitPrice,
      basePriceText: formatMoney(unitPrice || 0),
      dailyBreakdown: snap.dailyBreakdown || [],
      chargeSummary: snap.chargeSummary || visitSnap.text || '',
      daysText: visitFields.isHomeVisit ? '1' : (snap.daysText || String((order && order.days) || '0')),
      deposit,
      depositText: formatMoney(deposit),
      showDeposit: deposit > 0,
      priceAdjusted: false,
      isWashLine: !visitFields.isHomeVisit && isWashLineOrder(order),
      ...visitFields
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
    needWash,
    hasValueAdded,
    boardingFee: fees.boardingFee,
    boardingFeeText: formatMoney(fees.boardingFee),
    shippingFee: fees.shippingFee,
    shippingFeeText: formatMoney(fees.shippingFee),
    washFee: fees.washFee,
    washFeeText: washFields.washFeeText,
    washCalcText: washFields.washCalcText,
    washItems: washFields.washItems,
    washValueAddedItems: washFields.washValueAddedItems,
    hasWashValueAdded: washFields.hasWashValueAdded,
    valueAddedFee: fees.valueAddedFee,
    valueAddedFeeText: formatMoney(fees.valueAddedFee),
    valueAddedItems: valueAddedItemsView,
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
    priceAdjusted,
    isWashLine: !visitFields.isHomeVisit && isWashLineOrder(order),
    ...visitFields
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
