function normalizeCityName(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/特别行政区$/g, '')
    .replace(/维吾尔自治区$|壮族自治区$|回族自治区$|自治区$/g, '')
    .replace(/省$/g, '')
    .replace(/市$|地区$|盟$|自治州$|州$/g, '');
}

function isPrivateIp(ip) {
  const text = String(ip || '').trim().replace(/^::ffff:/, '');
  if (!text || text === '127.0.0.1' || text === '::1' || text === '0.0.0.0') return true;
  if (text.startsWith('10.') || text.startsWith('192.168.') || text.startsWith('169.254.')) return true;
  const m = text.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function clientIp(req) {
  if (!req) return '';
  const forwarded = String(req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) || '')
    .split(',')[0]
    .trim();
  const raw = forwarded
    || req.ip
    || (req.connection && req.connection.remoteAddress)
    || (req.socket && req.socket.remoteAddress)
    || '';
  return String(raw).replace(/^::ffff:/, '').trim();
}

function storeRegionBlob(doc) {
  return [
    doc && doc.addressRegion,
    doc && doc.address,
    doc && doc.locationName
  ].filter(Boolean).join('');
}

function storeMatchesCity(doc, city, province) {
  const wantCity = normalizeCityName(city);
  if (!wantCity) return false;
  const blob = storeRegionBlob(doc).replace(/\s+/g, '');
  if (!blob) return false;
  if (blob.includes(String(city || '')) || blob.includes(wantCity)) return true;
  const wantProvince = normalizeCityName(province);
  if (wantProvince && wantCity && blob.includes(wantProvince) && blob.includes(wantCity)) return true;
  return false;
}

module.exports = {
  normalizeCityName,
  isPrivateIp,
  clientIp,
  storeMatchesCity
};
