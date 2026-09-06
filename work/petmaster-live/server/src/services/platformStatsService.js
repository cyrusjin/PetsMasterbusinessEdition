const db = require('../db');
const identity = require('./identity');
const mapService = require('./mapService');
const userFields = require('./userFields');

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'awaiting_arrival',
  'boarding',
  'toPay',
  'completed',
  'cancelled'
];

const ACTIVE_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'awaiting_arrival',
  'boarding',
  'toPay'
];

const FUNNEL_STATUSES = [
  'pending',
  'confirmed',
  'awaiting_arrival',
  'boarding',
  'toPay',
  'completed'
];

const PROVINCE_NAMES =
  '河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆';

/** 仪表盘排除的测试店主：其名下现有及以后新开的店都不计入 KPI / 地图 / 榜单 / 营业额 */
const DASHBOARD_EXCLUDED_OWNER_OPENIDS = [
  'omhI83VM9KWEJ73tfA8UWwapasjg' // 五哥测试账号
];

/** 历史测试店兜底（含已删店铺上的旧订单） */
const DASHBOARD_EXCLUDED_STORE_IDS = [
  'store_1785393933242_ls35px', // 测试店铺0730
  'store_1785816921000_vi3gz4', // 测试店铺 0804
  'store_1785400986659_xu3tca', // 测试店铺 0530
  'store_1786369931157_qflhbd', // 五哥的测试店铺（已删）
  'store_1787060887371_mctkho' // 五哥的测试店铺0818
];

let resolvedExcludedStoreIds = DASHBOARD_EXCLUDED_STORE_IDS.slice();

async function refreshExcludedStoreIds() {
  const owned = await db.collection('stores')
    .find({ ownerOpenid: { $in: DASHBOARD_EXCLUDED_OWNER_OPENIDS } })
    .project({ store_id: 1 })
    .toArray();
  resolvedExcludedStoreIds = [...new Set([
    ...DASHBOARD_EXCLUDED_STORE_IDS,
    ...owned.map((s) => String(s.store_id || '').trim()).filter(Boolean)
  ])];
  return resolvedExcludedStoreIds;
}

function excludedStoreIdMatch(field = 'store_id') {
  return { [field]: { $nin: resolvedExcludedStoreIds } };
}

function isExcludedStoreId(storeId) {
  return resolvedExcludedStoreIds.includes(String(storeId || ''));
}

function isExcludedOwnerOpenid(openid) {
  return DASHBOARD_EXCLUDED_OWNER_OPENIDS.includes(String(openid || ''));
}

function collectUserOpenids(doc) {
  return identity.collectOpenids(doc).filter(Boolean);
}

/**
 * 招商看板用户：商家 = 已开通店的店主 + 员工；客人 = 其余注册用户。
 * 同一人在双端 openid 下只计 1。
 */
async function countMerchantAndGuestUsers(usersCol, storeDocs, excludedUserMatch) {
  const ownerOpenids = new Set();
  const staffOpenids = new Set();

  (storeDocs || []).forEach((store) => {
    if (!store || store.merchantApplyStatus !== 'approved') return;
    if (isExcludedStoreId(store.store_id)) return;
    const owner = String(store.ownerOpenid || '').trim();
    if (owner && !isExcludedOwnerOpenid(owner)) ownerOpenids.add(owner);
    (Array.isArray(store.staffOpenids) ? store.staffOpenids : []).forEach((id) => {
      const staff = String(id || '').trim();
      if (!staff || isExcludedOwnerOpenid(staff)) return;
      staffOpenids.add(staff);
    });
  });

  const storeMerchantOpenids = [...new Set([...ownerOpenids, ...staffOpenids])];
  const [flaggedUsers, linkedUsers] = await Promise.all([
    usersCol.find({
      ...excludedUserMatch,
      $or: [
        { isMerchant: true },
        { isMerchant: 1 },
        { isMerchant: 'true' },
        { merchantStatus: 'approved' },
        { merchantRole: 'staff' }
      ]
    }).project({
      openid: 1,
      openids: 1,
      linkedOpenids: 1,
      merchantRole: 1,
      merchantStatus: 1,
      isMerchant: 1
    }).toArray(),
    storeMerchantOpenids.length
      ? usersCol.find({
          ...excludedUserMatch,
          $or: [
            { openid: { $in: storeMerchantOpenids } },
            { 'openids.user': { $in: storeMerchantOpenids } },
            { 'openids.merchant': { $in: storeMerchantOpenids } },
            { linkedOpenids: { $in: storeMerchantOpenids } }
          ]
        }).project({
          openid: 1,
          openids: 1,
          linkedOpenids: 1,
          merchantRole: 1,
          merchantStatus: 1,
          isMerchant: 1
        }).toArray()
      : Promise.resolve([])
  ]);

  const merchantById = new Map();
  const matchedOpenids = new Set();
  const rememberMerchant = (doc) => {
    if (!doc || !doc._id) return;
    merchantById.set(String(doc._id), doc);
    collectUserOpenids(doc).forEach((id) => matchedOpenids.add(id));
  };
  (flaggedUsers || []).forEach(rememberMerchant);
  (linkedUsers || []).forEach(rememberMerchant);

  const unmatchedOwnerOpenids = [...ownerOpenids].filter((id) => !matchedOpenids.has(id));
  const unmatchedStaffOpenids = [...staffOpenids].filter((id) => !matchedOpenids.has(id) && !ownerOpenids.has(id));

  let merchantOwnerCount = unmatchedOwnerOpenids.length;
  let merchantStaffCount = unmatchedStaffOpenids.length;
  merchantById.forEach((doc) => {
    const ids = collectUserOpenids(doc);
    const isOwner = ids.some((id) => ownerOpenids.has(id))
      || String(doc.merchantRole || '').toLowerCase() === 'owner'
      || (userFields.isMerchantApprovedFromDoc(doc) && String(doc.merchantRole || '').toLowerCase() !== 'staff');
    if (isOwner) merchantOwnerCount += 1;
    else merchantStaffCount += 1;
  });

  const merchantMongoIds = Array.from(merchantById.values()).map((doc) => doc._id);
  const guestUserCount = await usersCol.countDocuments({
    ...excludedUserMatch,
    ...(merchantMongoIds.length ? { _id: { $nin: merchantMongoIds } } : {}),
    isMerchant: { $nin: [true, 1, 'true'] },
    merchantStatus: { $ne: 'approved' },
    merchantRole: { $ne: 'staff' }
  });

  return {
    merchantUserCount: merchantById.size + unmatchedOwnerOpenids.length + unmatchedStaffOpenids.length,
    merchantOwnerCount,
    merchantStaffCount,
    guestUserCount: guestUserCount || 0
  };
}

