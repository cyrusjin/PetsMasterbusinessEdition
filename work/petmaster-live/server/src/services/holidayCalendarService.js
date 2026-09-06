const https = require('https');

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const memoryCache = new Map();

const FESTIVAL_ORDER = [
  'newYear',
  'springFestival',
  'qingming',
  'laborDay',
  'dragonBoat',
  'midAutumn',
  'nationalDay'
];

const FESTIVAL_NAMES = {
  newYear: '元旦',
  springFestival: '春节',
  qingming: '清明节',
  laborDay: '劳动节',
  dragonBoat: '端午节',
  midAutumn: '中秋节',
  nationalDay: '国庆节'
};

/** 将上游节日名归一到节日分组 */
const NAME_TO_FESTIVAL = {
  元旦: 'newYear',
  元旦节: 'newYear',
  春节: 'springFestival',
  除夕: 'springFestival',
  初一: 'springFestival',
  初二: 'springFestival',
  初三: 'springFestival',
  初四: 'springFestival',
  初五: 'springFestival',
  初六: 'springFestival',
  初七: 'springFestival',
  清明: 'qingming',
  清明节: 'qingming',
  劳动节: 'laborDay',
  端午: 'dragonBoat',
  端午节: 'dragonBoat',
  中秋: 'midAutumn',
  中秋节: 'midAutumn',
  国庆: 'nationalDay',
  国庆节: 'nationalDay'
};

/** API 不可用时的 2026 放假休息日兜底（国务院安排） */
const FALLBACK_BY_YEAR = {
  2026: [
    {
      id: 'newYear',
      name: '元旦',
      days: [
        { date: '2026-01-01', dayName: '元旦' },
        { date: '2026-01-02', dayName: '元旦假期' },
        { date: '2026-01-03', dayName: '元旦假期' }
      ]
    },
    {
      id: 'springFestival',
      name: '春节',
      days: [
        { date: '2026-02-15', dayName: '春节假期' },
        { date: '2026-02-16', dayName: '除夕' },
        { date: '2026-02-17', dayName: '初一' },
        { date: '2026-02-18', dayName: '初二' },
        { date: '2026-02-19', dayName: '初三' },
        { date: '2026-02-20', dayName: '初四' },
        { date: '2026-02-21', dayName: '初五' },
        { date: '2026-02-22', dayName: '初六' },
        { date: '2026-02-23', dayName: '初七' }
      ]
    },
    {
      id: 'qingming',
      name: '清明节',
      days: [
        { date: '2026-04-04', dayName: '清明假期' },
        { date: '2026-04-05', dayName: '清明' },
        { date: '2026-04-06', dayName: '清明假期' }
      ]
    },
    {
      id: 'laborDay',
      name: '劳动节',
      days: [
        { date: '2026-05-01', dayName: '劳动节' },
        { date: '2026-05-02', dayName: '劳动节假期' },
        { date: '2026-05-03', dayName: '劳动节假期' },
        { date: '2026-05-04', dayName: '劳动节假期' },
        { date: '2026-05-05', dayName: '劳动节假期' }
      ]
    },
    {
      id: 'dragonBoat',
      name: '端午节',
      days: [
        { date: '2026-06-19', dayName: '端午' },
        { date: '2026-06-20', dayName: '端午假期' },
        { date: '2026-06-21', dayName: '端午假期' }
      ]
    },
    {
      id: 'midAutumn',
      name: '中秋节',
      days: [
        { date: '2026-09-25', dayName: '中秋' },
        { date: '2026-09-26', dayName: '中秋假期' },
        { date: '2026-09-27', dayName: '中秋假期' }
      ]
    },
    {
      id: 'nationalDay',
      name: '国庆节',
      days: [
        { date: '2026-10-01', dayName: '国庆' },
        { date: '2026-10-02', dayName: '国庆假期' },
        { date: '2026-10-03', dayName: '国庆假期' },
        { date: '2026-10-04', dayName: '国庆假期' },
        { date: '2026-10-05', dayName: '国庆假期' },
        { date: '2026-10-06', dayName: '国庆假期' },
        { date: '2026-10-07', dayName: '国庆假期' }
      ]
    }
  ]
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateLabel(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr || '';
  return `${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
}

function resolveFestivalId(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  if (NAME_TO_FESTIVAL[text]) return NAME_TO_FESTIVAL[text];
  const hit = Object.keys(NAME_TO_FESTIVAL).find((key) => text.indexOf(key) >= 0);
  return hit ? NAME_TO_FESTIVAL[hit] : '';
}

function decorateGroups(groups, year) {
  return (groups || []).map((group) => ({
    id: group.id,
    name: group.name || FESTIVAL_NAMES[group.id] || group.id,
    year,
    days: (group.days || []).map((day) => ({
      date: day.date,
      label: day.label || formatDateLabel(day.date),
      dayName: day.dayName || day.name || (group.name || ''),
      custom: !!day.custom
    })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }));
}

function buildGroupsFromTimorHoliday(holidayMap, year) {
  const buckets = {};
  Object.keys(holidayMap || {}).forEach((mmdd) => {
    const item = holidayMap[mmdd] || {};
    // 只取放假休息日，排除补班日
    if (!item.holiday) return;
    const date = item.date || `${year}-${mmdd}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const festivalId = resolveFestivalId(item.name) || resolveFestivalId(item.target);
    if (!festivalId) return;
    if (!buckets[festivalId]) {
      buckets[festivalId] = {
        id: festivalId,
        name: FESTIVAL_NAMES[festivalId] || item.name || festivalId,
        days: []
      };
    }
    const exists = buckets[festivalId].days.some((d) => d.date === date);
    if (exists) return;
    buckets[festivalId].days.push({
      date,
      label: formatDateLabel(date),
      dayName: item.name || FESTIVAL_NAMES[festivalId] || '休息日'
    });
  });

  return FESTIVAL_ORDER
    .filter((id) => buckets[id] && buckets[id].days.length)
    .map((id) => buckets[id])
    .concat(
      Object.keys(buckets)
        .filter((id) => FESTIVAL_ORDER.indexOf(id) < 0)
        .map((id) => buckets[id])
    );
}

