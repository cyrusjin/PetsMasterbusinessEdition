const { formatOrderStatus } = require('./orderStatus');
const { formatOrderCreateTime } = require('./util');
const { resolveOrderDisplayNo } = require('./displayNo');

const LEG_OUTBOUND = 'outbound';
const LEG_RETURN = 'return';

function isOutboundPickupPending(order) {
  if (!order || !order.needPickup) return false;
  if (order.status !== 'awaiting_arrival') return false;
  if (order.pickupIncludeOutbound === false) return false;
  return !order.pickupOutboundDone;
}

function isReturnPickupPending(order) {
  if (!order || !order.needPickup) return false;
  if (order.status !== 'boarding') return false;
  if (order.pickupIncludeReturn === false) return false;
  return !order.pickupReturnDone;
}

function isPickupManageOrder(order) {
  if (!order || !order.needPickup) return false;
  if (!['awaiting_arrival', 'boarding'].includes(order.status)) return false;
  return isOutboundPickupPending(order) || isReturnPickupPending(order);
}

function filterPickupOrders(orders, leg) {
  const list = (orders || []).filter((order) => {
    if (!isPickupManageOrder(order)) return false;
    if (leg === LEG_OUTBOUND) return isOutboundPickupPending(order);
    if (leg === LEG_RETURN) return isReturnPickupPending(order);
    return true;
  });

  return list.sort((a, b) => {
    const ta = a.pickupTime || a.startTime || '';
    const tb = b.pickupTime || b.startTime || '';
    if (ta !== tb) return ta.localeCompare(tb);
    return (b.createTime || 0) - (a.createTime || 0);
  });
}

function countPendingPickupTasks(orders) {
  const outbound = filterPickupOrders(orders, LEG_OUTBOUND).length;
  const ret = filterPickupOrders(orders, LEG_RETURN).length;
  return outbound + ret;
}

function formatPickupTime(order, leg) {
  if (leg === LEG_RETURN) {
    const date = order.endDate || '';
    const time = order.endTime || order.pickupTime || '';
    return [date, time].filter(Boolean).join(' ') || '--';
  }
  const date = order.startDate || '';
  const time = order.pickupTime || order.startTime || '';
  return [date, time].filter(Boolean).join(' ') || '--';
}

function buildPickupListItem(order, leg) {
  const phone = (order.pickupContactPhone || order.contactPhone || '').trim();
  const address = (order.pickupAddress || order.pickupLocationName || '').trim() || '--';
  const hasCoords = order.pickupLatitude != null && order.pickupLatitude !== ''
    && order.pickupLongitude != null && order.pickupLongitude !== '';

  return {
    id: order.id || order.order_id,
    displayNo: resolveOrderDisplayNo(order),
    petName: order.petName || '宠物',
    petPhoto: order.petPhoto || '',
    contactName: order.contactName || order.userNickName || '宠主',
    contactPhone: phone,
    pickupAddress: address,
    pickupLocationName: order.pickupLocationName || '',
    pickupLatitude: order.pickupLatitude,
    pickupLongitude: order.pickupLongitude,
    hasCoords,
    pickupTimeText: formatPickupTime(order, leg),
    createTimeText: formatOrderCreateTime(order) || '--',
    status: order.status,
    statusLabel: formatOrderStatus(order.status),
    leg,
    legLabel: leg === LEG_OUTBOUND ? '接' : '送',
    shippingFee: order.shippingFee != null ? order.shippingFee : 0
  };
}

function buildPickupList(orders, leg) {
  return filterPickupOrders(orders, leg).map((order) => buildPickupListItem(order, leg));
}

function formatPickupProgress(order) {
  if (!order || !order.needPickup) return '';
  const parts = [];
  if (order.pickupIncludeOutbound !== false) {
    parts.push(order.pickupOutboundDone ? '接宠已完成' : '接宠待完成');
  }
  if (order.pickupIncludeReturn !== false) {
    parts.push(order.pickupReturnDone ? '送返已完成' : '送返待完成');
  }
  return parts.join(' · ');
}

module.exports = {
  LEG_OUTBOUND,
  LEG_RETURN,
  isOutboundPickupPending,
  isReturnPickupPending,
  isPickupManageOrder,
  filterPickupOrders,
  countPendingPickupTasks,
  buildPickupList,
  formatPickupProgress
};
