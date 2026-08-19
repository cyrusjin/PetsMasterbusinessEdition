/**
 * 用户端上门喂养报价：统一服务项平日价 + 可选距离加价；
 * 再叠加当日节日加价与多宠优惠。
 */

const { normalizeHomeFeeding } = require('../../utils/homeFeeding');
const {
  calcVisitServiceFee,
  isHomeVisitPricingComplete,
  isSurchargeEnabled
} = require('../../utils/homeVisitPricing');
const { listVisitServices, itemMatchesPet, describeVisitCoverGap, normalizeVisitServiceIds } = require('../../utils/homeVisitServices');
const { normalizeMultiPetDiscount } = require('../../utils/multiPetPricing');
const { getHolidaySurchargeAmount } = require('../../utils/legalHolidays');
const { formatZhe } = require('../../utils/longTermDiscount');
const { formatMoney } = require('../../utils/billing');
const { normalizePetTypeForReception } = require('../../utils/receptionRange');

function roundMoney(amount) {
  return Math.round((parseFloat(amount) || 0) * 100) / 100;
}

function getVisitPetKind(pet) {
  const raw = String((pet && (pet.type || pet.petType)) || '').trim();
  const type = normalizePetTypeForReception(raw);
  if (type === '猫咪' || type === '猫' || /猫/.test(raw)) return 'cat';
  if ((type && type.indexOf('犬') >= 0) || type === '狗' || type === '犬' || /狗|犬/.test(raw)) {
    return 'dog';
  }
  if (type === '其他') return 'other';
  return '';
}

function classifyVisitPets(pets) {
  const cat = [];
  const dog = [];
  const other = [];
  (Array.isArray(pets) ? pets : []).filter(Boolean).forEach((pet) => {
    const kind = getVisitPetKind(pet);
    if (kind === 'cat') cat.push(pet);
    else if (kind === 'dog') dog.push(pet);
    else other.push(pet);
  });
  let kind = '';
  if (cat.length && dog.length) kind = 'mixed';
  else if (other.length && !cat.length && !dog.length) kind = 'other';
  else if (cat.length && other.length) kind = 'mixed';
  else if (dog.length && other.length) kind = 'mixed';
  else if (cat.length) kind = 'cat';
  else if (dog.length) kind = 'dog';
  else if (other.length) kind = 'other';
  return { kind, cat, dog, other };
}

function listDogPackages(homeFeeding, pets) {
  return listVisitServices(homeFeeding, pets);
}

function listCatPackages(homeFeeding, pets) {
  return listVisitServices(homeFeeding, pets);
}

function applyVisitMultiPetByUnits(units, discount) {
  const list = (Array.isArray(units) ? units : []).map((unit) => roundMoney(unit));
  const n = list.length;
  const d = normalizeMultiPetDiscount(discount);
  if (n <= 0) {
    return {
      fee: 0,
      perPetFees: [],
      discountTotal: 0,
      surchargeTotal: 0,
      discountTip: ''
    };
  }
  if (!d.enabled || n === 1) {
    return {
      fee: roundMoney(list.reduce((sum, unit) => sum + unit, 0)),
      perPetFees: list.slice(),
      discountTotal: 0,
      surchargeTotal: 0,
      discountTip: ''
    };
  }

  let discountTip = '';
  let surchargeTotal = 0;
  let discountTotal = 0;
  const perPetFees = list.map((unit, index) => {
    if (index === 0) return unit;
    if (d.mode === 'fromSecondFixedPerDay') {
      surchargeTotal = roundMoney(surchargeTotal + d.amount);
      return roundMoney(unit + d.amount);
    }
    const zhe = d.zhe > 0 ? d.zhe : 10;
    const rest = roundMoney(unit * zhe / 10);
    discountTotal = roundMoney(discountTotal + (unit - rest));
    return rest;
  });
  if (d.mode === 'fromSecondFixedPerDay') {
    discountTip = `第 2 只起每只每次加收 ¥${formatMoney(d.amount)}`;
  } else {
    const zhe = d.zhe > 0 ? d.zhe : 10;
    discountTip = `第 2 只起 ${formatZhe(zhe)} 折`;
  }
  return {
    fee: roundMoney(perPetFees.reduce((sum, item) => sum + item, 0)),
    perPetFees,
    discountTotal,
    surchargeTotal,
    discountTip
  };
}

function applyVisitMultiPet(unitPrice, petCount, discount) {
  const n = petCount > 0 ? petCount : 0;
  const unit = roundMoney(unitPrice);
  return applyVisitMultiPetByUnits(Array.from({ length: n }, () => unit), discount);
}

function emptyQuote(error) {
  return {
    ready: false,
    error: error || '',
    fee: 0,
    unitPrice: 0,
    holidayExtra: 0,
    holidayFee: 0,
    petKind: '',
    petCount: 0,
    packageName: '',
    description: '',
    distanceKm: null,
    distanceExtra: 0,
    surchargeEnabled: false,
    text: '',
    discountTip: '',
    discountTotal: 0,
    surchargeTotal: 0,
    coverTip: '',
    items: []
  };
}

