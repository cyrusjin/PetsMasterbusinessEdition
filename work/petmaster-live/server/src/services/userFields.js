function normalizeIsMerchant(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function normalizeMerchantStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (status === 'approved' || status === 'pending' || status === 'rejected') return status;
  return '';
}

function isMerchantApprovedFromDoc(doc) {
  if (!doc) return false;
  const status = normalizeMerchantStatus(doc.merchantStatus);
  if (status === 'approved') return true;
  if (status === 'pending') return false;
  return normalizeIsMerchant(doc.isMerchant);
}

/** 商家身份绑定的店铺（owner / staff / 待审 / 已拒绝） */
function resolveMerchantStoreId(doc) {
  if (!doc) return '';
  const explicit = (doc.merchantStoreId || '').trim();
  if (explicit) return explicit;
  const legacy = (doc.store_id || '').trim();
  if (!legacy) return '';
  if (isMerchantApprovedFromDoc(doc)) return legacy;
  const status = normalizeMerchantStatus(doc.merchantStatus);
  if (status === 'pending' || status === 'rejected' || status === 'disabled') return legacy;
  return '';
}

/** 宠主端当前访问/预约的店铺 */
function resolveVisitStoreId(doc) {
  if (!doc) return '';
  const explicit = (doc.visitStoreId || '').trim();
  if (explicit) return explicit;
  const legacy = (doc.store_id || '').trim();
  const merchantId = resolveMerchantStoreId(doc);
  if (!legacy) return '';
  if (merchantId && legacy === merchantId) return '';
  return legacy;
}

function formatUserStoreFields(doc) {
  const merchantStoreId = resolveMerchantStoreId(doc);
  const visitStoreId = resolveVisitStoreId(doc);
  return {
    merchantStoreId,
    visitStoreId,
    // 兼容旧客户端：宠主端 bindStore 仍读 store_id
    store_id: visitStoreId
  };
}

module.exports = {
  normalizeIsMerchant,
  normalizeMerchantStatus,
  isMerchantApprovedFromDoc,
  resolveMerchantStoreId,
  resolveVisitStoreId,
  formatUserStoreFields
};
