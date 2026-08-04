const { calcStayFeeBreakdown, formatMoney } = require('./billing');
const { findWeightPrice } = require('./weightPricing');
const { findRoomPrice } = require('./roomPricing');
const {
  normalizeLongTermDiscount,
  applyLongTermDiscount,
  buildLongTermDiscountTip
} = require('./longTermDiscount');

function getDefaultMultiPetDiscount() {
  return {
    enabled: false,
    mode: 'fromSecondPercent',
    percent: 0,
    applyTo: 'boarding'
  };
}

function normalizeMultiPetDiscount(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const enabled = src.enabled === true;
  let percent = parseFloat(src.percent);
  if (!Number.isFinite(percent) || percent < 0) percent = 0;
  if (percent > 100) percent = 100;
  percent = Math.round(percent);
  return {
    enabled,
    mode: 'fromSecondPercent',
    percent: enabled ? percent : 0,
    applyTo: 'boarding'
  };
}

function getPetBasePrice(rules, petWeight, roomType) {
  if ((rules || {}).billingMode === 'room') {
    return findRoomPrice((rules || {}).roomPricing, roomType);
  }
  return findWeightPrice((rules || {}).weightPricing, petWeight);
}

function resolvePetRoomType(pet, roomType, petRoomTypes) {
  const petId = pet && pet.id;
  if (petId != null && petRoomTypes && typeof petRoomTypes === 'object') {
    const mapped = petRoomTypes[petId];
    if (mapped) return mapped;
  }
  return roomType || '';
}

function roundMoney(amount) {
  return Math.round((parseFloat(amount) || 0) * 100) / 100;
}

/**
 * 多宠寄养费：按原价从高到低，首只全价，第 2 只起按折扣。
 * 兼容缺省 / enabled:false → 全部全价。
 * room 模式可用 petRoomTypes（按宠选房），也兼容统一 roomType。
 */
function calcMultiPetBoardingFees({
  pets,
  rules,
  startDate,
  endDate,
  startTime,
  endTime,
  roomType,
  petRoomTypes,
  extrasFeePerDay = 0
}) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  const discount = normalizeMultiPetDiscount(rules && rules.multiPetDiscount);
  const longTermDiscount = normalizeLongTermDiscount(rules && rules.longTermDiscount);
  const draft = list.map((pet, sourceIndex) => {
    const petRoomType = resolvePetRoomType(pet, roomType, petRoomTypes);
    const basePrice = getPetBasePrice(rules, pet.weight, petRoomType);
    const breakdown = calcStayFeeBreakdown(
      startDate, endDate, startTime, endTime, rules, basePrice
    );
    const extrasFee = roundMoney((parseFloat(extrasFeePerDay) || 0) * (breakdown.days || 0));
    const originalBoardingFee = roundMoney((breakdown.baseFee || 0) + extrasFee);
    return {
      pet,
      sourceIndex,
      roomType: petRoomType,
      basePrice,
      breakdown,
      extrasFee,
      originalBoardingFee
    };
  });

  const ranked = draft
    .map((item, idx) => ({ ...item, _idx: idx }))
    .sort((a, b) => {
      if (b.originalBoardingFee !== a.originalBoardingFee) {
        return b.originalBoardingFee - a.originalBoardingFee;
      }
      return a.sourceIndex - b.sourceIndex;
    });

  const stayDays = (draft[0] && draft[0].breakdown && draft[0].breakdown.days) || 0;

  const items = ranked.map((item, rankIndex) => {
    const multiFactor = (!discount.enabled || rankIndex === 0)
      ? 1
      : Math.max(0, 1 - (discount.percent / 100));
    const afterMultiPet = roundMoney(item.originalBoardingFee * multiFactor);
    const multiPetDiscountAmount = roundMoney(item.originalBoardingFee - afterMultiPet);
    const longTerm = applyLongTermDiscount(afterMultiPet, longTermDiscount, stayDays);
    const boardingFee = longTerm.boardingFee;
    const discountAmount = roundMoney(item.originalBoardingFee - boardingFee);
    return {
      pet: item.pet,
      sourceIndex: item.sourceIndex,
      roomType: item.roomType,
      basePrice: item.basePrice,
      breakdown: item.breakdown,
      extrasFee: item.extrasFee,
      originalBoardingFee: item.originalBoardingFee,
      boardingFee,
      discountAmount,
      multiPetDiscountAmount,
      longTermDiscountAmount: longTerm.discountAmount,
      discountFactor: multiFactor * longTerm.factor,
      multiPetFactor: multiFactor,
      longTermFactor: longTerm.factor,
      rankIndex,
      isPrimary: rankIndex === 0
    };
  });

  const originalBoardingTotal = roundMoney(
    items.reduce((sum, item) => sum + item.originalBoardingFee, 0)
  );
  const boardingTotal = roundMoney(
    items.reduce((sum, item) => sum + item.boardingFee, 0)
  );
  const discountTotal = roundMoney(originalBoardingTotal - boardingTotal);
  const multiPetDiscountTotal = roundMoney(
    items.reduce((sum, item) => sum + (item.multiPetDiscountAmount || 0), 0)
  );
  const longTermDiscountTotal = roundMoney(
    items.reduce((sum, item) => sum + (item.longTermDiscountAmount || 0), 0)
  );
  const hasMultiPetDiscount = discount.enabled && multiPetDiscountTotal > 0;
  const hasLongTermDiscount = longTermDiscount.enabled && longTermDiscountTotal > 0;
  const tipParts = [];
  if (hasMultiPetDiscount && discount.percent > 0) {
    tipParts.push(`多宠优惠：第 2 只起寄养费减 ${formatMoney(discount.percent)}%`);
  }
  if (hasLongTermDiscount) {
    tipParts.push(buildLongTermDiscountTip(longTermDiscount, stayDays));
  }

  return {
    discount,
    longTermDiscount,
    items,
    petCount: items.length,
    originalBoardingTotal,
    boardingTotal,
    discountTotal,
    multiPetDiscountTotal,
    longTermDiscountTotal,
    discountTotalText: formatMoney(discountTotal),
    boardingTotalText: formatMoney(boardingTotal),
    originalBoardingTotalText: formatMoney(originalBoardingTotal),
    hasDiscount: discountTotal > 0,
    hasMultiPetDiscount,
    hasLongTermDiscount,
    discountTip: tipParts.join('；'),
    stayDays
  };
}

function validateMultiPetDiscount(raw) {
  if (!raw || raw.enabled !== true) return '';
  const rawPercent = raw.percent;
  // 开启但未填：非必填，保存时视为未启用
  if (rawPercent === '' || rawPercent == null) return '';
  if (typeof rawPercent === 'string' && !/^\d+$/.test(String(rawPercent).trim())) {
    return '多宠折扣比例须为整数';
  }
  const percent = Number(rawPercent);
  if (!Number.isInteger(percent)) return '多宠折扣比例须为整数';
  if (percent < 0 || percent > 100) return '多宠折扣需在 0–100 之间';
  return '';
}

module.exports = {
  getDefaultMultiPetDiscount,
  normalizeMultiPetDiscount,
  getPetBasePrice,
  resolvePetRoomType,
  calcMultiPetBoardingFees,
  validateMultiPetDiscount
};
