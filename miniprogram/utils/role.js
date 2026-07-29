function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function normalizeMerchantStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'approved' || status === 'pending' || status === 'rejected' || status === 'disabled') return status;
  return '';
}

/** 仅审核通过（或历史已开通商家）的用户具备商家能力 */
function isMerchantApproved(user) {
  if (!user) return false;
  const status = normalizeMerchantStatus(user.merchantStatus);
  if (status === 'approved') return true;
  if (status === 'pending') return false;
  return normalizeIsMerchant(user.isMerchant);
}

function isMerchantPending(user) {
  return normalizeMerchantStatus(user && user.merchantStatus) === 'pending';
}

function isMerchantRejected(user) {
  return normalizeMerchantStatus(user && user.merchantStatus) === 'rejected';
}

function isMerchantDisabled(user) {
  return normalizeMerchantStatus(user && user.merchantStatus) === 'disabled';
}

function isMerchantStaff(user) {
  if (!user) return false;
  return (user.merchantRole || '').toLowerCase() === 'staff';
}

/** 商家端绑定的店铺 ID（owner / staff / 待审 / 已拒绝） */
function getMerchantStoreId(user) {
  if (!user) return '';
  const explicit = (user.merchantStoreId || '').trim();
  if (explicit) return explicit;
  if (
    isMerchantApproved(user)
    || isMerchantPending(user)
    || isMerchantRejected(user)
    || isMerchantDisabled(user)
  ) {
    return (user.store_id || '').trim();
  }
  return '';
}

/** 宠主端当前访问/预约的店铺 ID */
function getVisitStoreId(user) {
  if (!user) return '';
  const explicit = (user.visitStoreId || '').trim();
  if (explicit) return explicit;
  const legacy = (user.store_id || '').trim();
  const merchantId = getMerchantStoreId(user);
  if (!legacy) return '';
  if (merchantId && legacy === merchantId) return '';
  return legacy;
}

function isStaffOfStore(user, storeId) {
  if (!user || !storeId) return false;
  const id = String(storeId).trim();
  if (!id) return false;
  return isMerchantStaff(user) && isMerchantApproved(user) && getMerchantStoreId(user) === id;
}

function isStoreOwner(user) {
  if (!user || !isMerchantApproved(user)) return false;
  return !isMerchantStaff(user);
}

/** 当前小程序默认上下文角色（不影响是否同时具备商家能力） */
function resolveRole(user) {
  return isMerchantApproved(user) ? 'merchant' : 'user';
}

function hasMerchantCapability(user) {
  return isMerchantApproved(user);
}

module.exports = {
  normalizeIsMerchant,
  normalizeMerchantStatus,
  isMerchantApproved,
  isMerchantPending,
  isMerchantRejected,
  isMerchantDisabled,
  isMerchantStaff,
  getMerchantStoreId,
  getVisitStoreId,
  isStaffOfStore,
  isStoreOwner,
  resolveRole,
  hasMerchantCapability
};
