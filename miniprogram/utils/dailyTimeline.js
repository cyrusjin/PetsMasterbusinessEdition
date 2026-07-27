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
  if (log.createTime) {
    const date = new Date(log.createTime);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const text = log.time || '';
  const match = text.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : text;
}

function groupLogsByDate(logs) {
  const map = {};
  (logs || []).forEach((log) => {
    const dateKey = toDateKey(log.createTime) || toDateKey(log.time) || '未知日期';
    if (!map[dateKey]) map[dateKey] = [];
    map[dateKey].push({
      ...log,
      timeLabel: formatTimeLabel(log)
    });
  });

  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => ({
      dateKey,
      dateLabel: formatDateLabel(dateKey),
      logs: map[dateKey].sort((a, b) => (b.createTime || 0) - (a.createTime || 0))
    }));
}

module.exports = {
  groupLogsByDate,
  formatTimeLabel,
  formatDateLabel,
  toDateKey
};