function calcHomeVisitQuote({
  homeFeeding,
  pets,
  visitDate,
  distanceKm,
  serviceItemId,
  serviceItemIds,
  dogPackageId,
  dogPackageIds,
  catPackageId
}) {
  const list = Array.isArray(pets) ? pets.filter(Boolean) : [];
  if (!list.length) return emptyQuote('请选择宠物');

  const hf = normalizeHomeFeeding(homeFeeding);
  if (!isHomeVisitPricingComplete(hf)) {
    return emptyQuote('商家尚未完善上门服务价格');
  }

  const services = listVisitServices(hf, list);
  if (!services.length) {
    return emptyQuote('所选宠物没有可预约的上门服务，请分开预约或调整宠物');
  }

  const selectedIds = normalizeVisitServiceIds(
    serviceItemIds && serviceItemIds.length
      ? serviceItemIds
      : (serviceItemId || catPackageId || dogPackageId || dogPackageIds)
  );
  const selected = selectedIds
    .map((id) => services.find((item) => String(item.id || '') === String(id || '')))
    .filter(Boolean);
  if (!selected.length) return emptyQuote('请选择上门服务项目');
  const applicable = list.filter((pet) => selected.some((item) => itemMatchesPet(item, pet)));
  if (!applicable.length) return emptyQuote('该服务不适用于已选宠物');
  const coverTip = describeVisitCoverGap(selected, list);

  const grouped = classifyVisitPets(list);
  const needDistance = selected.some((item) => isSurchargeEnabled(item));
  const km = parseFloat(distanceKm);
  if (needDistance && (!Number.isFinite(km) || km < 0)) {
    return {
      ...emptyQuote('请选择小区地址以计算距离和费用'),
      petKind: grouped.kind,
      petCount: applicable.length,
      pendingDistance: true,
      coverTip,
      packageName: selected.map((item) => item.name).filter(Boolean).join(' + '),
      packageId: selected[0].id || '',
      packageIds: selected.map((item) => item.id)
    };
  }

  const resolvedKm = Number.isFinite(km) ? km : 0;
  const serviceFees = selected.map((item) => {
    const unitPrice = calcVisitServiceFee(hf, item.id, resolvedKm);
    if (unitPrice == null) return null;
    const extra = isSurchargeEnabled(item)
      ? roundMoney(Math.max(0, unitPrice - (item.basePrice || 0)))
      : 0;
    return {
      item,
      unitPrice: roundMoney(unitPrice),
      extra
    };
  });
  if (serviceFees.some((row) => !row)) return emptyQuote('无法计算上门服务费用');
  const distanceExtra = roundMoney(serviceFees.reduce((sum, row) => sum + row.extra, 0));
  const petUnits = applicable.map((pet) => {
    const matched = serviceFees.filter((row) => itemMatchesPet(row.item, pet));
    return {
      pet,
      unit: roundMoney(matched.reduce((sum, row) => sum + row.unitPrice, 0)),
      serviceNames: matched.map((row) => row.item.name).filter(Boolean)
    };
  });
  const holidayExtra = visitDate
    ? getHolidaySurchargeAmount(hf.holidayPricing || {}, visitDate)
    : 0;
  const multi = applyVisitMultiPetByUnits(petUnits.map((row) => row.unit), hf.multiPetDiscount);
  const holidayFee = roundMoney(holidayExtra);
  const fee = roundMoney(multi.fee + holidayFee);
  const textParts = serviceFees.map((row) => (
    `${row.item.name || '上门服务'} ¥${formatMoney(row.item.basePrice || row.unitPrice)}/次`
  ));
  if (distanceExtra > 0) textParts.push(`距离加价 ¥${formatMoney(distanceExtra)}`);
  if (applicable.length > 1) textParts.push(`共 ${applicable.length} 只`);
  if (holidayFee > 0) textParts.push(`节日加价 ¥${formatMoney(holidayFee)}`);

  const items = petUnits.map((row, index) => ({
    pet: row.pet,
    petId: row.pet.id,
    name: row.pet.name || '宠物',
    fee: multi.perPetFees[index] || 0,
    serviceNames: row.serviceNames,
    isPrimary: index === 0
  }));

  return {
    ready: !coverTip,
    error: coverTip,
    pendingDistance: false,
    fee,
    unitPrice: roundMoney(serviceFees.reduce((sum, row) => sum + row.unitPrice, 0)),
    holidayExtra,
    holidayFee,
    petKind: grouped.kind,
    petCount: applicable.length,
    packageName: selected.map((item) => item.name).filter(Boolean).join(' + '),
    packageId: selected[0].id || '',
    packageIds: selected.map((item) => item.id),
    description: selected.map((item) => item.description).filter(Boolean).join('；'),
    distanceKm: Number.isFinite(km) ? roundMoney(km) : null,
    distanceExtra,
    surchargeEnabled: needDistance,
    text: textParts.join(' '),
    discountTip: multi.discountTip,
    discountTotal: multi.discountTotal,
    surchargeTotal: multi.surchargeTotal,
    coverTip,
    items
  };
}

module.exports = {
  getVisitPetKind,
  classifyVisitPets,
  listDogPackages,
  listCatPackages,
  listVisitServices,
  calcHomeVisitQuote
};
