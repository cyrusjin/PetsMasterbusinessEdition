function getVisitSnapshot(order) {
  const snap = order && order.feeSnapshot && order.feeSnapshot.visit;
  return snap && typeof snap === 'object' ? snap : {};
}

function attachVisitAddressFields(order) {
  if (!order || typeof order !== 'object') return order;
  const visit = getVisitSnapshot(order);
  return {
    ...order,
    visitAddress: String(order.visitAddress || visit.address || '').trim(),
    visitLocationName: String(order.visitLocationName || visit.locationName || '').trim(),
    visitRoomNo: String(order.visitRoomNo || visit.roomNo || '').trim(),
    visitEntryMethod: String(order.visitEntryMethod || visit.entryMethod || '').trim()
  };
}

function formatHomeVisitTimeText(order) {
  const date = String((order && order.startDate) || '').trim();
  const endDate = String((order && order.endDate) || '').trim();
  const start = String((order && order.startTime) || '').trim();
  if (!date && !start) return '';
  const dayText = endDate && endDate !== date ? `${date} ~ ${endDate}` : date;
  return `${dayText} ${start}`.trim();
}

module.exports = {
  getVisitSnapshot,
  attachVisitAddressFields,
  formatHomeVisitTimeText
};
