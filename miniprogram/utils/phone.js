const MOBILE_PHONE_REG = /^1\d{10}$/;

function normalizePhone(value) {
  return String(value || '').trim();
}

function isValidMobilePhone(value) {
  return MOBILE_PHONE_REG.test(normalizePhone(value));
}

function validateMobilePhone(value, options = {}) {
  const phone = normalizePhone(value);
  const emptyMsg = options.emptyMsg || '请填写手机号';
  const invalidMsg = options.invalidMsg || '请输入正确的11位手机号';
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
