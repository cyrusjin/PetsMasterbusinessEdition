const { calcStayFeeBreakdown, formatMoney } = require('./billing');
const { findWeightPrice } = require('./weightPricing');
const { findRoomPrice } = require('./roomPricing');
const { findCustomPrice } = require('./customPricing');
const {
  normalizeLongTermDiscount,
  applyLongTermDiscount,
  buildLongTermDiscountTip,
  parseZhe,
  formatZhe
} = require('./longTermDiscount');

function getDefaultMultiPetDiscount() {
  return {
    enabled: false,
    mode: 'fromSecondPercent',
    zhe: 0,
    percent: 0,
    amount: 0,
    applyTo: 'boarding'
  };
}

function zheToPercentOff(zhe) {
  return Math.round((10 - zhe) * 10 * 100) / 100;
}

/** 优先读 zhe（折）；旧数据 percent 表示减免百分比，如 10 表示减 10% = 9 折。 */
function resolveMultiPetZhe(src) {
  const srcObj = src && typeof src === 'object' ? src : {};
  const fromZhe = parseZhe(srcObj.zhe);
  if (fromZhe != null) return fromZhe;
  const percent = parseFloat(srcObj.percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return null;
  return parseZhe((100 - percent) / 10);
}

function normalizeMultiPetDiscount(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const enabled = src.enabled === true;
  const mode = src.mode === 'fromSecondFixedPerDay'
    ? 'fromSecondFixedPerDay'
    : 'fromSecondPercent';
  const zhe = resolveMultiPetZhe(src);
  const percent = zhe != null ? zheToPercentOff(zhe) : 0;
  let amount = parseFloat(src.amount);
  if (!Number.isFinite(amount) || amount < 0) amount = 0;
  amount = roundMoney(amount);
  return {
    enabled,
    mode,
    zhe: enabled && mode === 'fromSecondPercent' && zhe != null ? zhe : 0,
    percent: enabled && mode === 'fromSecondPercent' ? percent : 0,
    amount: enabled && mode === 'fromSecondFixedPerDay' ? amount : 0,
    applyTo: 'boarding'
  };
}

function getPetBasePrice(rules, petWeight, roomType) {
  const mode = (rules || {}).billingMode;
  if (mode === 'room') {
    return findRoomPrice((rules || {}).roomPricing, roomType);
  }
  if (mode === 'custom') {
    return findCustomPrice((rules || {}).customPricing, roomType);
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
 * 多宠寄养费：按原价从高到低，首只全价，第 2 只起按折扣或固定日价。
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
    const appliesMultiPetRule = discount.enabled && rankIndex > 0;
    const usesFixedPrice = appliesMultiPetRule && discount.mode === 'fromSecondFixedPerDay';
    const multiFactor = (!appliesMultiPetRule || usesFixedPrice)
      ? 1
      : (discount.zhe
        ? Math.max(0, Math.min(1, discount.zhe / 10))
        : Math.max(0, 1 - (discount.percent / 100)));
    const fixedBreakdown = usesFixedPrice
      ? calcStayFeeBreakdown(
        startDate, endDate, startTime, endTime, rules, discount.amount
      )
      : null;
    const appliedBreakdown = fixedBreakdown || item.breakdown;
    const appliedBasePrice = usesFixedPrice ? discount.amount : item.basePrice;
    const fixedExtrasFee = usesFixedPrice
      ? roundMoney((parseFloat(extrasFeePerDay) || 0) * (appliedBreakdown.days || 0))
      : item.extrasFee;
    const afterMultiPet = usesFixedPrice
      ? roundMoney((appliedBreakdown.baseFee || 0) + fixedExtrasFee)
      : roundMoney(item.originalBoardingFee * multiFactor);
    const multiPetDiscountAmount = Math.max(
      0,
      roundMoney(item.originalBoardingFee - afterMultiPet)
    );
    const longTerm = applyLongTermDiscount(afterMultiPet, longTermDiscount, stayDays);
    const boardingFee = longTerm.boardingFee;
    const discountAmount = Math.max(0, roundMoney(item.originalBoardingFee - boardingFee));
    return {
      pet: item.pet,
      sourceIndex: item.sourceIndex,
      roomType: item.roomType,
      basePrice: appliedBasePrice,
      originalBasePrice: item.basePrice,
      breakdown: appliedBreakdown,
      extrasFee: fixedExtrasFee,
      originalBoardingFee: item.originalBoardingFee,
      boardingFee,
      discountAmount,
      multiPetDiscountAmount,
      longTermDiscountAmount: longTerm.discountAmount,
      discountFactor: multiFactor * longTerm.factor,
      multiPetFactor: multiFactor,
      multiPetMode: appliesMultiPetRule ? discount.mode : '',
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
  const hasMultiPetDiscount = discount.enabled && items.length > 1;
  const hasLongTermDiscount = longTermDiscount.enabled && longTermDiscountTotal > 0;
  const tipParts = [];
  if (hasMultiPetDiscount && discount.mode === 'fromSecondFixedPerDay') {
    tipParts.push(`多宠优惠：第 2 只起按 ¥${formatMoney(discount.amount)}/天计费`);
  } else if (hasMultiPetDiscount && (discount.zhe > 0 || discount.percent > 0)) {
    const zheText = formatZhe(discount.zhe) || formatZhe(resolveMultiPetZhe(discount));
    tipParts.push(zheText
      ? `多宠优惠：第 2 只起寄养费 ${zheText} 折`
      : `多宠优惠：第 2 只起寄养费减 ${formatMoney(discount.percent)}%`);
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
  if (raw.mode === 'fromSecondFixedPerDay') {
    const rawAmount = raw.amount;
    if (rawAmount === '' || rawAmount == null) return '';
    const text = String(rawAmount).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return '第二只加价金额最多保留两位小数';
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0) return '第二只加价金额不能小于 0';
    return '';
  }
  const hasZhe = raw.zhe != null && raw.zhe !== '' && Number(raw.zhe) !== 0;
  const rawPercent = raw.percent;
  const hasPercent = rawPercent != null && rawPercent !== '' && Number(rawPercent) !== 0;
  // 开启但未填：非必填，保存时视为未启用
  if (!hasZhe && !hasPercent) return '';
  if (hasZhe) {
    if (typeof raw.zhe === 'string' && !/^\d+(\.\d)?$/.test(String(raw.zhe).trim())) {
      return '多宠折扣最多 1 位小数，例如 8.5 表示 8.5 折';
    }
    const zhe = parseZhe(raw.zhe);
    if (zhe == null) return '多宠折扣需在 0.1–9.9 折之间，例如 8.5 表示 8.5 折';
    return '';
  }
  if (typeof rawPercent === 'string' && !/^\d+(\.\d)?$/.test(String(rawPercent).trim())) {
    return '多宠折扣最多 1 位小数，例如 8.5 表示 8.5 折';
  }
  const zheFromPercent = parseZhe((100 - Number(rawPercent)) / 10);
  if (zheFromPercent == null) return '多宠折扣需在 0.1–9.9 折之间，例如 8.5 表示 8.5 折';
  return '';
}

module.exports = {
  getDefaultMultiPetDiscount,
  normalizeMultiPetDiscount,
  resolveMultiPetZhe,
  getPetBasePrice,
  resolvePetRoomType,
  calcMultiPetBoardingFees,
  validateMultiPetDiscount
};
