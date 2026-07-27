const { RECEPTION_RANGE_OPTIONS } = require('./receptionRange');
const { uploadLocalImage } = require('./upload');
const { clampDateString } = require('./datePicker');

const PET_TYPES = RECEPTION_RANGE_OPTIONS.map((item) => item.value);
const YES_NO_VALUES = ['是', '否'];

function normalizePetType(type) {
  const text = (type || '').trim();
  if (text === '其他宠物') return '其他';
  return PET_TYPES.includes(text) ? text : '';
}

function isYesNo(value) {
  return YES_NO_VALUES.includes(value);
}

function normalizeYesNoStatus(value, fallback = '否') {
  return isYesNo(value) ? value : fallback;
}

function normalizePetHealthFields(pet) {
  const source = pet || {};
  let allergyStatus = isYesNo(source.allergyStatus) ? source.allergyStatus : '';
  let allergy = String(source.allergy || '').trim();
  let medicalHistoryStatus = isYesNo(source.medicalHistoryStatus) ? source.medicalHistoryStatus : '';
  let medicalHistory = String(source.medicalHistory || '').trim();

  if (!source.allergyStatus && allergy) {
    allergyStatus = '是';
  }
  if (!source.medicalHistoryStatus && medicalHistory) {
    medicalHistoryStatus = '是';
  }
  if (allergyStatus === '否') allergy = '';
  if (medicalHistoryStatus === '否') medicalHistory = '';

  return {
    vaccination: source.vaccination || '',
    dewormDate: source.dewormDate ? clampDateString(source.dewormDate) : '',
    allergyStatus,
    allergy,
    medicalHistoryStatus,
    medicalHistory,
    isPregnant: source.isPregnant || '',
    inHeat: source.inHeat || '',
    isNeutered: source.isNeutered || '',
    hasDogLicense: source.hasDogLicense || ''
  };
}

function validatePetBasicForm(data) {
  const pet = data || {};
  const petType = normalizePetType(pet.petType || pet.type);
  if (!(pet.name && String(pet.name).trim())) return '请输入宠物名称';
  if (!petType) return '请选择宠物类型';
  if (!(pet.breed && String(pet.breed).trim())) return '请输入品种';
  if (pet.gender !== '公' && pet.gender !== '母') return '请选择性别';
  const age = parseFloat(pet.age);
  if (!Number.isFinite(age) || age <= 0) return '请输入有效年龄';
  const weight = parseFloat(pet.weight);
  if (!Number.isFinite(weight) || weight <= 0) return '请输入有效体重';
  if (!(pet.color && String(pet.color).trim())) return '请输入毛色';
  return '';
}

function validatePetHealthForm(data) {
  const pet = normalizePetHealthFields(data);
  if (pet.vaccination !== '已接种' && pet.vaccination !== '未接种') {
    return '请选择疫苗接种情况';
  }
  if (!pet.dewormDate) return '请选择驱虫时间';
  if (!isYesNo(pet.allergyStatus)) return '请选择是否有过敏史';
  if (pet.allergyStatus === '是' && !pet.allergy) return '请填写过敏史详情';
  if (!isYesNo(pet.medicalHistoryStatus)) return '请选择是否有既往病史';
  if (pet.medicalHistoryStatus === '是' && !pet.medicalHistory) return '请填写既往病史详情';
  if (!isYesNo(pet.isPregnant)) return '请选择是否怀孕';
  if (!isYesNo(pet.inHeat)) return '请选择是否发情';
  if (!isYesNo(pet.isNeutered)) return '请选择是否绝育';
  if (!isYesNo(pet.hasDogLicense)) return '请选择是否办理犬证';
  return '';
}

function validatePetForm(data) {
  return validatePetBasicForm(data) || validatePetHealthForm(data);
}

function buildPetPayload(data) {
  const pet = data || {};
  const health = normalizePetHealthFields(pet);
  return {
    id: pet.id || '',
    pet_id: pet.id || pet.pet_id || '',
    name: String(pet.name || '').trim(),
    type: normalizePetType(pet.petType || pet.type),
    breed: String(pet.breed || '').trim(),
    gender: pet.gender === '母' ? '母' : '公',
    age: String(pet.age),
    weight: String(pet.weight),
    color: String(pet.color || '').trim(),
    photo: pet.photo || '',
    vaccination: health.vaccination,
    dewormDate: health.dewormDate,
    allergyStatus: health.allergyStatus,
    allergy: health.allergy,
    medicalHistoryStatus: health.medicalHistoryStatus,
    medicalHistory: health.medicalHistory,
    isPregnant: health.isPregnant,
    inHeat: health.inHeat,
    isNeutered: health.isNeutered,
    hasDogLicense: health.hasDogLicense,
    character: pet.character || '',
    dietTaboo: pet.dietTaboo || '',
    specialCare: pet.specialCare || '',
    remark: pet.remark || ''
  };
}

function uploadPetPhoto(photo) {
  return uploadLocalImage(photo, 'pet-photos');
}

module.exports = {
  PET_TYPES,
  YES_NO_VALUES,
  normalizePetType,
  normalizePetHealthFields,
  validatePetBasicForm,
  validatePetHealthForm,
  validatePetForm,
  buildPetPayload,
  uploadPetPhoto
};