function parseCoord(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch (err) {
    return '';
  }
}

function formatMoney(n) {
  const v = Number(n) || 0;
  return Math.round(v * 100) / 100;
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** 中国时区自然日 00:00 的 epoch ms；daysAgo=0 今天，1 昨天 */
function cnDayStart(daysAgo = 0, now = Date.now()) {
  const cn = new Date(now + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = cn.getUTCMonth();
  const d = cn.getUTCDate() - daysAgo;
  return Date.UTC(y, m, d) - 8 * 3600 * 1000;
}

function cnDayKey(ts) {
  const cn = new Date((Number(ts) || 0) + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = String(cn.getUTCMonth() + 1).padStart(2, '0');
  const d = String(cn.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function unknownRegion() {
  return { province: '未知', city: '', regionKey: '未知', regionLabel: '未知' };
}

/**
 * 从地址中提取省、市（仅到市一级，忽略 POI / 小区名）
 * 支持地址中部出现行政区，如「CLASS…陕西省西安市…」
 */
function parseRegion(address) {
  const text = String(address || '').replace(/\s+/g, '');
  if (!text) return unknownRegion();

  // 直辖市：市一级即为北京市等
  const muni = text.match(/(北京市|天津市|上海市|重庆市)/);
  if (muni) {
    const city = muni[1];
    const province = city.replace(/市$/, '');
    return {
      province,
      city,
      regionKey: `${province}|${city}`,
      regionLabel: city
    };
  }

  // 仅匹配标准省名，避免「栋陕西」这类误识别
  const withCity = text.match(
    new RegExp(
      `(${PROVINCE_NAMES})(?:省|维吾尔自治区|壮族自治区|回族自治区|自治区)?([\\u4e00-\\u9fa5]{2,6})(市|州|盟|地区)`
    )
  );
  if (withCity) {
    const province = withCity[1];
    const city = `${withCity[2]}${withCity[3]}`;
    return {
      province,
      city,
      regionKey: `${province}|${city}`,
      regionLabel: `${province}${city}`
    };
  }

  // 简写缺「市」：河南郑州
  const noSuffix = text.match(
    new RegExp(`(${PROVINCE_NAMES})([\\u4e00-\\u9fa5]{2,4})(?=区|县|\\d|$)`)
  );
  if (noSuffix) {
    const province = noSuffix[1];
    const city = `${noSuffix[2]}市`;
    return {
      province,
      city,
      regionKey: `${province}|${city}`,
      regionLabel: `${province}${city}`
    };
  }

  return unknownRegion();
}

function buildRegionSource(doc = {}) {
  return [doc.addressRegion, doc.address, doc.locationName].filter(Boolean).join(' ');
}

/**
 * 地址解析失败时，用腾讯逆地理补全省市
 * @returns {Promise<{ region: object, geocodeAddress: string }>}
 */
async function resolveStoreRegion(doc, latitude, longitude) {
  const regionSource = buildRegionSource(doc);
  let region = parseRegion(regionSource);
  if (region.province !== '未知') {
    return { region, geocodeAddress: '' };
  }
  if (latitude == null || longitude == null) {
    return { region, geocodeAddress: '' };
  }

  try {
    const geo = await mapService.reverseGeocode(latitude, longitude);
    const geoText = [geo.province, geo.city, geo.district, geo.address]
      .filter(Boolean)
      .join('');
    const parsed = parseRegion(geoText || geo.address);
    if (parsed.province !== '未知') {
      return {
        region: parsed,
        geocodeAddress: geo.address || `${geo.province || ''}${geo.city || ''}`
      };
    }
  } catch (err) {
    console.warn(
      '[dashboard] reverse geocode failed',
      doc && doc.store_id,
      (err && err.message) || err
    );
  }

  return { region, geocodeAddress: '' };
}

function emptyOrderStats() {
  const byStatus = {};
  ORDER_STATUSES.forEach((s) => {
    byStatus[s] = 0;
  });
  return {
    total: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    byStatus,
    lastOrderAt: 0,
    gmv: 0,
    completedGmv: 0
  };
}

function buildPeriodShell() {
  return {
    orderCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    cancelRate: 0,
    gmv: 0,
    boardingFee: 0,
    shippingFee: 0,
    aov: 0,
    avgDays: 0,
    pickupCount: 0,
    pickupRate: 0,
    activeStoreCount: 0,
    newUserCount: 0
  };
}

async function aggregatePeriodOrders(ordersCol, since, until) {
  const match = {
    createTime: { $gte: since },
    ...excludedStoreIdMatch()
  };
  if (until != null) match.createTime.$lt = until;

  const [row] = await ordersCol
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          gmv: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$totalFee', 0] },
                0
              ]
            }
          },
          boardingFee: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$boardingFee', 0] },
                0
              ]
            }
          },
          shippingFee: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$shippingFee', 0] },
                0
              ]
            }
          },
          daysSum: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$days', 0] },
                0
              ]
            }
          },
          pickupCount: {
            $sum: { $cond: [{ $eq: ['$needPickup', true] }, 1, 0] }
          },
          storeIds: { $addToSet: '$store_id' }
        }
      }
    ])
    .toArray();

  const out = buildPeriodShell();
  if (!row) return out;
  out.orderCount = row.orderCount || 0;
  out.completedCount = row.completedCount || 0;
  out.cancelledCount = row.cancelledCount || 0;
  out.cancelRate = pct(out.cancelledCount, out.orderCount);
  out.gmv = formatMoney(row.gmv);
  out.boardingFee = formatMoney(row.boardingFee);
  out.shippingFee = formatMoney(row.shippingFee);
  out.aov = out.completedCount ? formatMoney(out.gmv / out.completedCount) : 0;
  out.avgDays = out.completedCount ? round1((row.daysSum || 0) / out.completedCount) : 0;
  out.pickupCount = row.pickupCount || 0;
  out.pickupRate = pct(out.pickupCount, out.orderCount);
  out.activeStoreCount = (row.storeIds || []).filter(Boolean).length;
  return out;
}

function toCountList(rows, keyName = 'name') {
  return (rows || [])
    .map((r) => ({
      [keyName]: r._id == null || r._id === '' ? '未填写' : String(r._id),
      count: r.count || 0
    }))
    .sort((a, b) => b.count - a.count);
}

/** 将宠物类型归为猫 / 狗 / 其他，用于猫狗比例 */
function classifyPetSpecies(typeName) {
  const text = String(typeName || '').trim();
  if (!text || text === '未填写') return 'other';
  if (/猫/.test(text)) return 'cat';
  if (/犬|狗/.test(text)) return 'dog';
  return 'other';
}

