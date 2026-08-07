const ABOVE_MAX_FALLBACK = 99999;

/** 输入过程中清洗：保留数字与一个小数点，便于输入 4.5 */
function sanitizeDecimalInput(value, maxDecimals = 2) {
  let text = String(value == null ? '' : value).replace(/[^\d.]/g, '');
  const dot = text.indexOf('.');
  if (dot >= 0) {
    text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, '');
    if (maxDecimals >= 0) {
      const [intPart, decPart = ''] = text.split('.');
      text = `${intPart}.${decPart.slice(0, maxDecimals)}`;
    }
  }
  return text;
}

function roundWeight(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function sameWeight(a, b) {
  return Math.round(roundWeight(a) * 100) === Math.round(roundWeight(b) * 100);
}

function buildRangeLabel(min, max, isAbove) {
  const minText = formatKg(min);
  if (isAbove) return `${minText}kg以上`;
  return `${minText}-${formatKg(max)}kg`;
}

function formatKg(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  // 输入中的 "4." 原样保留，避免无法继续输入小数
  if (/^\d+\.$/.test(text)) return text;
  const num = parseFloat(text);
  if (!Number.isFinite(num)) return '';
  if (Number.isInteger(num) && text.indexOf('.') < 0) return String(num);
  const rounded = roundWeight(num);
  return String(rounded);
}

function isAboveRange(item) {
  if (!item) return false;
  if (item.isAbove) return true;
  const max = parseFloat(item.max);
  return Number.isFinite(max) && max >= 999;
}

function withLabel(item) {
  const isAbove = isAboveRange(item);
  const minRaw = item && item.min;
  const maxRaw = item && item.max;
  const priceRaw = item && item.price;
  const minText = formatKg(minRaw);
  const maxText = isAbove ? null : formatKg(maxRaw);
  const minNum = parseFloat(minText);
  const maxNum = isAbove ? null : parseFloat(maxText);
  const priceNum = parseFloat(priceRaw);
  return {
    // 保留可编辑的字符串，避免 4.5 被抹成整数
    min: minText !== '' ? minText : (Number.isFinite(minNum) ? String(minNum) : '0'),
    max: isAbove ? null : (maxText !== '' ? maxText : (Number.isFinite(maxNum) ? String(maxNum) : '0')),
    price: (() => {
      const priceText = sanitizeDecimalInput(priceRaw, 2);
      if (priceText === '' || priceText === '.') return priceText || '0';
      if (/^\d+\.$/.test(priceText)) return priceText;
      return Number.isFinite(priceNum) ? String(roundWeight(priceNum)) : '0';
    })(),
    isAbove,
    label: buildRangeLabel(minText || 0, maxText, isAbove)
  };
}

function getDefaultWeightPricing() {
  return [
    { min: 0, max: 5, price: 50, isAbove: false },
    { min: 5, max: 10, price: 80, isAbove: false },
    { min: 10, max: 20, price: 120, isAbove: false },
    { min: 20, max: null, price: 180, isAbove: true }
  ].map(withLabel);
}

function normalizeWeightPricing(list) {
  if (!Array.isArray(list) || !list.length) {
    return getDefaultWeightPricing();
  }

  const normalized = list.map(withLabel);
  const aboveIndex = normalized.findIndex((item) => item.isAbove);

  if (aboveIndex === -1) {
    const last = normalized[normalized.length - 1];
    normalized.push(withLabel({
      min: last.max > last.min ? last.max : last.min,
      max: null,
      price: last.price || 0,
      isAbove: true
    }));
    return normalized;
  }

  if (aboveIndex !== normalized.length - 1) {
    const aboveItem = normalized.splice(aboveIndex, 1)[0];
    normalized.push(aboveItem);
  }

  return normalized.map(withLabel);
}

function splitWeightPricing(list) {
  const normalized = normalizeWeightPricing(list);
  const aboveItem = normalized[normalized.length - 1];
  return {
    ranges: normalized.slice(0, -1),
    aboveItem
  };
}

function mergeWeightPricing(ranges, aboveItem) {
  return normalizeWeightPricing([...(ranges || []), aboveItem || { min: 0, max: null, price: 0, isAbove: true }]);
}

function addWeightRange(list) {
  const { ranges, aboveItem } = splitWeightPricing(list);
  const lastRange = ranges[ranges.length - 1];
  const nextMin = lastRange ? roundWeight(lastRange.max) : 0;
  const nextMax = nextMin + 5;
  const newRange = withLabel({ min: nextMin, max: nextMax, price: 0, isAbove: false });
  const nextAbove = withLabel({
    ...aboveItem,
    min: nextMax
  });
  return mergeWeightPricing([...ranges, newRange], nextAbove);
}

function removeWeightRange(list, index) {
  const { ranges, aboveItem } = splitWeightPricing(list);
  if (index < 0 || index >= ranges.length) return normalizeWeightPricing(list);
  if (ranges.length <= 1) return normalizeWeightPricing(list);

  const nextRanges = ranges.filter((_, idx) => idx !== index);
  if (index === 0 && nextRanges.length) {
    nextRanges[0] = withLabel({ ...nextRanges[0], min: 0 });
  }
  const lastRange = nextRanges[nextRanges.length - 1];
  const nextAbove = withLabel({
    ...aboveItem,
    min: lastRange ? roundWeight(lastRange.max) : roundWeight(aboveItem.min)
  });
  return mergeWeightPricing(nextRanges, nextAbove);
}

function updateWeightRangeField(list, index, field, rawValue) {
  const normalized = normalizeWeightPricing(list);
  const next = normalized.map((item) => ({ ...item }));
  const target = next[index];
  if (!target) return normalized;

  if (field === 'price' || field === 'min' || field === 'max') {
    target[field] = sanitizeDecimalInput(rawValue, 2);
  }

  const editedRaw = target[field];
  const relabeled = next.map(withLabel);

  // 保留正在输入的原始小数文本（如 4. / 4.5）
  if (field === 'price' || field === 'min' || field === 'max') {
    relabeled[index] = {
      ...relabeled[index],
      [field]: editedRaw,
      label: buildRangeLabel(
        field === 'min' ? editedRaw : relabeled[index].min,
        field === 'max' ? editedRaw : relabeled[index].max,
        relabeled[index].isAbove
      )
    };
  }

  const aboveIndex = relabeled.length - 1;
  const editedNum = roundWeight(editedRaw);

  if (target.isAbove && field === 'min' && aboveIndex > 0 && Number.isFinite(editedNum)) {
    relabeled[aboveIndex - 1] = withLabel({
      ...relabeled[aboveIndex - 1],
      max: editedNum
    });
  }

  if (!target.isAbove && field === 'max' && index < aboveIndex && Number.isFinite(editedNum)) {
    if (index + 1 < aboveIndex) {
      relabeled[index + 1] = withLabel({
        ...relabeled[index + 1],
        min: editedNum
      });
    } else {
      relabeled[aboveIndex] = withLabel({
        ...relabeled[aboveIndex],
        min: editedNum
      });
    }
  }

  if (!target.isAbove && field === 'min' && index > 0 && Number.isFinite(editedNum)) {
    relabeled[index - 1] = withLabel({
      ...relabeled[index - 1],
      max: editedNum
    });
  }

  return relabeled.map((item, idx) => {
    if (idx === index && (field === 'price' || field === 'min' || field === 'max')) {
      return {
        ...item,
        [field]: editedRaw,
        label: buildRangeLabel(item.min, item.max, item.isAbove)
      };
    }
    return withLabel(item);
  });
}

function findWeightPrice(list, petWeight) {
  const normalized = normalizeWeightPricing(list);
  const weight = parseFloat(petWeight) || 0;
  const matched = normalized.find((item) => {
    const min = roundWeight(item.min);
    if (item.isAbove) return weight >= min;
    const max = roundWeight(item.max);
    return weight >= min && weight < max;
  });
  if (matched) return roundWeight(matched.price);
  const above = normalized[normalized.length - 1];
  if (above && above.isAbove) return roundWeight(above.price);
  return normalized[0] ? roundWeight(normalized[0].price) : 0;
}

function validateWeightPricing(list) {
  const normalized = normalizeWeightPricing(list);
  const { ranges, aboveItem } = splitWeightPricing(normalized);

  if (!ranges.length) return '请至少添加一个体重区间';
  if (!(roundWeight(aboveItem.price) > 0)) return `请填写${aboveItem.label}价格`;

  for (let i = 0; i < ranges.length; i += 1) {
    const item = ranges[i];
    if (!(roundWeight(item.min) >= 0) && String(item.min).trim() === '') {
      return `请填写第${i + 1}个区间的起始体重`;
    }
    if (!(roundWeight(item.min) >= 0) && !Number.isFinite(parseFloat(item.min))) {
      return `请填写第${i + 1}个区间的起始体重`;
    }
    if (!(roundWeight(item.max) > roundWeight(item.min))) {
      return `第${i + 1}个区间的上限体重需大于下限`;
    }
    if (!(roundWeight(item.price) > 0)) return `请填写${item.label}价格`;
    if (i > 0 && !sameWeight(item.min, ranges[i - 1].max)) {
      return `第${i + 1}个区间需紧接上一区间`;
    }
  }

  if (!(roundWeight(aboveItem.min) >= 0) && !Number.isFinite(parseFloat(aboveItem.min))) {
    return '请填写「以上」区间的起始体重';
  }
  const lastRange = ranges[ranges.length - 1];
  if (!sameWeight(aboveItem.min, lastRange.max)) {
    return `「${aboveItem.label}」需从上一区间上限开始`;
  }

  return '';
}

module.exports = {
  ABOVE_MAX_FALLBACK,
  getDefaultWeightPricing,
  normalizeWeightPricing,
  splitWeightPricing,
  mergeWeightPricing,
  addWeightRange,
  removeWeightRange,
  updateWeightRangeField,
  findWeightPrice,
  validateWeightPricing,
  buildRangeLabel,
  sanitizeDecimalInput,
  roundWeight
};
