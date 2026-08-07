/**
 * 宠物年龄：岁 + 月
 * 放在主包 utils，供分包与订单展示共用。
 */

function sanitizeIntegerInput(value, max) {
  let text = String(value == null ? '' : value).replace(/[^\d]/g, '');
  if (text === '') return '';
  let num = parseInt(text, 10);
  if (!Number.isFinite(num) || num < 0) return '';
  if (max != null && num > max) num = max;
  return String(num);
}

/**
 * 解析年龄为 岁 + 月。
 * 优先用 ageYears/ageMonths；兼容旧数据里的小数岁（如 1.5 → 1岁6月）。
 */
function parseAgeParts(pet) {
  const source = pet || {};
  const hasParts = source.ageYears != null && String(source.ageYears).trim() !== '';
  const hasMonths = source.ageMonths != null && String(source.ageMonths).trim() !== '';
  if (hasParts || hasMonths) {
    const years = Math.max(0, parseInt(source.ageYears, 10) || 0);
    let months = Math.max(0, parseInt(source.ageMonths, 10) || 0);
    if (months > 11) months = 11;
    return {
      ageYears: String(years),
      ageMonths: String(months)
    };
  }

  const ageText = String(source.age == null ? '' : source.age).trim();
  if (!ageText) return { ageYears: '', ageMonths: '' };

  const matched = ageText.match(/^(\d+)\s*岁(?:\s*(\d+)\s*月)?$/);
  if (matched) {
    return {
      ageYears: String(parseInt(matched[1], 10) || 0),
      ageMonths: String(Math.min(11, parseInt(matched[2], 10) || 0))
    };
  }

  const ageNum = parseFloat(ageText);
  if (!Number.isFinite(ageNum) || ageNum < 0) return { ageYears: '', ageMonths: '' };
  const years = Math.floor(ageNum);
  let months = Math.round((ageNum - years) * 12);
  if (months >= 12) {
    return { ageYears: String(years + 1), ageMonths: '0' };
  }
  return {
    ageYears: String(years),
    ageMonths: String(months)
  };
}

function formatAgeText(pet) {
  const parts = parseAgeParts(pet);
  const yearsText = String(parts.ageYears || '').trim();
  const monthsText = String(parts.ageMonths || '').trim();
  if (yearsText === '' && monthsText === '') {
    const legacy = pet && pet.age != null ? String(pet.age).trim() : '';
    if (!legacy) return '';
    if (/岁/.test(legacy)) return legacy;
    return `${legacy}岁`;
  }
  const years = parseInt(yearsText, 10) || 0;
  const months = Math.min(11, Math.max(0, parseInt(monthsText, 10) || 0));
  if (years <= 0 && months <= 0) return '';
  if (months <= 0) return `${years}岁`;
  if (years <= 0) return `0岁${months}月`;
  return `${years}岁${months}月`;
}

function buildAgePayload(ageYears, ageMonths) {
  const years = Math.max(0, parseInt(ageYears, 10) || 0);
  const months = Math.min(11, Math.max(0, parseInt(ageMonths, 10) || 0));
  const ageDecimal = Math.round((years + months / 12) * 10) / 10;
  return {
    ageYears: years,
    ageMonths: months,
    age: String(ageDecimal)
  };
}

module.exports = {
  sanitizeIntegerInput,
  parseAgeParts,
  formatAgeText,
  buildAgePayload
};