function summarizeCatDogRatio(byTypeRows) {
  let catCount = 0;
  let dogCount = 0;
  let otherCount = 0;
  (byTypeRows || []).forEach((row) => {
    const count = row.count || 0;
    const kind = classifyPetSpecies(row.name);
    if (kind === 'cat') catCount += count;
    else if (kind === 'dog') dogCount += count;
    else otherCount += count;
  });
  const known = catCount + dogCount;
  return {
    catCount,
    dogCount,
    otherTypeCount: otherCount,
    catDogTotal: known,
    catRate: pct(catCount, known || 0),
    dogRate: pct(dogCount, known || 0)
  };
}

function ageBucket(age) {
  const n = parseFloat(age);
  if (!Number.isFinite(n) || n <= 0) return '未知';
  if (n < 1) return '0-1岁';
  if (n < 3) return '1-3岁';
  if (n < 7) return '3-7岁';
  if (n < 10) return '7-10岁';
  return '10岁+';
}

function weightBucket(weight) {
  const n = parseFloat(weight);
  if (!Number.isFinite(n) || n <= 0) return '未知';
  if (n < 5) return '0-5kg';
  if (n < 10) return '5-10kg';
  if (n < 20) return '10-20kg';
  if (n < 35) return '20-35kg';
  return '35kg+';
}

