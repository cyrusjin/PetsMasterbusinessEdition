function pad(num) {
  return String(num).padStart(2, '0');
}

function toDateKey(input) {
  if (!input) return '';
  if (typeof input === 'number') {
    const date = new Date(input);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const text = String(input);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function formatDateLabel(dateKey) {
  if (!dateKey) return '';
  const parts = dateKey.split('-');
  if (parts.length === 3) {
    return `${Number(parts[0])}年${Number(parts[1])}月${Number(parts[2])}日`;
  }
  return dateKey;
}

function formatTimeLabel(log) {
  const scheduled = log && (log.status === 'scheduled' || log.isScheduled);
  const scheduledAt = Number(log && log.scheduledAt) || 0;
  if (scheduled && scheduledAt) {
    const date = new Date(scheduledAt);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (log && log.createTime) {
    const date = new Date(log.createTime);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const text = (log && log.time) || '';
  const match = text.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : text;
}

function resolveLogDateKey(log) {
  const scheduled = log && (log.status === 'scheduled' || log.isScheduled);
  const scheduledAt = Number(log && log.scheduledAt) || 0;
  if (scheduled && scheduledAt) return toDateKey(scheduledAt);
  return toDateKey(log && log.createTime) || toDateKey(log && log.time) || '未知日期';
}

function groupLogsByDate(logs) {
  const map = {};
  (logs || []).forEach((log) => {
    const scheduled = log.status === 'scheduled' || !!log.isScheduled;
    const dateKey = resolveLogDateKey(log);
    if (!map[dateKey]) map[dateKey] = [];
    map[dateKey].push({
      ...log,
      isScheduled: scheduled,
      canDeleteScheduled: scheduled,
      timeLabel: formatTimeLabel(log)
    });
  });

  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => ({
      dateKey,
      dateLabel: formatDateLabel(dateKey),
      logs: map[dateKey].sort((a, b) => {
        const aTs = Number(a.scheduledAt) || a.createTime || 0;
        const bTs = Number(b.scheduledAt) || b.createTime || 0;
        return bTs - aTs;
      })
    }));
}

module.exports = {
  groupLogsByDate,
  formatTimeLabel,
  formatDateLabel,
  toDateKey,
  resolveLogDateKey
};
