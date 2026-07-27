function parseFee(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = parseFloat(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : fallback;
}

function normalizeOrderFees(order) {
  const source = order || {};
  const needPickup = !!source.needPickup;
  const totalFee = parseFee(source.totalFee, 0);
  let boardingFee = parseFee(source.boardingFee, NaN);
  let shippingFee = parseFee(source.shippingFee, 0);

  if (!Number.isFinite(boardingFee)) {
    boardingFee = needPickup ? Math.max(0, totalFee - shippingFee) : totalFee;
  }

  if (!needPickup) {
    shippingFee = 0;
  }

  const normalizedTotal = parseFee(boardingFee + shippingFee, totalFee);

  return {
    boardingFee,
    shippingFee,
    totalFee: normalizedTotal
  };
}

function buildFeePayload(boardingFee, shippingFee, needPickup) {
  const boarding = parseFee(boardingFee, 0);
  const shipping = needPickup ? parseFee(shippingFee, 0) : 0;
  return {
    boardingFee: boarding,
    shippingFee: shipping,
    totalFee: parseFee(boarding + shipping, 0)
  };
}

module.exports = {
  parseFee,
  normalizeOrderFees,
  buildFeePayload
};