async function buildPetReport(now = Date.now()) {
  const petsCol = db.collection('pets');
  const ordersCol = db.collection('orders');
  const d7 = cnDayStart(7, now);
  const d30 = cnDayStart(30, now);

  const [
    total,
    new7,
    new30,
    byType,
    byGender,
    byBreed,
    healthAgg,
    sampleForBuckets,
    orderPetTypes,
    orderPetBreeds
  ] = await Promise.all([
    petsCol.countDocuments({}),
    petsCol.countDocuments({ createTime: { $gte: d7 } }),
    petsCol.countDocuments({ createTime: { $gte: d30 } }),
    petsCol.aggregate([
      { $group: { _id: { $ifNull: ['$type', ''] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray(),
    petsCol.aggregate([
      { $group: { _id: { $ifNull: ['$gender', ''] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray(),
    petsCol.aggregate([
      {
        $group: {
          _id: {
            $cond: [
              { $or: [{ $eq: ['$breed', null] }, { $eq: ['$breed', ''] }] },
              '未填写',
              '$breed'
            ]
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]).toArray(),
    petsCol.aggregate([
      {
        $group: {
          _id: null,
          vaccinated: {
            $sum: { $cond: [{ $eq: ['$vaccination', '已接种'] }, 1, 0] }
          },
          unvaccinated: {
            $sum: { $cond: [{ $eq: ['$vaccination', '未接种'] }, 1, 0] }
          },
          neutered: {
            $sum: { $cond: [{ $eq: ['$isNeutered', '是'] }, 1, 0] }
          },
          notNeutered: {
            $sum: { $cond: [{ $eq: ['$isNeutered', '否'] }, 1, 0] }
          },
          allergyYes: {
            $sum: { $cond: [{ $eq: ['$allergyStatus', '是'] }, 1, 0] }
          },
          medicalYes: {
            $sum: { $cond: [{ $eq: ['$medicalHistoryStatus', '是'] }, 1, 0] }
          },
          dogLicenseYes: {
            $sum: { $cond: [{ $eq: ['$hasDogLicense', '是'] }, 1, 0] }
          }
        }
      }
    ]).toArray(),
    petsCol.find({}).project({ age: 1, weight: 1 }).limit(2000).toArray(),
    ordersCol.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$petType', ''] },
          orderCount: { $sum: 1 },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          gmv: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$totalFee', 0] },
                0
              ]
            }
          }
        }
      },
      { $sort: { orderCount: -1 } }
    ]).toArray(),
    ordersCol.aggregate([
      {
        $group: {
          _id: {
            $cond: [
              {
                $or: [
                  { $eq: ['$petBreed', null] },
                  { $eq: ['$petBreed', ''] }
                ]
              },
              '未填写',
              '$petBreed'
            ]
          },
          orderCount: { $sum: 1 },
          gmv: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$totalFee', 0] },
                0
              ]
            }
          }
        }
      },
      { $sort: { orderCount: -1 } },
      { $limit: 15 }
    ]).toArray()
  ]);

  const health = (healthAgg && healthAgg[0]) || {};
  const ageBucketsMap = {};
  const weightBucketsMap = {};
  (sampleForBuckets || []).forEach((p) => {
    const ab = ageBucket(p.age);
    const wb = weightBucket(p.weight);
    ageBucketsMap[ab] = (ageBucketsMap[ab] || 0) + 1;
    weightBucketsMap[wb] = (weightBucketsMap[wb] || 0) + 1;
  });
  const ageOrder = ['0-1岁', '1-3岁', '3-7岁', '7-10岁', '10岁+', '未知'];
  const weightOrder = ['0-5kg', '5-10kg', '10-20kg', '20-35kg', '35kg+', '未知'];
  const byTypeList = toCountList(byType);
  const catDog = summarizeCatDogRatio(byTypeList);

  return {
    summary: {
      total: total || 0,
      new7d: new7 || 0,
      new30d: new30 || 0,
      vaccinatedRate: pct(health.vaccinated || 0, total || 0),
      neuteredRate: pct(health.neutered || 0, total || 0),
      allergyRate: pct(health.allergyYes || 0, total || 0),
      medicalHistoryRate: pct(health.medicalYes || 0, total || 0),
      dogLicenseRate: pct(health.dogLicenseYes || 0, total || 0),
      vaccinated: health.vaccinated || 0,
      unvaccinated: health.unvaccinated || 0,
      neutered: health.neutered || 0,
      notNeutered: health.notNeutered || 0,
      catCount: catDog.catCount,
      dogCount: catDog.dogCount,
      otherTypeCount: catDog.otherTypeCount,
      catRate: catDog.catRate,
      dogRate: catDog.dogRate
    },
    byType: byTypeList,
    byGender: toCountList(byGender),
    topBreeds: toCountList(byBreed),
    ageBuckets: ageOrder.map((name) => ({ name, count: ageBucketsMap[name] || 0 })),
    weightBuckets: weightOrder.map((name) => ({ name, count: weightBucketsMap[name] || 0 })),
    orderByPetType: (orderPetTypes || []).map((r) => ({
      name: r._id == null || r._id === '' ? '未填写' : String(r._id),
      orderCount: r.orderCount || 0,
      completedCount: r.completedCount || 0,
      gmv: formatMoney(r.gmv)
    })),
    orderByPetBreed: (orderPetBreeds || []).map((r) => ({
      name: String(r._id || '未填写'),
      orderCount: r.orderCount || 0,
      gmv: formatMoney(r.gmv)
    }))
  };
}

async function buildStoreRevenueReport(storeDocs = [], now = Date.now()) {
  const ordersCol = db.collection('orders');
  const todayStart = cnDayStart(0, now);
  const d7 = cnDayStart(7, now);
  const d30 = cnDayStart(30, now);
  const stores = (storeDocs || []).filter(
    (s) => s && s.store_id && !isExcludedStoreId(s.store_id)
  );

  const rows = await ordersCol
    .aggregate([
      { $match: excludedStoreIdMatch() },
      {
        $group: {
          _id: '$store_id',
          orderCount: { $sum: 1 },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          activeCount: {
            $sum: {
              $cond: [{ $in: ['$status', ACTIVE_ORDER_STATUSES] }, 1, 0]
            }
          },
          gmvAll: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$totalFee', 0] },
                0
              ]
            }
          },
          boardingFeeAll: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$boardingFee', 0] },
                0
              ]
            }
          },
          shippingFeeAll: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$shippingFee', 0] },
                0
              ]
            }
          },
          gmvToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'completed'] },
                    { $gte: ['$createTime', todayStart] }
                  ]
                },
                { $ifNull: ['$totalFee', 0] },
                0
              ]
            }
          },
          gmv7d: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'completed'] },
                    { $gte: ['$createTime', d7] }
                  ]
                },
                { $ifNull: ['$totalFee', 0] },
                0
              ]
            }
          },
          gmv30d: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'completed'] },
                    { $gte: ['$createTime', d30] }
                  ]
                },
                { $ifNull: ['$totalFee', 0] },
                0
              ]
            }
          },
          ordersToday: {
            $sum: { $cond: [{ $gte: ['$createTime', todayStart] }, 1, 0] }
          },
          orders7d: {
            $sum: { $cond: [{ $gte: ['$createTime', d7] }, 1, 0] }
          },
          orders30d: {
            $sum: { $cond: [{ $gte: ['$createTime', d30] }, 1, 0] }
          },
          lastOrderAt: { $max: '$createTime' }
        }
      }
    ])
    .toArray();

  const revenueMap = new Map((rows || []).map((r) => [r._id, r]));
  const storeById = new Map(stores.map((s) => [s.store_id, s]));

  const items = [];
  const storeIds = new Set([
    ...Array.from(storeById.keys()),
    ...Array.from(revenueMap.keys()).filter(
      (id) => id && !isExcludedStoreId(id)
    )
  ]);

  const storeIdList = Array.from(storeIds).filter(
    (storeId) => !isExcludedStoreId(storeId)
  );

  const resolved = await Promise.all(
    storeIdList.map(async (storeId) => {
      const store = storeById.get(storeId) || {};
      const latitude = parseCoord(store.latitude);
      const longitude = parseCoord(store.longitude);
      const { region, geocodeAddress } = await resolveStoreRegion(store, latitude, longitude);
      return { storeId, store, region, geocodeAddress };
    })
  );

  resolved.forEach(({ storeId, store, region, geocodeAddress }) => {
    const rev = revenueMap.get(storeId) || {};
    const completed = rev.completedCount || 0;
    const gmvAll = formatMoney(rev.gmvAll);
    const address = store.address || store.addressRegion || geocodeAddress || '';
    items.push({
      store_id: storeId,
      displayNo: store.displayNo || '',
      name: store.name || storeId || '未命名店铺',
      merchantApplyStatus: store.merchantApplyStatus || '',
      businessStatus: store.status || '',
      regionLabel: region.province === '未知' ? '--' : region.regionLabel,
      address,
      orderCount: rev.orderCount || 0,
      completedCount: completed,
      cancelledCount: rev.cancelledCount || 0,
      activeCount: rev.activeCount || 0,
      completeRate: pct(completed, Math.max((rev.orderCount || 0) - (rev.cancelledCount || 0), 0)),
      gmvAll,
      boardingFeeAll: formatMoney(rev.boardingFeeAll),
      shippingFeeAll: formatMoney(rev.shippingFeeAll),
      aovAll: completed ? formatMoney(gmvAll / completed) : 0,
      gmvToday: formatMoney(rev.gmvToday),
      gmv7d: formatMoney(rev.gmv7d),
      gmv30d: formatMoney(rev.gmv30d),
      ordersToday: rev.ordersToday || 0,
      orders7d: rev.orders7d || 0,
      orders30d: rev.orders30d || 0,
      lastOrderAt: rev.lastOrderAt || 0,
      lastOrderAtText: formatTime(rev.lastOrderAt)
    });
  });

  items.sort((a, b) => {
    if ((b.gmv30d || 0) !== (a.gmv30d || 0)) return (b.gmv30d || 0) - (a.gmv30d || 0);
    if ((b.gmvAll || 0) !== (a.gmvAll || 0)) return (b.gmvAll || 0) - (a.gmvAll || 0);
    return (b.orderCount || 0) - (a.orderCount || 0);
  });

  const totals = items.reduce(
    (acc, s) => {
      acc.gmvAll += s.gmvAll || 0;
      acc.gmvToday += s.gmvToday || 0;
      acc.gmv7d += s.gmv7d || 0;
      acc.gmv30d += s.gmv30d || 0;
      acc.orderCount += s.orderCount || 0;
      acc.completedCount += s.completedCount || 0;
      acc.boardingFeeAll += s.boardingFeeAll || 0;
      acc.shippingFeeAll += s.shippingFeeAll || 0;
      if ((s.gmv30d || 0) > 0 || (s.orders30d || 0) > 0) acc.earningStores30d += 1;
      return acc;
    },
    {
      gmvAll: 0,
      gmvToday: 0,
      gmv7d: 0,
      gmv30d: 0,
      orderCount: 0,
      completedCount: 0,
      boardingFeeAll: 0,
      shippingFeeAll: 0,
      earningStores30d: 0
    }
  );

  Object.keys(totals).forEach((k) => {
    if (k.startsWith('gmv') || k.includes('Fee')) totals[k] = formatMoney(totals[k]);
  });
  totals.storeCount = items.length;
  totals.aovAll = totals.completedCount
    ? formatMoney(totals.gmvAll / totals.completedCount)
    : 0;

  return {
    summary: totals,
    stores: items
  };
}

async function getPetReport() {
  await refreshExcludedStoreIds();
  const now = Date.now();
  return {
    success: true,
    generatedAt: now,
    generatedAtText: formatTime(now),
    petReport: await buildPetReport(now)
  };
}

