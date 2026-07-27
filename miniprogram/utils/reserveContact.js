const { STORAGE_KEYS } = require('./constants');
const { validateMobilePhone } = require('./phone');

function loadReserveContact() {
  try {
    const cached = wx.getStorageSync(STORAGE_KEYS.RESERVE_CONTACT);
    if (!cached || typeof cached !== 'object') {
      return { contactName: '', contactPhone: '' };
    }
    return {
      contactName: String(cached.contactName || '').trim(),
      contactPhone: String(cached.contactPhone || '').trim()
    };
  } catch (err) {
    return { contactName: '', contactPhone: '' };
  }
}

function saveReserveContact(contactName, contactPhone) {
  try {
    wx.setStorageSync(STORAGE_KEYS.RESERVE_CONTACT, {
      contactName: String(contactName || '').trim(),
      contactPhone: String(contactPhone || '').trim()
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

module.exports = {
  loadReserveContact,
  saveReserveContact,
  validateReserveContact
};