function getFallbackGroups(year) {
  const y = parseInt(year, 10);
  const groups = FALLBACK_BY_YEAR[y];
  if (!groups) return [];
  return decorateGroups(groups, y);
}

function getCached(year) {
  const hit = memoryCache.get(String(year));
  if (!hit) return null;
  if (Date.now() > hit.expireAt) {
    memoryCache.delete(String(year));
    return null;
  }
  return hit.value;
}

function setCached(year, value) {
  memoryCache.set(String(year), {
    value,
    expireAt: Date.now() + CACHE_TTL_MS
  });
}

async function fetchTimorYear(year) {
  const url = `https://timor.tech/api/holiday/year/${year}`;
  const data = await new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 10000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PetMasterServer/1.0'
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('休息日接口超时'));
    });
  });
  if (!data || data.code !== 0 || !data.holiday) {
    const err = new Error((data && data.message) || '休息日接口返回异常');
    err.code = 'HOLIDAY_API_BAD_RESPONSE';
    throw err;
  }
  return data.holiday;
}

async function getRestDayGroups(year) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  if (y < 2010 || y > 2100) {
    const err = new Error('年份无效');
    err.code = 'INVALID_YEAR';
    throw err;
  }

  const cached = getCached(y);
  if (cached) return cached;

  let groups = [];
  let source = 'fallback';
  try {
    const holidayMap = await fetchTimorYear(y);
    groups = decorateGroups(buildGroupsFromTimorHoliday(holidayMap, y), y);
    if (!groups.length) {
      groups = getFallbackGroups(y);
      source = groups.length ? 'fallback' : 'empty';
    } else {
      source = 'timor';
    }
  } catch (err) {
    console.warn('[holidayCalendar] fetch failed', y, err.message || err);
    groups = getFallbackGroups(y);
    source = groups.length ? 'fallback' : 'empty';
  }

  const payload = {
    success: true,
    year: y,
    source,
    groups,
    updatedAt: Date.now()
  };
  if (groups.length) setCached(y, payload);
  return payload;
}

function getAvailableYears() {
  const nowY = new Date().getFullYear();
  const years = [nowY - 1, nowY, nowY + 1];
  Object.keys(FALLBACK_BY_YEAR).forEach((y) => {
    const n = parseInt(y, 10);
    if (years.indexOf(n) < 0) years.push(n);
  });
  return years.filter((y) => y >= 2010 && y <= 2100).sort((a, b) => a - b);
}

module.exports = {
  getRestDayGroups,
  getAvailableYears,
  formatDateLabel,
  FESTIVAL_NAMES,
  FESTIVAL_ORDER
};
