function parseFee(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : fallback;
}

function hasValueAddedServices(order) {
  const list = order && order.valueAddedServices;
  if (Array.isArray(list) && list.length > 0) return true;
  const snap = order && order.feeSnapshot && order.feeSnapshot.valueAdded;
  return !!(snap && Array.isArray(snap.items) && snap.items.length);
}

function normalizeOrderFees(order) {
  const source = order || {};
  const needPickup = !!source.needPickup;
  const needWash = !!source.needWash;
  const hasValueAdded = hasValueAddedServices(source);
  const totalFee = parseFee(source.totalFee, 0);
  let boardingFee = parseFee(source.boardingFee, NaN);
  let shippingFee = parseFee(source.shippingFee, 0);
  let washFee = parseFee(source.washFee, 0);
  let visitFee = parseFee(source.visitFee, NaN);
  if (!Number.isFinite(visitFee)) {
    visitFee = parseFee(
      source.feeSnapshot && source.feeSnapshot.visit && source.feeSnapshot.visit.fee,
      0
    );
  }
  let valueAddedFee = parseFee(source.valueAddedFee, 0);

  if (!needPickup) {
    shippingFee = 0;
  }
  if (!needWash) {
    washFee = 0;
  }
  if (!hasValueAdded) {
    valueAddedFee = 0;
  } else if (!(valueAddedFee > 0) && source.feeSnapshot && source.feeSnapshot.valueAdded) {
    valueAddedFee = parseFee(source.feeSnapshot.valueAdded.fee, 0);
  }

  if (!Number.isFinite(boardingFee)) {
    boardingFee = Math.max(0, totalFee - shippingFee - washFee - visitFee - valueAddedFee);
  }

  const normalizedTotal = parseFee(boardingFee + shippingFee + washFee + visitFee + valueAddedFee, totalFee);

  return {
    boardingFee,
    shippingFee,
    washFee,
    visitFee,
    valueAddedFee,
    needWash,
    hasValueAdded: hasValueAdded || valueAddedFee > 0,
    totalFee: normalizedTotal
  };
}

function buildFeePayload(boardingFee, shippingFee, needPickup, washFee, needWash, valueAddedFee, hasValueAdded, visitFee) {
  const boarding = parseFee(boardingFee, 0);
  const shipping = needPickup ? parseFee(shippingFee, 0) : 0;
  const wash = needWash ? parseFee(washFee, 0) : 0;
  const valueAdded = hasValueAdded ? parseFee(valueAddedFee, 0) : 0;
  const visit = parseFee(visitFee, 0);
  return {
    boardingFee: boarding,
    shippingFee: shipping,
    washFee: wash,
    visitFee: visit,
    valueAddedFee: valueAdded,
    totalFee: parseFee(boarding + shipping + wash + visit + valueAdded, 0)
  };
}

module.exports = {
  parseFee,
  normalizeOrderFees,
  buildFeePayload,
  hasValueAddedServices
};
