const { validateMobilePhone } = require('./phone');

function formatPickupLegs(order) {
  if (!order || !order.needPickup) return '';
  const outbound = order.pickupIncludeOutbound !== false;
  const ret = order.pickupIncludeReturn !== false;
  if (outbound && ret) return '去程、返程';
  if (outbound) return '去程';
  if (ret) return '返程';
  return '未选择';
}

function formatPickupTripType(order) {
  if (!order || !order.needPickup) return '';
  const outbound = order.pickupIncludeOutbound !== false;
  const ret = order.pickupIncludeReturn !== false;
  if (outbound && ret) return '双程';
  if (outbound || ret) return '单程';
  return '未选择';
}

function validatePickupInfo(data) {
  if (!data || !data.needPickup) return '';
  const address = String(data.pickupAddress || '').trim();
  const lat = parseFloat(data.pickupLatitude);
  const lng = parseFloat(data.pickupLongitude);
  const phone = String(data.pickupContactPhone || '').trim();
  const time = String(data.pickupTime || '').trim();
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) return '请在地图选择接送地址';
  const phoneError = validateMobilePhone(phone, {
    emptyMsg: '请填写接送联系电话',
    invalidMsg: '接送联系电话需为11位手机号'
  });
  if (phoneError) return phoneError;
  if (!time) return '请选择接送时间';
  if (!data.pickupIncludeOutbound && !data.pickupIncludeReturn) {
    return '请至少选择去程或返程接送';
  }
  return '';
}

function buildPickupPayload(data) {
  if (!data || !data.needPickup) {
    return {
      pickupAddress: '',
      pickupLocationName: '',
      pickupLatitude: '',
      pickupLongitude: '',
      pickupContactPhone: '',
      pickupTime: '',
      pickupIncludeOutbound: true,
      pickupIncludeReturn: true
    };
  }
  return {
    pickupAddress: String(data.pickupAddress || '').trim(),
    pickupLocationName: String(data.pickupLocationName || '').trim(),
    pickupLatitude: data.pickupLatitude != null && data.pickupLatitude !== '' ? data.pickupLatitude : '',
    pickupLongitude: data.pickupLongitude != null && data.pickupLongitude !== '' ? data.pickupLongitude : '',
    pickupContactPhone: String(data.pickupContactPhone || '').trim(),
    pickupTime: String(data.pickupTime || '').trim(),
    pickupIncludeOutbound: !!data.pickupIncludeOutbound,
    pickupIncludeReturn: !!data.pickupIncludeReturn
  };
}

module.exports = {
  formatPickupLegs,
  formatPickupTripType,
  validatePickupInfo,
  buildPickupPayload
};
