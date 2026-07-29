const MOBILE_PHONE_REG = /^1[3-9]\d{9}$/;

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function isValidMobilePhone(value) {
  return MOBILE_PHONE_REG.test(normalizePhone(value));
}

function validateMobilePhone(value, options = {}) {
  const phone = normalizePhone(value);
  const emptyMsg = options.emptyMsg || '请填写手机号';
  const invalidMsg = options.invalidMsg || '请输入标准的11位手机号';
  if (!phone) return emptyMsg;
  if (!isValidMobilePhone(phone)) return invalidMsg;
  return '';
}

module.exports = {
  MOBILE_PHONE_REG,
  normalizePhone,
  isValidMobilePhone,
  validateMobilePhone
};
