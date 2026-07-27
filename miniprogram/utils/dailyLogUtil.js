function getLogId(log) {
  if (!log) return '';
  return log.id || log.log_id || '';
}

function dedupeDailyLogs(logs) {
  const map = new Map();
  (logs || []).forEach((log) => {
    const id = getLogId(log);
    if (!id) return;
    const existing = map.get(id);
    if (!existing || (log.createTime || 0) >= (existing.createTime || 0)) {
      map.set(id, log);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
}

module.exports = {
  getLogId,
  dedupeDailyLogs
};
