const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function buildRandomDisplayNo(length = 10) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function deriveDisplayNo(seed, length = 10) {
  const str = String(seed || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = '';
  let state = hash >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += CODE_CHARS[state % CODE_CHARS.length];
  }
  return out;
}

function formatOrderDisplayTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/** 订单号：店铺编号 + yyyyMMddHHmmss + 4位随机 */
function buildOrderDisplayNo(storeDisplayNo, now = Date.now()) {
  const storePart = String(storeDisplayNo || '').trim() || '00000000';
  const timePart = formatOrderDisplayTime(new Date(now));
  const randomPart = buildRandomDisplayNo(4);
  return `${storePart}${timePart}${randomPart}`;
}

function resolveOrderDisplayNo(order) {
  if (!order) return '';
  if (order.displayNo) return String(order.displayNo).trim();
  const seed = order.order_id || order.id || '';
  return seed ? deriveDisplayNo(`order:${seed}`) : '';
}

function resolveStoreDisplayNo(store) {
  if (!store) return '';
  if (store.displayNo) return String(store.displayNo).trim();
  const seed = store.store_id || '';
  return seed ? deriveDisplayNo(`store:${seed}`, 8) : '';
}

function attachOrderDisplayNo(order) {
  if (!order || typeof order !== 'object') return order;
  const displayNo = resolveOrderDisplayNo(order);
  if (order.displayNo === displayNo) return order;
  return { ...order, displayNo };
}

function attachStoreDisplayNo(store) {
  if (!store || typeof store !== 'object') return store;
  const displayNo = resolveStoreDisplayNo(store);
  if (store.displayNo === displayNo) return store;
  return { ...store, displayNo };
}

module.exports = {
  CODE_CHARS,
  buildRandomDisplayNo,
  buildOrderDisplayNo,
  deriveDisplayNo,
  resolveOrderDisplayNo,
  resolveStoreDisplayNo,
  attachOrderDisplayNo,
  attachStoreDisplayNo
};
