function buildPetSnapshot(pet) {
  if (!pet) return null;
  return {
    photo: pet.photo || '',
    breed: pet.breed || '',
    gender: pet.gender || '',
    age: pet.age != null ? String(pet.age) : '',
    weight: pet.weight != null ? String(pet.weight) : '',
    color: pet.color || '',
    vaccination: pet.vaccination || '',
    dewormDate: pet.dewormDate || '',
    allergyStatus: pet.allergyStatus || '',
    allergy: pet.allergy || '',
    medicalHistoryStatus: pet.medicalHistoryStatus || '',
    medicalHistory: pet.medicalHistory || '',
    isPregnant: pet.isPregnant || '',
    inHeat: pet.inHeat || '',
    isNeutered: pet.isNeutered || '',
    hasDogLicense: pet.hasDogLicense || '',
    character: pet.character || '',
    dietTaboo: pet.dietTaboo || '',
    specialCare: pet.specialCare || '',
    remark: pet.remark || ''
  };
}

function formatYesNoLabel(value) {
  if (value === '是' || value === '否') return value;
  return value ? String(value) : '--';
}

function formatStatusWithDetail(status, detail) {
  if (status === '是') {
    const text = (detail || '').trim();
    return text ? `是（${text}）` : '是';
  }
  if (status === '否') return '否';
  const legacy = (detail || '').trim();
  return legacy || '--';
}

function buildPetDetailView(snapshot, orderFallback = {}) {
  const pet = snapshot || {};
  const breed = pet.breed || orderFallback.petBreed || '';
  const gender = pet.gender || orderFallback.petGender || '';
  const age = pet.age || orderFallback.petAge || '';
  return {
    photo: pet.photo || orderFallback.petPhoto || '',
    breed,
    gender,
    age,
    ageText: age ? `${age}岁` : '--',
    weight: pet.weight || orderFallback.petWeight || '',
    weightText: pet.weight ? `${pet.weight}kg` : '--',
    color: pet.color || '',
    vaccination: pet.vaccination || '--',
    dewormDate: pet.dewormDate || '--',
    allergyText: formatStatusWithDetail(pet.allergyStatus, pet.allergy),
    medicalHistoryText: formatStatusWithDetail(pet.medicalHistoryStatus, pet.medicalHistory),
    isPregnant: formatYesNoLabel(pet.isPregnant),
    inHeat: formatYesNoLabel(pet.inHeat),
    isNeutered: formatYesNoLabel(pet.isNeutered),
    hasDogLicense: formatYesNoLabel(pet.hasDogLicense),
    character: pet.character || '--',
    dietTaboo: pet.dietTaboo || '--',
    specialCare: pet.specialCare || '--',
    remark: pet.remark || '--'
  };
}

function buildContractPetInfoLines(pet, orderFallback = {}) {
  const snapshot = (orderFallback && orderFallback.petSnapshot) || {};
  const p = pet || {};
  const merged = {
    ...snapshot,
    ...p,
    name: p.name || (orderFallback && orderFallback.petName) || '',
    type: p.type || (orderFallback && orderFallback.petType) || '',
    breed: p.breed || snapshot.breed || (orderFallback && orderFallback.petBreed) || '',
    gender: p.gender || snapshot.gender || (orderFallback && orderFallback.petGender) || '',
    age: p.age != null && p.age !== '' ? p.age : (snapshot.age || (orderFallback && orderFallback.petAge) || ''),
    weight: p.weight != null && p.weight !== '' ? p.weight : (snapshot.weight || (orderFallback && orderFallback.petWeight) || ''),
    color: p.color || snapshot.color || '',
    vaccination: p.vaccination || snapshot.vaccination || '',
    dewormDate: p.dewormDate || snapshot.dewormDate || '',
    allergyStatus: p.allergyStatus || snapshot.allergyStatus || '',
    allergy: p.allergy || snapshot.allergy || '',
    medicalHistoryStatus: p.medicalHistoryStatus || snapshot.medicalHistoryStatus || '',
    medicalHistory: p.medicalHistory || snapshot.medicalHistory || '',
    isPregnant: p.isPregnant || snapshot.isPregnant || '',
    inHeat: p.inHeat || snapshot.inHeat || '',
    isNeutered: p.isNeutered || snapshot.isNeutered || '',
    hasDogLicense: p.hasDogLicense || snapshot.hasDogLicense || '',
    character: p.character || snapshot.character || '',
    dietTaboo: p.dietTaboo || snapshot.dietTaboo || '',
    specialCare: p.specialCare || snapshot.specialCare || '',
    remark: p.remark || snapshot.remark || ''
  };
  const view = buildPetDetailView(merged, orderFallback || {});

  const display = (value) => {
    const text = value == null ? '' : String(value).trim();
    return text || '——';
  };

  return [
    { label: '宠物名称', value: display(merged.name) },
    { label: '宠物类型', value: display(merged.type) },
    { label: '品种', value: display(view.breed) },
    { label: '性别', value: display(view.gender) },
    { label: '年龄', value: view.ageText && view.ageText !== '--' ? view.ageText : '——' },
    { label: '体重', value: view.weightText && view.weightText !== '--' ? view.weightText : '——' },
    { label: '毛色', value: display(view.color) },
    { label: '疫苗接种', value: display(view.vaccination) },
    { label: '驱虫时间', value: display(view.dewormDate) },
    { label: '过敏史', value: display(view.allergyText) },
    { label: '既往病史', value: display(view.medicalHistoryText) },
    { label: '是否怀孕', value: display(view.isPregnant) },
    { label: '是否发情', value: display(view.inHeat) },
    { label: '是否绝育', value: display(view.isNeutered) },
    { label: '是否办理犬证', value: display(view.hasDogLicense) },
    { label: '性格特点', value: display(view.character) },
    { label: '饮食禁忌', value: display(view.dietTaboo) },
    { label: '特殊照料需求', value: display(view.specialCare) },
    { label: '备注', value: display(view.remark) }
  ];
}

function buildOrderListPetMeta(order) {
  const util = require('./util');
  const snapshot = order.petSnapshot || {};
  const breed = order.petBreed || snapshot.breed || '';
  const gender = order.petGender || snapshot.gender || '';
  const age = order.petAge || snapshot.age || '';
  const boardingTime = [
    order.startDate,
    order.startTime,
    '~',
    order.endDate,
    order.endTime
  ].filter(Boolean).join(' ');
  return {
    petPhoto: order.petPhoto || snapshot.photo || '',
    petBreed: breed,
    petGender: gender,
    petAge: age,
    petAgeText: age ? `${age}岁` : '--',
    boardingTime,
    createTimeText: util.formatOrderCreateTime(order) || '--'
  };
}

module.exports = {
  buildPetSnapshot,
  buildPetDetailView,
  buildContractPetInfoLines,
  buildOrderListPetMeta,
  formatYesNoLabel,
  formatStatusWithDetail
};
