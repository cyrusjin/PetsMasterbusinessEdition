const { RECEPTION_RANGE_OPTIONS } = require('../../utils/receptionRange');
const { uploadLocalImage } = require('../../utils/upload');
const { clampDateString } = require('./datePicker');
const {
  sanitizeIntegerInput,
  parseAgeParts,
  formatAgeText,
  buildAgePayload
} = require('../../utils/petAge');

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

/**
 * 输入过程中清洗：只保留数字和一个小数点
 * @param {string} value
 * @param {number} maxDecimals 小数位数上限
 */
function sanitizeDecimalInput(value, maxDecimals = 2) {
  let text = String(value == null ? '' : value).replace(/[^\d.]/g, '');
  const dot = text.indexOf('.');
  if (dot >= 0) {
    text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, '');
    if (maxDecimals >= 0) {
      const [intPart, decPart = ''] = text.split('.');
      text = intPart + '.' + decPart.slice(0, maxDecimals);
    }
  }
  return text;
}

/** 完整正数（可带小数），不允许前导多余点、多小数点、<=0 */
function isValidPositiveDecimal(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return false;
  const num = Number(text);
  return Number.isFinite(num) && num > 0;
}

function normalizePositiveDecimal(value, maxDecimals = 2) {
  const text = String(value == null ? '' : value).trim();
  if (!isValidPositiveDecimal(text)) return '';
  const num = Number(text);
  if (!Number.isFinite(num)) return '';
  const fixed = maxDecimals >= 0 ? Number(num.toFixed(maxDecimals)) : num;
  return String(fixed);
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

  const ageParts = parseAgeParts(pet);
  const yearsText = String(ageParts.ageYears || '').trim();
  const monthsText = String(ageParts.ageMonths || '').trim();
  if (yearsText === '' && monthsText === '') return '请输入年龄';
  const years = parseInt(yearsText || '0', 10);
  const months = parseInt(monthsText || '0', 10);
  if (!Number.isFinite(years) || years < 0) return '年龄岁数请输入有效整数';
  if (!Number.isFinite(months) || months < 0 || months > 11) return '年龄月数请输入 0–11 的整数';
  if (years <= 0 && months <= 0) return '请填写年龄（岁或月至少一项大于 0）';
  if (years > 50) return '年龄不能超过 50 岁';

  const weightText = String(pet.weight == null ? '' : pet.weight).trim();
  if (!weightText) return '请输入体重';
  if (!isValidPositiveDecimal(weightText)) return '体重请输入有效数字，支持小数';
  const weight = Number(weightText);
  if (weight > 200) return '体重不能超过 200 kg';

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
  const agePayload = buildAgePayload(
    pet.ageYears != null ? pet.ageYears : parseAgeParts(pet).ageYears,
    pet.ageMonths != null ? pet.ageMonths : parseAgeParts(pet).ageMonths
  );
  return {
    id: pet.id || '',
    pet_id: pet.id || pet.pet_id || '',
    name: String(pet.name || '').trim(),
    type: normalizePetType(pet.petType || pet.type),
    breed: String(pet.breed || '').trim(),
    gender: pet.gender === '母' ? '母' : '公',
    ...agePayload,
    weight: normalizePositiveDecimal(pet.weight, 2),
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
    behaviorHabits: String(pet.behaviorHabits || '').trim(),
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
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  isValidPositiveDecimal,
  normalizePositiveDecimal,
  parseAgeParts,
  formatAgeText,
  buildAgePayload,
  normalizePetType,
  normalizePetHealthFields,
  validatePetBasicForm,
  validatePetHealthForm,
  validatePetForm,
  buildPetPayload,
  uploadPetPhoto
};
