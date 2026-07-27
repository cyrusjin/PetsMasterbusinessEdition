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

module.exports = {
  RECEPTION_RANGE_OPTIONS,
  normalizeReceptionRange,
  formatReceptionRangeText,
  buildReceptionRangeOptions,
  isReceptionRangeSelected
};
