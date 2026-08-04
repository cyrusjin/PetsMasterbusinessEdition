/**
 * 长期寄养折扣：梯度「住满 N 天 → X 折」（8 折 = 付原价 80%）。
 * 仅作用于寄养费，接送费与押金不参与。
 * 兼容旧结构 { enabled, minDays, zhe }。
 */

function getDefaultLongTermDiscount() {
  return {
    enabled: false,
    tiers: [],
    applyTo: 'boarding'
  };
}

function roundMoney(amount) {
  return Math.round((parseFloat(amount) || 0) * 100) / 100;
}

function parsePositiveInt(value) {
  if (value === '' || value == null) return null;
  if (typeof value === 'string' && !/^\d+$/.test(String(value).trim())) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseIntInRange(value, min, max) {
  if (value === '' || value == null) return null;
  if (typeof value === 'string' && !/^\d+$/.test(String(value).trim())) return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function createEmptyLongTermTier() {
  return { minDays: '', zhe: '' };
}

function legacyToTiers(src) {
  const minDays = parsePositiveInt(src.minDays);
  const zhe = parseIntInRange(src.zhe, 1, 9);
  if (minDays && zhe) return [{ minDays, zhe }];
  return [];
}

function normalizeTier(rawTiers, src) {
  let list = Array.isArray(rawTiers) ? rawTiers : null;
  if (!list || !list.length) {
    list = legacyToTiers(src || {});
  }
  const mapped = list.map((tier) => {
    const item = tier && typeof tier === 'object' ? tier : {};
    const minDays = parsePositiveInt(item.minDays);
    const zhe = parseIntInRange(item.zhe, 1, 9);
    if (!minDays || !zhe) return null;
    return { minDays, zhe };
  }).filter(Boolean);

  const byDays = {};
  mapped.forEach((tier) => {
    const prev = byDays[tier.minDays];
    if (!prev || tier.zhe < prev.zhe) byDays[tier.minDays] = tier;
  });
  return Object.keys(byDays)
    .map((k) => byDays[k])
    .sort((a, b) => a.minDays - b.minDays);
}

function normalizeLongTermDiscount(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const enabled = src.enabled === true;
  const tiers = normalizeTier(src.tiers, src);
  return {
    enabled,
    tiers: enabled ? tiers : [],
    applyTo: 'boarding'
  };
}

/** 表单编辑用：保留输入字符串，兼容旧单档数据 */
function normalizeLongTermTiersForEdit(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let list = Array.isArray(src.tiers) ? src.tiers : null;
  if (!list || !list.length) {
    const legacy = legacyToTiers(src);
    if (legacy.length) {
      return legacy.map((t) => ({ minDays: String(t.minDays), zhe: String(t.zhe) }));
    }
    return [createEmptyLongTermTier()];
  }
  const edited = list.map((tier) => {
    const item = tier && typeof tier === 'object' ? tier : {};
    return {
      minDays: item.minDays != null && item.minDays !== '' ? String(item.minDays) : '',
      zhe: item.zhe != null && item.zhe !== '' ? String(item.zhe) : ''
    };
  });
  return edited.length ? edited : [createEmptyLongTermTier()];
}

function addLongTermTier(tiers) {
  const list = Array.isArray(tiers) ? tiers.slice() : [];
  list.push(createEmptyLongTermTier());
  return list;
}

function removeLongTermTier(tiers, index) {
  const list = Array.isArray(tiers) ? tiers.slice() : [];
  if (list.length <= 1) return list;
  if (index < 0 || index >= list.length) return list;
  list.splice(index, 1);
  return list;
}

function updateLongTermTierField(tiers, index, field, value) {
  const list = Array.isArray(tiers) ? tiers.map((t) => ({ ...t })) : [];
  if (index < 0 || index >= list.length) return list;
  const next = String(value == null ? '' : value).replace(/[^\d]/g, '');
  list[index] = { ...list[index], [field]: next };
  return list;
}

function formatZhe(zhe) {
  const n = parseIntInRange(zhe, 1, 9);
  return n != null ? String(n) : '';
}

function matchLongTermTier(discount, stayDays) {
  const rule = normalizeLongTermDiscount(discount);
  const days = parseFloat(stayDays) || 0;
  if (!rule.enabled || !rule.tiers.length || days <= 0) return null;
  let matched = null;
  rule.tiers.forEach((tier) => {
    if (days >= tier.minDays) {
      if (!matched || tier.minDays > matched.minDays) matched = tier;
    }
  });
  return matched;
}

function getLongTermDiscountFactor(discount, stayDays) {
  const tier = matchLongTermTier(discount, stayDays);
  if (!tier) return 1;
  return Math.max(0, Math.min(1, tier.zhe / 10));
}

/**
 * 对寄养费应用长期折扣。
 * @returns {{ boardingFee, discountAmount, factor, applied, discount, matchedTier }}
 */
function applyLongTermDiscount(boardingFee, discount, stayDays) {
  const rule = normalizeLongTermDiscount(discount);
  const original = roundMoney(boardingFee);
  const matchedTier = matchLongTermTier(rule, stayDays);
  const factor = matchedTier ? Math.max(0, Math.min(1, matchedTier.zhe / 10)) : 1;
  const fee = roundMoney(original * factor);
  const discountAmount = roundMoney(original - fee);
  const applied = factor < 1 && discountAmount > 0;
  return {
    boardingFee: fee,
    discountAmount,
    factor,
    applied,
    discount: rule,
    matchedTier
  };
}

function buildLongTermDiscountTip(discount, stayDays) {
  const rule = normalizeLongTermDiscount(discount);
  if (!rule.enabled || !rule.tiers.length) return '';
  const matched = matchLongTermTier(rule, stayDays);
  if (matched) {
    return `长期寄养优惠：住满 ${matched.minDays} 天及以上，寄养费 ${matched.zhe} 折`;
  }
  const summary = rule.tiers.map((t) => `${t.minDays}天${t.zhe}折`).join('、');
  return summary ? `长期寄养优惠：${summary}` : '';
}

function validateLongTermDiscount(raw) {
  if (!raw || raw.enabled !== true) return '';
  const src = raw && typeof raw === 'object' ? raw : {};
  let list = Array.isArray(src.tiers) ? src.tiers : null;
  if (!list || !list.length) {
    list = legacyToTiers(src);
  }
  // 开启但未配置档位：非必填，保存时视为未启用
  if (!list.length) return '';

  const seen = {};
  for (let i = 0; i < list.length; i += 1) {
    const tier = list[i] || {};
    const label = `第 ${i + 1} 档`;
    const daysRaw = tier.minDays;
    const zheRaw = tier.zhe;
    const daysEmpty = daysRaw === '' || daysRaw == null;
    const zheEmpty = zheRaw === '' || zheRaw == null;

    // 空行跳过
    if (daysEmpty && zheEmpty) continue;
    // 只填了一半则提示补全
    if (daysEmpty) return `${label}请填写天数，或不填整行`;
    if (zheEmpty) return `${label}请填写折扣，或不填整行`;

    if (typeof daysRaw === 'string' && !/^\d+$/.test(String(daysRaw).trim())) {
      return `${label}天数须为整数`;
    }
    const minDays = Number(daysRaw);
    if (!Number.isInteger(minDays) || minDays <= 0) return `${label}天数须为正整数`;
    if (minDays > 365) return `${label}天数不能超过 365`;

    if (typeof zheRaw === 'string' && !/^\d+$/.test(String(zheRaw).trim())) {
      return `${label}折扣须为整数`;
    }
    const zhe = Number(zheRaw);
    if (!Number.isInteger(zhe)) return `${label}折扣须为整数`;
    if (zhe < 1 || zhe > 9) return `${label}折扣需在 1–9 折之间（如 8 表示 8 折）`;

    if (seen[minDays]) return `天数 ${minDays} 重复，请合并或修改梯度`;
    seen[minDays] = true;
  }
  return '';
}

module.exports = {
  getDefaultLongTermDiscount,
  createEmptyLongTermTier,
  normalizeLongTermDiscount,
  normalizeLongTermTiersForEdit,
  addLongTermTier,
  removeLongTermTier,
  updateLongTermTierField,
  formatZhe,
  matchLongTermTier,
  getLongTermDiscountFactor,
  applyLongTermDiscount,
  buildLongTermDiscountTip,
  validateLongTermDiscount,
  parsePositiveInt,
  parseIntInRange
};
