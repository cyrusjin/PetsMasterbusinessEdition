const ABOVE_MAX_FALLBACK = 99999;

function buildRangeLabel(min, max, isAbove) {
  const minText = formatKg(min);
  if (isAbove) return `${minText}kg以上`;
  return `${minText}-${formatKg(max)}kg`;
}

function formatKg(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return '';
  return Number.isInteger(num) ? String(num) : String(num);
}

function isAboveRange(item) {
  if (!item) return false;
  if (item.isAbove) return true;
  const max = parseFloat(item.max);
  return Number.isFinite(max) && max >= 999;
}

function withLabel(item) {
  const isAbove = isAboveRange(item);
  const min = parseFloat(item.min);
  const max = isAbove ? null : parseFloat(item.max);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: isAbove ? null : (Number.isFinite(max) ? max : 0),
    price: parseFloat(item.price) || 0,
    isAbove,
    label: buildRangeLabel(min, max, isAbove)
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
  const nextMin = lastRange ? lastRange.max : 0;
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
    min: lastRange ? lastRange.max : aboveItem.min
  });
  return mergeWeightPricing(nextRanges, nextAbove);
}

function updateWeightRangeField(list, index, field, rawValue) {
  const normalized = normalizeWeightPricing(list);
  const next = normalized.map((item) => ({ ...item }));
  const target = next[index];
  if (!target) return normalized;

  if (field === 'price') {
    target.price = parseFloat(rawValue) || 0;
  } else if (field === 'min' || field === 'max') {
    const parsed = parseFloat(rawValue);
    target[field] = Number.isFinite(parsed) ? parsed : 0;
  }

  const relabeled = next.map(withLabel);
  const aboveIndex = relabeled.length - 1;

  if (target.isAbove && field === 'min' && aboveIndex > 0) {
    relabeled[aboveIndex - 1] = withLabel({
      ...relabeled[aboveIndex - 1],
      max: relabeled[aboveIndex].min
    });
  }

  if (!target.isAbove && field === 'max' && index < aboveIndex) {
    if (index + 1 < aboveIndex) {
      relabeled[index + 1] = withLabel({
        ...relabeled[index + 1],
        min: relabeled[index].max
      });
    } else {
      relabeled[aboveIndex] = withLabel({
        ...relabeled[aboveIndex],
        min: relabeled[index].max
      });
    }
  }

  if (!target.isAbove && field === 'min' && index > 0) {
    relabeled[index - 1] = withLabel({
      ...relabeled[index - 1],
      max: relabeled[index].min
    });
  }

  return relabeled.map(withLabel);
}

function findWeightPrice(list, petWeight) {
  const normalized = normalizeWeightPricing(list);
  const weight = parseFloat(petWeight) || 0;
  const matched = normalized.find((item) => {
    if (item.isAbove) return weight >= item.min;
    return weight >= item.min && weight < item.max;
  });
  if (matched) return matched.price;
  const above = normalized[normalized.length - 1];
  if (above && above.isAbove) return above.price;
  return normalized[0] ? normalized[0].price : 0;
}

function validateWeightPricing(list) {
  const normalized = normalizeWeightPricing(list);
  const { ranges, aboveItem } = splitWeightPricing(normalized);

  if (!ranges.length) return '请至少添加一个体重区间';
  if (!(parseFloat(aboveItem.price) > 0)) return `请填写${aboveItem.label}价格`;

  for (let i = 0; i < ranges.length; i += 1) {
    const item = ranges[i];
    if (!(parseFloat(item.min) >= 0)) return `请填写第${i + 1}个区间的起始体重`;
    if (!(parseFloat(item.max) > parseFloat(item.min))) {
      return `第${i + 1}个区间的上限体重需大于下限`;
    }
    if (!(parseFloat(item.price) > 0)) return `请填写${item.label}价格`;
    if (i > 0 && parseFloat(item.min) !== parseFloat(ranges[i - 1].max)) {
      return `第${i + 1}个区间需紧接上一区间`;
    }
  }

  if (!(parseFloat(aboveItem.min) >= 0)) return '请填写「以上」区间的起始体重';
  const lastRange = ranges[ranges.length - 1];
  if (parseFloat(aboveItem.min) !== parseFloat(lastRange.max)) {
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
  buildRangeLabel
};
