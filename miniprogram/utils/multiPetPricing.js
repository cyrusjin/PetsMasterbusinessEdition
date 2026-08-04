const { calcStayFeeBreakdown, formatMoney } = require('./billing');
const { findWeightPrice } = require('./weightPricing');
const { findRoomPrice } = require('./roomPricing');

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
  percent = Math.round(percent * 100) / 100;
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

  const items = ranked.map((item, rankIndex) => {
    const factor = (!discount.enabled || rankIndex === 0)
      ? 1
      : Math.max(0, 1 - (discount.percent / 100));
    const boardingFee = roundMoney(item.originalBoardingFee * factor);
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
      discountFactor: factor,
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

  return {
    discount,
    items,
    petCount: items.length,
    originalBoardingTotal,
    boardingTotal,
    discountTotal,
    discountTotalText: formatMoney(discountTotal),
    boardingTotalText: formatMoney(boardingTotal),
    originalBoardingTotalText: formatMoney(originalBoardingTotal),
    hasDiscount: discount.enabled && discountTotal > 0,
    discountTip: discount.enabled && discount.percent > 0
      ? `已开启多宠优惠：第 2 只起寄养费减 ${formatMoney(discount.percent)}%`
      : ''
  };
}

function validateMultiPetDiscount(raw) {
  if (!raw || raw.enabled !== true) return '';
  const percent = parseFloat(raw.percent);
  if (!Number.isFinite(percent)) return '请填写多宠折扣比例';
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
