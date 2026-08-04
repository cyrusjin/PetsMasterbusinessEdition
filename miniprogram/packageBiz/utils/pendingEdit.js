function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return String(Math.round(num * 100) / 100);
}

function boolText(value) {
  return value ? '需要' : '不需要';
}

/**
 * 对比订单当前值与 pendingEdit，生成可读变更摘要
 * @returns {string[]}
 */
function buildPendingEditLines(order) {
  if (!order || !order.pendingEdit) return [];
  const p = order.pendingEdit;
  const lines = [];

  const curStart = `${order.startDate || ''} ${order.startTime || ''}`.trim();
  const nextStart = `${p.startDate != null ? p.startDate : order.startDate || ''} ${p.startTime != null ? p.startTime : order.startTime || ''}`.trim();
  const curEnd = `${order.endDate || ''} ${order.endTime || ''}`.trim();
  const nextEnd = `${p.endDate != null ? p.endDate : order.endDate || ''} ${p.endTime != null ? p.endTime : order.endTime || ''}`.trim();

  if ((p.startDate != null || p.startTime != null) && nextStart && nextStart !== curStart) {
    lines.push(`入住：${curStart || '--'} → ${nextStart}`);
  }
  if ((p.endDate != null || p.endTime != null) && nextEnd && nextEnd !== curEnd) {
    lines.push(`离店：${curEnd || '--'} → ${nextEnd}`);
  }
  if (p.days != null && Number(p.days) !== Number(order.days)) {
    lines.push(`天数：${order.days || 0}天 → ${p.days}天`);
  }
  if (p.needWash !== undefined && !!p.needWash !== !!order.needWash) {
    lines.push(`洗护：${boolText(order.needWash)} → ${boolText(p.needWash)}`);
  } else if (p.needWash && p.washFee != null && Number(p.washFee) !== Number(order.washFee || 0)) {
    lines.push(`洗护费：¥${formatMoney(order.washFee)} → ¥${formatMoney(p.washFee)}`);
  }
  if (p.needPickup !== undefined && !!p.needPickup !== !!order.needPickup) {
    lines.push(`接送：${boolText(order.needPickup)} → ${boolText(p.needPickup)}`);
  }
  if (p.totalFee != null && Number(p.totalFee) !== Number(order.totalFee)) {
    lines.push(`总费用：¥${formatMoney(order.totalFee)} → ¥${formatMoney(p.totalFee)}`);
  } else if (p.boardingFee != null && Number(p.boardingFee) !== Number(order.boardingFee)) {
    lines.push(`寄养费：¥${formatMoney(order.boardingFee)} → ¥${formatMoney(p.boardingFee)}`);
  }
  if (p.contactName != null && String(p.contactName) !== String(order.contactName || '')) {
    lines.push(`联系人：${order.contactName || '--'} → ${p.contactName || '--'}`);
  }
  if (p.contactPhone != null && String(p.contactPhone) !== String(order.contactPhone || '')) {
    lines.push(`联系电话：${order.contactPhone || '--'} → ${p.contactPhone || '--'}`);
  }
  if (p.specialNeeds != null && String(p.specialNeeds) !== String(order.specialNeeds || '')) {
    lines.push('已更新特殊需求');
  }

  if (!lines.length && Object.keys(p).some((k) => k !== 'submittedAt')) {
    lines.push('用户提交了订单修改');
  }
  return lines;
}

function getPendingEditTotalFee(order) {
  if (!order || !order.pendingEdit) return null;
  const fee = order.pendingEdit.totalFee;
  return fee != null && Number.isFinite(Number(fee)) ? Number(fee) : null;
}

module.exports = {
  buildPendingEditLines,
  getPendingEditTotalFee
};