async function getStoreRevenueReport() {
  await refreshExcludedStoreIds();
  const now = Date.now();
  const stores = await db.collection('stores')
    .find({
      merchantApplyStatus: { $exists: true, $ne: '' },
      ...excludedStoreIdMatch()
    })
    .project({
      store_id: 1,
      displayNo: 1,
      name: 1,
      address: 1,
      addressRegion: 1,
      locationName: 1,
      status: 1,
      merchantApplyStatus: 1
    })
    .limit(500)
    .toArray();
  const storeRevenueReport = await buildStoreRevenueReport(stores, now);
  return {
    success: true,
    generatedAt: now,
    generatedAtText: formatTime(now),
    storeRevenueReport
  };
}

async function getPlatformDashboard() {
  await refreshExcludedStoreIds();
  const storesCol = db.collection('stores');
  const ordersCol = db.collection('orders');
  const usersCol = db.collection('users');
  const dailyCol = db.collection('daily_logs');
  const insuranceEventsCol = db.collection('insurance_events');
  const membershipPayOrdersCol = db.collection('membership_pay_orders');
  const membershipEntitlementsCol = db.collection('membership_entitlements');
  const excludedUserMatch = { openid: { $nin: DASHBOARD_EXCLUDED_OWNER_OPENIDS } };

  const now = Date.now();
  const todayStart = cnDayStart(0, now);
  const yesterdayStart = cnDayStart(1, now);
  const d7 = cnDayStart(7, now);
  const d30 = cnDayStart(30, now);
  const trendStart = cnDayStart(13, now);

  const [
    stores,
    applyStatusCounts,
    businessStatusCounts,
    orderStatusCounts,
    orderByStore,
    periodToday,
    periodYesterday,
    period7,
    period30,
    trendRows,
    pendingStores,
    pricePendingCount,
    userTotal,
    users7,
    users30,
    usersToday,
    visitBoundUsers,
    orderUsers,
    publishedLogs7,
    abnormalLogs7,
    boardingWithLog,
    petReport,
    storeRevenueReport,
    insuranceEventStats,
    membershipPayStats,
    activePaidVipRows
  ] = await Promise.all([
    storesCol
      .find({
        merchantApplyStatus: { $exists: true, $ne: '' },
        ...excludedStoreIdMatch()
      })
      .project({
        store_id: 1,
        displayNo: 1,
        name: 1,
        legalName: 1,
        contactPhone: 1,
        address: 1,
        locationName: 1,
        addressRegion: 1,
        latitude: 1,
        longitude: 1,
        status: 1,
        merchantApplyStatus: 1,
        createTime: 1,
        updateTime: 1,
        coopContractSigned: 1,
        pickupService: 1,
        ownerOpenid: 1,
        staffOpenids: 1
      })
      .sort({ updateTime: -1 })
      .limit(500)
      .toArray(),
    storesCol
      .aggregate([
        {
          $match: {
            merchantApplyStatus: { $exists: true, $ne: '' },
            ...excludedStoreIdMatch()
          }
        },
        { $group: { _id: '$merchantApplyStatus', count: { $sum: 1 } } }
      ])
      .toArray(),
    storesCol
      .aggregate([
        {
          $match: {
            merchantApplyStatus: 'approved',
            ...excludedStoreIdMatch()
          }
        },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
      .toArray(),
    ordersCol
      .aggregate([
        { $match: excludedStoreIdMatch() },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
      .toArray(),
    ordersCol
      .aggregate([
        { $match: excludedStoreIdMatch() },
        {
          $group: {
            _id: { store_id: '$store_id', status: '$status' },
            count: { $sum: 1 },
            lastOrderAt: { $max: '$createTime' },
            gmv: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  { $ifNull: ['$totalFee', 0] },
                  0
                ]
              }
            }
          }
        },
        {
          $group: {
            _id: '$_id.store_id',
            statuses: {
              $push: {
                status: '$_id.status',
                count: '$count',
                lastOrderAt: '$lastOrderAt',
                gmv: '$gmv'
              }
            },
            lastOrderAt: { $max: '$lastOrderAt' },
            completedGmv: { $sum: '$gmv' }
          }
        }
      ])
      .toArray(),
    aggregatePeriodOrders(ordersCol, todayStart, null),
    aggregatePeriodOrders(ordersCol, yesterdayStart, todayStart),
    aggregatePeriodOrders(ordersCol, d7, null),
    aggregatePeriodOrders(ordersCol, d30, null),
    ordersCol
      .aggregate([
        {
          $match: {
            createTime: { $gte: trendStart },
            ...excludedStoreIdMatch()
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $toDate: '$createTime' },
                timezone: 'Asia/Shanghai'
              }
            },
            orderCount: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            cancelledCount: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            },
            gmv: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  { $ifNull: ['$totalFee', 0] },
                  0
                ]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray(),
    storesCol
      .find({
        merchantApplyStatus: 'pending',
        ...excludedStoreIdMatch()
      })
      .project({ createTime: 1, updateTime: 1 })
      .toArray(),
    ordersCol.countDocuments({
      pricePendingConfirm: true,
      ...excludedStoreIdMatch()
    }),
    usersCol.countDocuments({ ...excludedUserMatch }),
    usersCol.countDocuments({ createTime: { $gte: d7 }, ...excludedUserMatch }),
    usersCol.countDocuments({ createTime: { $gte: d30 }, ...excludedUserMatch }),
    usersCol.countDocuments({ createTime: { $gte: todayStart }, ...excludedUserMatch }),
    usersCol.countDocuments({
      ...excludedUserMatch,
      $or: [
        {
          visitStoreId: {
            $exists: true,
            $nin: ['', null, ...resolvedExcludedStoreIds]
          }
        },
        {
          $and: [
            {
              store_id: {
                $exists: true,
                $nin: ['', null, ...resolvedExcludedStoreIds]
              }
            },
            { merchantStatus: { $nin: ['approved', 'pending', 'rejected', 'disabled'] } }
          ]
        }
      ]
    }),
    ordersCol.distinct('userOpenid', {
      userOpenid: { $nin: ['', null] },
      ...excludedStoreIdMatch()
    }),
    dailyCol.countDocuments({
      status: 'published',
      ...excludedStoreIdMatch(),
      $or: [
        { publishedAt: { $gte: d7 } },
        { createTime: { $gte: d7 } }
      ]
    }),
    dailyCol.countDocuments({
      status: 'published',
      isAbnormal: true,
      ...excludedStoreIdMatch(),
      $or: [
        { publishedAt: { $gte: d7 } },
        { createTime: { $gte: d7 } }
      ]
    }),
    ordersCol
      .aggregate([
        { $match: { status: 'boarding', ...excludedStoreIdMatch() } },
        {
          $lookup: {
            from: 'daily_logs',
            let: { oid: '$order_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$order_id', '$$oid'] },
                      { $eq: ['$status', 'published'] }
                    ]
                  }
                }
              },
              { $limit: 1 }
            ],
            as: 'logs'
          }
        },
        {
          $group: {
            _id: null,
            boarding: { $sum: 1 },
            withLog: {
              $sum: { $cond: [{ $gt: [{ $size: '$logs' }, 0] }, 1, 0] }
            }
          }
        }
      ])
      .toArray(),
    buildPetReport(now),
    // storeRevenueReport 依赖 stores，先占位，下面再算
    Promise.resolve(null),
    insuranceEventsCol
      .aggregate([
        {
          $match: {
            source: 'checkout_success_popup',
            ...excludedStoreIdMatch()
          }
        },
        {
          $facet: {
            total: [
              { $group: { _id: '$eventType', count: { $sum: 1 } } }
            ],
            d30: [
              { $match: { createTime: { $gte: d30 } } },
              { $group: { _id: '$eventType', count: { $sum: 1 } } }
            ]
          }
        }
      ])
      .toArray(),
    // 订阅收入只认微信支付成功且未退款的会员订单；兑换码、试用、推广奖励不在此表内。
    membershipPayOrdersCol
      .aggregate([
        {
          $match: {
            status: 'paid',
            ...excludedStoreIdMatch()
          }
        },
        {
          $facet: {
            total: [
              {
                $group: {
                  _id: null,
                  revenueFen: {
                    $sum: {
                      $convert: { input: '$amountFen', to: 'long', onError: 0, onNull: 0 }
                    }
                  },
                  orderCount: { $sum: 1 },
                  payingStores: { $addToSet: '$store_id' }
                }
              }
            ],
            d30: [
              { $match: { paidAt: { $gte: d30 } } },
              {
                $group: {
                  _id: null,
                  revenueFen: {
                    $sum: {
                      $convert: { input: '$amountFen', to: 'long', onError: 0, onNull: 0 }
                    }
                  },
                  orderCount: { $sum: 1 }
                }
              }
            ]
          }
        }
      ])
      .toArray(),
    membershipEntitlementsCol
      .aggregate([
        {
          $match: {
            source: 'wechat_pay',
            status: 'active',
            startAt: { $lte: now },
            expireAt: { $gt: now },
            ...excludedStoreIdMatch()
          }
        },
        { $group: { _id: '$store_id' } },
        { $count: 'count' }
      ])
      .toArray()
  ]);

  const membershipPayFacet = (membershipPayStats && membershipPayStats[0]) || {};
  const membershipPayTotal = (membershipPayFacet.total && membershipPayFacet.total[0]) || {};
  const membershipPay30d = (membershipPayFacet.d30 && membershipPayFacet.d30[0]) || {};
  const subscriptionRevenue = {
    totalRevenue: formatMoney((Number(membershipPayTotal.revenueFen) || 0) / 100),
    revenue30d: formatMoney((Number(membershipPay30d.revenueFen) || 0) / 100),
    paidOrderCount: Number(membershipPayTotal.orderCount) || 0,
    paidOrderCount30d: Number(membershipPay30d.orderCount) || 0,
    payingStoreCount: Array.isArray(membershipPayTotal.payingStores)
      ? membershipPayTotal.payingStores.filter(Boolean).length
      : 0,
    activePaidVipCount: Number(activePaidVipRows && activePaidVipRows[0] && activePaidVipRows[0].count) || 0
  };

  const [storeRevenueReportResolved, userAudience] = await Promise.all([
    buildStoreRevenueReport(stores || [], now),
    countMerchantAndGuestUsers(usersCol, stores || [], excludedUserMatch)
  ]);

  const storeSummary = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    disabled: 0,
    withLocation: 0,
    open: 0,
    closed: 0,
    contractSigned: 0,
    pickupEnabled: 0
  };
  (applyStatusCounts || []).forEach((row) => {
    const key = row._id || '';
    const count = row.count || 0;
    storeSummary.total += count;
    if (Object.prototype.hasOwnProperty.call(storeSummary, key)) {
      storeSummary[key] = count;
    }
  });
  (businessStatusCounts || []).forEach((row) => {
    const status = row._id || '';
    const count = row.count || 0;
    if (status === '营业中') storeSummary.open += count;
    if (status === '已闭店' || status === '未营业' || status === '暂停接单') {
      storeSummary.closed += count;
    }
  });

  const orderSummary = emptyOrderStats();
  (orderStatusCounts || []).forEach((row) => {
    const status = row._id || 'pending';
    const count = row.count || 0;
    orderSummary.total += count;
    orderSummary.byStatus[status] = (orderSummary.byStatus[status] || 0) + count;
    if (ACTIVE_ORDER_STATUSES.includes(status)) orderSummary.active += count;
    if (status === 'completed') orderSummary.completed += count;
    if (status === 'cancelled') orderSummary.cancelled += count;
  });
  orderSummary.cancelRate = pct(orderSummary.cancelled, orderSummary.total);
  orderSummary.completeRate = pct(
    orderSummary.completed,
    Math.max(orderSummary.total - orderSummary.cancelled, 0)
  );

  const orderMap = new Map();
  (orderByStore || []).forEach((row) => {
    const storeId = row._id || '';
    if (!storeId) return;
    const stats = emptyOrderStats();
    stats.lastOrderAt = row.lastOrderAt || 0;
    stats.completedGmv = formatMoney(row.completedGmv);
    (row.statuses || []).forEach((item) => {
      const status = item.status || 'pending';
      const count = item.count || 0;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + count;
      stats.total += count;
      if (ACTIVE_ORDER_STATUSES.includes(status)) stats.active += count;
      if (status === 'completed') stats.completed += count;
      if (status === 'cancelled') stats.cancelled += count;
    });
    orderMap.set(storeId, stats);
  });

  let pendingWaitSum = 0;
  (pendingStores || []).forEach((s) => {
    const t = s.createTime || s.updateTime || now;
    pendingWaitSum += Math.max(0, now - t);
  });
  const pendingCount = (pendingStores || []).length;
  const pendingAvgWaitHours = pendingCount
    ? round1(pendingWaitSum / pendingCount / 3600000)
    : 0;

  const regionMap = new Map();
  const mapStores = [];
  const storeRows = [];
  const zombieStores = [];
  const topStores = [];

  const resolvedStores = await Promise.all(
    (stores || []).map(async (doc) => {
      const latitude = parseCoord(doc.latitude);
      const longitude = parseCoord(doc.longitude);
      const { region, geocodeAddress } = await resolveStoreRegion(doc, latitude, longitude);
      return { doc, latitude, longitude, region, geocodeAddress };
    })
  );

  // 地址缺行政区时回写 addressRegion，避免下次反复逆地理
  const backfillJobs = [];
  resolvedStores.forEach(({ doc, region, geocodeAddress }) => {
    if (
      !geocodeAddress
      || region.province === '未知'
      || !doc.store_id
      || String(doc.addressRegion || '').trim()
    ) {
      return;
    }
    backfillJobs.push(
      storesCol
        .updateOne(
          { store_id: doc.store_id },
          { $set: { addressRegion: geocodeAddress } }
        )
        .catch((err) => {
          console.warn(
            '[dashboard] backfill addressRegion failed',
            doc.store_id,
            (err && err.message) || err
          );
        })
    );
  });
  if (backfillJobs.length) {
    await Promise.all(backfillJobs);
  }

  resolvedStores.forEach(({ doc, latitude, longitude, region, geocodeAddress }) => {
    const address =
      doc.address || doc.addressRegion || geocodeAddress || '';
    const orderStats = orderMap.get(doc.store_id) || emptyOrderStats();
    const applyStatus = doc.merchantApplyStatus || '';
    if (doc.coopContractSigned) storeSummary.contractSigned += 1;
    if (doc.pickupService === 'yes' || doc.pickupService === true) {
      storeSummary.pickupEnabled += 1;
    }
    if (latitude != null && longitude != null) storeSummary.withLocation += 1;

    const isZombie =
      applyStatus === 'approved' &&
      (!orderStats.lastOrderAt || orderStats.lastOrderAt < d30);

    const regionLabel = region.province === '未知' ? '--' : region.regionLabel;

    const item = {
      store_id: doc.store_id,
      displayNo: doc.displayNo || '',
      name: doc.name || '未命名店铺',
      legalName: doc.legalName || '',
      contactPhone: doc.contactPhone || '',
      address,
      locationName: doc.locationName || '',
      latitude,
      longitude,
      merchantApplyStatus: applyStatus,
      businessStatus: doc.status || '',
      province: region.province === '未知' ? '' : region.province,
      city: region.city,
      regionLabel,
      orderCount: orderStats.total,
      activeOrderCount: orderStats.active,
      completedOrderCount: orderStats.completed,
      cancelledOrderCount: orderStats.cancelled,
      gmv: orderStats.completedGmv || 0,
      completeRate: pct(
        orderStats.completed,
        Math.max(orderStats.total - orderStats.cancelled, 0)
      ),
      isZombie,
      lastOrderAt: orderStats.lastOrderAt || 0,
      lastOrderAtText: formatTime(orderStats.lastOrderAt),
      applyTime: doc.createTime || 0,
      applyTimeText: formatTime(doc.createTime)
    };

    storeRows.push(item);
    if (applyStatus === 'approved') {
      topStores.push(item);
      if (isZombie) zombieStores.push(item);
    }

    if (latitude != null && longitude != null) {
      mapStores.push({
        store_id: item.store_id,
        name: item.name,
        displayNo: item.displayNo,
        address: item.address,
        merchantApplyStatus: item.merchantApplyStatus,
        businessStatus: item.businessStatus,
        regionLabel: item.regionLabel,
        orderCount: item.orderCount,
        gmv: item.gmv,
        latitude,
        longitude
      });
    }

    // 注册地分布：仅市一级，排除未知
    if (
      (applyStatus === 'approved' || applyStatus === 'pending')
      && region.province
      && region.province !== '未知'
      && region.regionKey !== '未知'
    ) {
      const prev = regionMap.get(region.regionKey) || {
        regionKey: region.regionKey,
        regionLabel: region.regionLabel,
        province: region.province,
        city: region.city,
        storeCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        orderCount: 0,
        gmv: 0
      };
      prev.storeCount += 1;
      if (applyStatus === 'approved') prev.approvedCount += 1;
      if (applyStatus === 'pending') prev.pendingCount += 1;
      prev.orderCount += orderStats.total;
      prev.gmv = formatMoney((prev.gmv || 0) + (orderStats.completedGmv || 0));
      regionMap.set(region.regionKey, prev);
    }
  });

  storeRows.sort((a, b) => {
    if ((b.gmv || 0) !== (a.gmv || 0)) return (b.gmv || 0) - (a.gmv || 0);
    if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
    return (b.applyTime || 0) - (a.applyTime || 0);
  });

  topStores.sort((a, b) => {
    if ((b.gmv || 0) !== (a.gmv || 0)) return (b.gmv || 0) - (a.gmv || 0);
    return b.orderCount - a.orderCount;
  });
  zombieStores.sort((a, b) => (a.lastOrderAt || 0) - (b.lastOrderAt || 0));

  const regions = Array.from(regionMap.values()).sort((a, b) => {
    if ((b.gmv || 0) !== (a.gmv || 0)) return (b.gmv || 0) - (a.gmv || 0);
    if (b.storeCount !== a.storeCount) return b.storeCount - a.storeCount;
    return b.orderCount - a.orderCount;
  });

  const provinceMap = new Map();
  regions.forEach((r) => {
    const key = r.province || '';
    if (!key || key === '未知') return;
    const prev = provinceMap.get(key) || {
      province: key,
      storeCount: 0,
      approvedCount: 0,
      orderCount: 0,
      gmv: 0
    };
    prev.storeCount += r.storeCount;
    prev.approvedCount += r.approvedCount;
    prev.orderCount += r.orderCount;
    prev.gmv = formatMoney((prev.gmv || 0) + (r.gmv || 0));
    provinceMap.set(key, prev);
  });
  const provinces = Array.from(provinceMap.values()).sort((a, b) => b.storeCount - a.storeCount);

  // 补齐近 14 日趋势空档
  const trendMap = new Map((trendRows || []).map((r) => [r._id, r]));
  const trend = [];
  for (let i = 13; i >= 0; i -= 1) {
    const key = cnDayKey(cnDayStart(i, now));
    const row = trendMap.get(key) || {};
    trend.push({
      date: key,
      orderCount: row.orderCount || 0,
      completedCount: row.completedCount || 0,
      cancelledCount: row.cancelledCount || 0,
      gmv: formatMoney(row.gmv)
    });
  }

  const funnel = FUNNEL_STATUSES.map((status) => ({
    status,
    count: orderSummary.byStatus[status] || 0
  }));

  const boardingCover = (boardingWithLog && boardingWithLog[0]) || { boarding: 0, withLog: 0 };
  const boardingCount = orderSummary.byStatus.boarding || 0;
  const checkinCoverage = pct(boardingCover.withLog || 0, boardingCover.boarding || boardingCount || 0);

  const gmvDelta = periodYesterday.gmv
    ? round1(((periodToday.gmv - periodYesterday.gmv) / periodYesterday.gmv) * 100)
    : (periodToday.gmv ? 100 : 0);
  const orderDelta = periodYesterday.orderCount
    ? round1(
      ((periodToday.orderCount - periodYesterday.orderCount) / periodYesterday.orderCount) * 100
    )
    : (periodToday.orderCount ? 100 : 0);

  periodToday.newUserCount = usersToday || 0;
  period7.newUserCount = users7 || 0;
  period30.newUserCount = users30 || 0;

  const orderedUserCount = (orderUsers || []).filter(Boolean).length;
  const activeStoreRate = pct(period7.activeStoreCount, storeSummary.approved || 0);
  const approvedStores = storeSummary.approved || 0;
  const totalGmv = formatMoney(
    storeRows.reduce((sum, s) => sum + (Number(s.gmv) || 0), 0)
  );
  const avgOrdersPerStore = approvedStores
    ? round1(orderSummary.total / approvedStores)
    : 0;
  const avgCompletedPerStore = approvedStores
    ? round1(orderSummary.completed / approvedStores)
    : 0;
  const avgGmvPerStore = approvedStores
    ? formatMoney(totalGmv / approvedStores)
    : 0;
  const earningStores30d = period30.activeStoreCount || 0;
  const cityCount = regions.length;
  const provinceCount = provinces.length;
  const insuranceFacet = (insuranceEventStats && insuranceEventStats[0]) || {};
  const countInsuranceEvents = (rows, eventType) => {
    const hit = (Array.isArray(rows) ? rows : []).find((row) => row && row._id === eventType);
    return (hit && hit.count) || 0;
  };
  const insurancePopupImpressions = countInsuranceEvents(insuranceFacet.total, 'impression');
  const insurancePopupClicks = countInsuranceEvents(insuranceFacet.total, 'click');
  const insurancePopupImpressions30d = countInsuranceEvents(insuranceFacet.d30, 'impression');
  const insurancePopupClicks30d = countInsuranceEvents(insuranceFacet.d30, 'click');
  const insurancePopupStats = {
    impressions: insurancePopupImpressions,
    clicks: insurancePopupClicks,
    clickRate: pct(insurancePopupClicks, insurancePopupImpressions),
    impressions30d: insurancePopupImpressions30d,
    clicks30d: insurancePopupClicks30d,
    clickRate30d: pct(insurancePopupClicks30d, insurancePopupImpressions30d)
  };

  const mapTopStore = (s) => ({
    store_id: s.store_id,
    name: s.name,
    displayNo: s.displayNo,
    regionLabel: s.regionLabel,
    orderCount: s.orderCount,
    completedOrderCount: s.completedOrderCount,
    gmv: s.gmv,
    completeRate: s.completeRate,
    lastOrderAtText: s.lastOrderAtText
  });

  const topStoresByOrders = [...topStores]
    .sort((a, b) => {
      if ((b.orderCount || 0) !== (a.orderCount || 0)) {
        return (b.orderCount || 0) - (a.orderCount || 0);
      }
      return (b.gmv || 0) - (a.gmv || 0);
    })
    .slice(0, 10)
    .map(mapTopStore);

  return {
    success: true,
    generatedAt: now,
    generatedAtText: formatTime(now),
    summary: {
      stores: storeSummary,
      orders: orderSummary,
      ops: {
        todayGmv: periodToday.gmv,
        todayGmvDelta: gmvDelta,
        todayOrders: periodToday.orderCount,
        todayOrderDelta: orderDelta,
        todayCompleted: periodToday.completedCount,
        todayCancelRate: periodToday.cancelRate,
        boardingCount,
        pendingStores: pendingCount,
        pendingAvgWaitHours,
        activeStores7d: period7.activeStoreCount,
        activeStores30d: period30.activeStoreCount,
        activeStoreRate7d: activeStoreRate,
        earningStores30d,
        zombieStoreCount: zombieStores.length,
        pricePendingCount: pricePendingCount || 0,
        aov30d: period30.aov,
        avgDays30d: period30.avgDays,
        pickupRate30d: period30.pickupRate,
        gmv30d: period30.gmv,
        gmv7d: period7.gmv,
        orders7d: period7.orderCount,
        orders30d: period30.orderCount,
        boardingFee30d: period30.boardingFee,
        shippingFee30d: period30.shippingFee,
        // 招商核心：累计规模 / 增收 / 店均模型 / 覆盖版图
        totalGmv,
        avgOrdersPerStore,
        avgCompletedPerStore,
        avgGmvPerStore,
        cityCount,
        provinceCount,
        checkinCoverage,
        publishedLogs7d: publishedLogs7 || 0,
        abnormalLogs7d: abnormalLogs7 || 0,
        abnormalRate7d: pct(abnormalLogs7 || 0, publishedLogs7 || 0),
        userTotal: userTotal || 0,
        newUsers7d: users7 || 0,
        newUsers30d: users30 || 0,
        visitBoundUsers: visitBoundUsers || 0,
        merchantUserCount: (userAudience && userAudience.merchantUserCount) || 0,
        merchantOwnerCount: (userAudience && userAudience.merchantOwnerCount) || 0,
        merchantStaffCount: (userAudience && userAudience.merchantStaffCount) || 0,
        guestUserCount: (userAudience && userAudience.guestUserCount) || 0,
        orderedUserCount,
        orderUserRate: pct(orderedUserCount, userTotal || 0)
      }
    },
    periods: {
      today: periodToday,
      yesterday: periodYesterday,
      d7: period7,
      d30: period30
    },
    insurance: {
      checkoutPopup: insurancePopupStats
    },
    membership: {
      subscriptionRevenue
    },
    funnel,
    trend,
    topStores: topStores.slice(0, 10).map(mapTopStore),
    topStoresByOrders,
    zombieStores: zombieStores.slice(0, 10).map((s) => ({
      store_id: s.store_id,
      name: s.name,
      displayNo: s.displayNo,
      regionLabel: s.regionLabel,
      businessStatus: s.businessStatus,
      lastOrderAtText: s.lastOrderAtText || '从未下单',
      orderCount: s.orderCount
    })),
    mapStores,
    stores: storeRows,
    regions,
    provinces,
    petReport: petReport || null,
    storeRevenueReport: storeRevenueReportResolved || storeRevenueReport || null
  };
}

module.exports = {
  getPlatformDashboard,
  getPetReport,
  getStoreRevenueReport,
  parseRegion,
  resolveStoreRegion
};
