const RECEPTION_RANGE_OPTIONS = [
  { value: '小型犬', label: '小型犬' },
  { value: '中型犬', label: '中型犬' },
  { value: '大型犬', label: '大型犬' },
  { value: '猫咪', label: '猫咪' },
  { value: '其他', label: '其他' }
];

const OPTION_VALUES = RECEPTION_RANGE_OPTIONS.map((item) => item.value);

const LEGACY_ALIAS = {
  其他宠物: '其他'
};

function normalizeReceptionRange(source) {
  let values = [];

  if (Array.isArray(source)) {
    values = source;
  } else if (typeof source === 'string' && source.trim()) {
    values = source.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean);
  } else if (source && Array.isArray(source.receptionRange)) {
    values = source.receptionRange;
  }

  const normalized = [];
  values.forEach((item) => {
    const text = LEGACY_ALIAS[item] || item;
    if (OPTION_VALUES.includes(text) && !normalized.includes(text)) {
      normalized.push(text);
    }
  });

  return OPTION_VALUES.filter((value) => normalized.includes(value));
}

function formatReceptionRangeText(receptionRange) {
  const normalized = normalizeReceptionRange(receptionRange);
  return normalized.length ? normalized.join('、') : '';
}

function buildReceptionRangeOptions(receptionRange) {
  const selected = normalizeReceptionRange(receptionRange);
  return RECEPTION_RANGE_OPTIONS.map((item) => ({
    ...item,
    checked: selected.includes(item.value)
  }));
}

function isReceptionRangeSelected(receptionRange, value) {
  return normalizeReceptionRange(receptionRange).includes(value);
}

function normalizePetTypeForReception(petType) {
  const text = String(petType || '').trim();
  if (!text) return '';
  if (text === '其他宠物') return '其他';
  if (text === '猫') return '猫咪';
  if (OPTION_VALUES.includes(text)) return text;
  return text;
}

/**
 * 判断宠物类型是否在店铺接待范围内。
 * 未配置接待范围时视为不限制（兼容旧店铺数据）。
 */
function isPetAllowedByReceptionRange(petType, receptionRange) {
  const allowed = normalizeReceptionRange(receptionRange);
  if (!allowed.length) return true;

  const type = normalizePetTypeForReception(petType);
  if (!type) return false;
  if (allowed.includes(type)) return true;

  // 旧数据可能只有「狗/犬」，任一犬类接待即放行
  if ((type === '狗' || type === '犬') && allowed.some((item) => item.includes('犬'))) {
    return true;
  }
  return false;
}

function getReceptionRangeRejectMessage(petType, receptionRange) {
  const rangeText = formatReceptionRangeText(receptionRange);
  const type = normalizePetTypeForReception(petType) || '该类型';
  if (rangeText) {
    return `「${type}」不在本店接待范围内（仅接待：${rangeText}）`;
  }
  return `本店暂不接待「${type}」`;
}

module.exports = {
  RECEPTION_RANGE_OPTIONS,
  normalizeReceptionRange,
  formatReceptionRangeText,
  buildReceptionRangeOptions,
  isReceptionRangeSelected,
  normalizePetTypeForReception,
  isPetAllowedByReceptionRange,
  getReceptionRangeRejectMessage
};
