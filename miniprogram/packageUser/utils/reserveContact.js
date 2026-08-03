const { STORAGE_KEYS } = require('../../utils/constants');
const { validateMobilePhone } = require('../../utils/phone');

function loadReserveContact() {
  try {
    const cached = wx.getStorageSync(STORAGE_KEYS.RESERVE_CONTACT);
    if (!cached || typeof cached !== 'object') {
      return { contactName: '', contactPhone: '', contactIdCard: '' };
    }
    return {
      contactName: String(cached.contactName || '').trim(),
      contactPhone: String(cached.contactPhone || '').trim(),
      contactIdCard: String(cached.contactIdCard || '').trim()
    };
  } catch (err) {
    return { contactName: '', contactPhone: '', contactIdCard: '' };
  }
}

function saveReserveContact(contactName, contactPhone, contactIdCard) {
  try {
    wx.setStorageSync(STORAGE_KEYS.RESERVE_CONTACT, {
      contactName: String(contactName || '').trim(),
      contactPhone: String(contactPhone || '').trim(),
      contactIdCard: String(contactIdCard || '').trim()
    });
  } catch (err) {
    console.warn('[预约] 保存联系人缓存失败', err);
  }
}

function validateReserveContact(contactName, contactPhone) {
  const name = String(contactName || '').trim();
  const phone = String(contactPhone || '').trim();
  if (!name) return '请填写联系人';
  const phoneError = validateMobilePhone(phone, {
    emptyMsg: '请填写联系电话',
    invalidMsg: '请输入正确的11位手机号'
  });
  if (phoneError) return phoneError;
  return '';
}

function validateContactIdCard(contactIdCard) {
  const idCard = String(contactIdCard || '').trim();
  if (!idCard) return '';
  if (!/^(\d{15}|\d{17}[\dXx])$/.test(idCard)) return '请输入正确的15或18位身份证号';
  return '';
}

module.exports = {
  loadReserveContact,
  saveReserveContact,
  validateReserveContact,
  validateContactIdCard
};
