const BADGE_KEYS = {
  MERCHANT_ORDERS_SEEN_AT: 'pet_badge_merchant_orders_seen_at',
  USER_ORDERS_SEEN_AT: 'pet_badge_user_orders_seen_at',
  USER_DAILY_SEEN_AT: 'pet_badge_user_daily_seen_at'
};

const USER_TAB = {
  ORDERS: 1,
  DAILY: 2
};

function getSeenAt(key) {
  try {
    return wx.getStorageSync(key) || 0;
  } catch (err) {
    return 0;
  }
}

function setSeenAt(key, ts = Date.now()) {
  try {
    wx.setStorageSync(key, ts);
  } catch (err) {
    console.warn('[badge] setSeenAt failed', err);
  }
}

function formatBadgeText(count) {
  if (!count || count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

function countMerchantPendingOrders(orders) {
  return (orders || []).filter((o) => o.status === 'pending').length;
}

function countMerchantNewOrders(orders) {
  const seenAt = getSeenAt(BADGE_KEYS.MERCHANT_ORDERS_SEEN_AT);
  return (orders || []).filter((o) => (
    o.status === 'pending' && (o.createTime || 0) > seenAt
  )).length;
}

function isUserOrderUnread(order, seenAt) {
  if (!order) return false;
  if (order.pricePendingConfirm) return true;
  if (order.priceConfirmedAt && order.priceConfirmedAt > (seenAt || 0)) return false;
  const updated = order.updateTime || 0;
  const created = order.createTime || 0;
  return updated > seenAt && updated > created + 1000;
}

function countUserOrderUpdates(orders) {
  const seenAt = getSeenAt(BADGE_KEYS.USER_ORDERS_SEEN_AT);
  return (orders || []).filter((o) => isUserOrderUnread(o, seenAt)).length;
}

function countUserNewDailyLogs(orders, logs) {
  const seenAt = getSeenAt(BADGE_KEYS.USER_DAILY_SEEN_AT);
  const boardingIds = new Set(
    (orders || [])
      .filter((o) => o.status === 'boarding')
      .map((o) => o.id || o.order_id)
      .filter(Boolean)
  );
  return (logs || []).filter((log) => {
    const oid = log.orderId || log.order_id;
    if (!oid || !boardingIds.has(oid)) return false;
    return (log.createTime || 0) > seenAt;
  }).length;
}

function applyTabBarBadge(index, count) {
  if (!wx.setTabBarBadge) return;
  const text = formatBadgeText(count);
  if (!text) {
    wx.removeTabBarBadge({ index }).catch(() => {});
    return;
  }
  wx.setTabBarBadge({ index, text }).catch(() => {});
}

function refreshUserTabBadges(orders, logs) {
  applyTabBarBadge(USER_TAB.ORDERS, countUserOrderUpdates(orders));
  applyTabBarBadge(USER_TAB.DAILY, countUserNewDailyLogs(orders, logs));
}

function clearUserTabBadges() {
  applyTabBarBadge(USER_TAB.ORDERS, 0);
  applyTabBarBadge(USER_TAB.DAILY, 0);
}

function markMerchantOrdersSeen() {
  setSeenAt(BADGE_KEYS.MERCHANT_ORDERS_SEEN_AT);
}

function markUserOrdersSeen() {
  setSeenAt(BADGE_KEYS.USER_ORDERS_SEEN_AT);
}

function markUserDailySeen() {
  setSeenAt(BADGE_KEYS.USER_DAILY_SEEN_AT);
}

function enrichOrdersWithUnread(orders) {
  const seenAt = getSeenAt(BADGE_KEYS.USER_ORDERS_SEEN_AT);
  return (orders || []).map((o) => ({
    ...o,
    hasUnread: isUserOrderUnread(o, seenAt)
  }));
}

function enrichLogsWithUnread(logs, orders) {
  const seenAt = getSeenAt(BADGE_KEYS.USER_DAILY_SEEN_AT);
  const boardingIds = new Set(
    (orders || [])
      .filter((o) => o.status === 'boarding')
      .map((o) => o.id || o.order_id)
      .filter(Boolean)
  );
  return (logs || []).map((log) => {
    const oid = log.orderId || log.order_id;
    const isBoarding = oid && boardingIds.has(oid);
    return {
      ...log,
      isNew: isBoarding && (log.createTime || 0) > seenAt
    };
  });
}

module.exports = {
  BADGE_KEYS,
  USER_TAB,
  getSeenAt,
  countMerchantPendingOrders,
  countMerchantNewOrders,
  countUserOrderUpdates,
  countUserNewDailyLogs,
  refreshUserTabBadges,
  clearUserTabBadges,
  markMerchantOrdersSeen,
  markUserOrdersSeen,
  markUserDailySeen,
  enrichOrdersWithUnread,
  enrichLogsWithUnread,
  formatBadgeText
};
