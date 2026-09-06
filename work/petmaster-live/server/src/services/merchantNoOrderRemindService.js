const db = require('../db');
const notifyService = require('./notifyService');

const REMIND_HOUR = 21;
const REMIND_MINUTE = 0;

let timer = null;
let running = false;

function shanghaiParts(ts = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = {};
  fmt.formatToParts(new Date(ts)).forEach((p) => {
    if (p.type !== 'literal') parts[p.type] = p.value;
  });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

/** 上海时区当天 00:00 的时间戳 */
function shanghaiDayStartMs(ts) {
  const p = shanghaiParts(ts);
  return Date.UTC(p.year, p.month - 1, p.day) - 8 * 3600 * 1000;
}

/** 指定自然日 21:00:00（上海）的时间戳 */
function shanghaiRemindAtMs(dayStartMs) {
  return dayStartMs + REMIND_HOUR * 3600 * 1000 + REMIND_MINUTE * 60 * 1000;
}

/**
 * 下一个准时推送点：今天/明天 21:00:00（上海）。
 * 若当前已过今天 21:00:30，则排到明天，避免重启时在整点后重复扫。
 */
function nextRemindAtMs(now = Date.now()) {
  const todayStart = shanghaiDayStartMs(now);
  const todayRemind = shanghaiRemindAtMs(todayStart);
  if (now < todayRemind + 30 * 1000) return todayRemind;
  return shanghaiRemindAtMs(todayStart + 24 * 3600 * 1000);
}

/**
 * 第一个自然日 = 审核通过日（approvedAt）
 * 第二个自然日晚上 21:00 准时触发
 */
function isSecondNaturalDayEvening(approvedAt, now = Date.now()) {
  const passAt = Number(approvedAt) || 0;
  if (!passAt) return false;
  const secondDayStart = shanghaiDayStartMs(passAt) + 24 * 3600 * 1000;
  const secondDayEnd = secondDayStart + 24 * 3600 * 1000;
  if (now < secondDayStart || now >= secondDayEnd) return false;
  const p = shanghaiParts(now);
  return p.hour === REMIND_HOUR && p.minute === REMIND_MINUTE;
}

function isRemindWindow(now = Date.now()) {
  const p = shanghaiParts(now);
  return p.hour === REMIND_HOUR && p.minute === REMIND_MINUTE;
}

async function storeHasOrders(storeId) {
  if (!storeId) return true;
  const rows = await db.findMany('orders', { store_id: storeId }, { limit: 1 });
  return !!(rows && rows.length);
}

async function markRemindSent(storeDoc, now = Date.now()) {
  if (!storeDoc || !storeDoc._id) return;
  await db.updateById('stores', storeDoc._id, {
    noOrderRemindSentAt: now,
    updateTime: now
  });
}

async function processDueNoOrderReminds(now = Date.now()) {
  if (!isRemindWindow(now)) {
    return { scanned: 0, sent: 0, skipped: 0 };
  }

  // 今天是「第二个自然日」→ 审核通过落在「昨天」这个自然日内
  const todayStart = shanghaiDayStartMs(now);
  const approvedDayStart = todayStart - 24 * 3600 * 1000;

  const stores = await db.findMany(
    'stores',
    {
      merchantApplyStatus: 'approved',
      approvedAt: { $gte: approvedDayStart, $lt: todayStart },
      $or: [
        { noOrderRemindSentAt: { $exists: false } },
        { noOrderRemindSentAt: null },
        { noOrderRemindSentAt: 0 }
      ]
    },
    { limit: 300, sort: { approvedAt: -1 } }
  );

  let scanned = 0;
  let sent = 0;
  let skipped = 0;

  for (const store of stores || []) {
    scanned += 1;
    if (Number(store.noOrderRemindSentAt) > 0) {
      skipped += 1;
      continue;
    }
    const approvedAt = Number(store.approvedAt) || 0;
    if (!isSecondNaturalDayEvening(approvedAt, now)) {
      skipped += 1;
      continue;
    }
    const hasOrders = await storeHasOrders(store.store_id);
    if (hasOrders) {
      await markRemindSent(store, now);
      skipped += 1;
      continue;
    }

    const result = await notifyService.notifyMerchantNoOrderGuide(store);
    await markRemindSent(store, now);
    if (result) sent += 1;
    else skipped += 1;
  }

  return { scanned, sent, skipped };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await processDueNoOrderReminds();
    console.log(
      `[merchant-no-order] 21:00 tick scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped}`
    );
  } catch (err) {
    console.error('[merchant-no-order] tick failed', (err && err.message) || err);
  } finally {
    running = false;
  }
}

function scheduleNextRemind() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const now = Date.now();
  let target = nextRemindAtMs(now);
  // 若已到点（含重启刚好落在 21:00），立刻执行
  let delay = Math.max(target - now, 0);
  // 保护：过长 setTimeout 在部分环境不准，超过 6h 先睡一段再重算
  const MAX_DELAY = 6 * 3600 * 1000;
  if (delay > MAX_DELAY) {
    timer = setTimeout(() => {
      scheduleNextRemind();
    }, MAX_DELAY);
    if (typeof timer.unref === 'function') timer.unref();
    const p = shanghaiParts(target);
    console.log(
      `[merchant-no-order] next remind ${p.year}-${p.month}-${p.day} ${String(REMIND_HOUR).padStart(2, '0')}:00 (sleep chunk)`
    );
    return;
  }

  timer = setTimeout(async () => {
    await tick();
    // 推完后排明天 21:00
    scheduleNextRemind();
  }, delay || 1);
  if (typeof timer.unref === 'function') timer.unref();

  const p = shanghaiParts(now + delay);
  console.log(
    `[merchant-no-order] scheduled at ${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(REMIND_HOUR).padStart(2, '0')}:00 (+${Math.round(delay / 1000)}s)`
  );
}

function startMerchantNoOrderRemindWorker() {
  scheduleNextRemind();
}

module.exports = {
  startMerchantNoOrderRemindWorker,
  processDueNoOrderReminds,
  isSecondNaturalDayEvening,
  storeHasOrders,
  nextRemindAtMs,
  REMIND_HOUR,
  REMIND_MINUTE
};
