const assert = require('node:assert/strict');
const {
  aggregateDauTrend,
  normalizeRole,
  recordsFromExistingApiData,
  UNBOUND_STORE_NAME
} = require('../src/services/userActivityStats');

function main() {
  assert.equal(normalizeRole('merchant'), 'merchant');
  assert.equal(normalizeRole('user'), 'guest');
  assert.equal(normalizeRole(''), 'guest');

  const trend = aggregateDauTrend([
    {
      day: '2026-09-14',
      userKey: 'm1',
      role: 'merchant',
      storeId: 'store_a',
      storeName: '汪汪之家',
      merchantRole: 'owner',
      displayName: '店主小王',
      openid: 'owner_a'
    },
    {
      day: '2026-09-14',
      userKey: 'm1',
      role: 'merchant',
      storeId: 'store_a',
      displayName: '重复不应计数'
    },
    {
      day: '2026-09-14',
      userKey: 'm2',
      role: 'merchant',
      storeId: 'store_a',
      storeName: '汪汪之家',
      merchantRole: 'staff',
      displayName: '店员阿花',
      openid: 'staff_a'
    },
    {
      day: '2026-09-14',
      userKey: 'g1',
      role: 'guest',
      storeId: 'store_a',
      storeName: '汪汪之家',
      openid: 'guest_a'
    },
    {
      day: '2026-09-14',
      userKey: 'g2',
      role: 'guest',
      storeId: '',
      openid: 'guest_unbound'
    },
    {
      day: '2026-09-14',
      userKey: 'g3',
      role: 'guest',
      storeId: 'store_test',
      storeName: '测试店',
      openid: 'guest_test'
    },
    {
      day: '2026-09-14',
      userKey: 'mx',
      role: 'merchant',
      storeId: 'store_b',
      storeName: '被排除店主',
      openid: 'excluded_owner',
      openids: ['excluded_owner']
    },
    {
      day: '2026-09-13',
      userKey: 'g9',
      role: 'guest',
      storeId: 'store_b',
      storeName: '喵星人',
      openid: 'guest_b'
    }
  ], {
    dayKeys: ['2026-09-13', '2026-09-14'],
    excludedOpenids: ['excluded_owner'],
    excludedStoreIds: ['store_test']
  });

  assert.equal(trend.length, 2);
  assert.equal(trend[0].date, '2026-09-13');
  assert.equal(trend[0].merchantCount, 0);
  assert.equal(trend[0].guestCount, 1);
  assert.equal(trend[0].guests[0].storeName, '喵星人');
  assert.equal(trend[0].guests[0].count, 1);

  assert.equal(trend[1].date, '2026-09-14');
  assert.equal(trend[1].merchantCount, 2);
  assert.equal(trend[1].guestCount, 2);

  const merchantStore = trend[1].merchants.find((item) => item.storeId === 'store_a');
  assert.ok(merchantStore);
  assert.equal(merchantStore.count, 2);
  assert.equal(merchantStore.ownerCount, 1);
  assert.equal(merchantStore.staffCount, 1);
  assert.deepEqual(merchantStore.names, ['店主小王', '店员阿花']);

  const guestBound = trend[1].guests.find((item) => item.storeId === 'store_a');
  const guestUnbound = trend[1].guests.find((item) => item.storeId === '');
  assert.equal(guestBound.count, 1);
  assert.equal(guestUnbound.storeName, UNBOUND_STORE_NAME);
  assert.equal(guestUnbound.count, 1);
  assert.equal(trend[1].guests.some((item) => item.storeId === 'store_test'), false);
  assert.equal(trend[1].merchants.every((item) => item.storeName !== '被排除店主'), true);

  const week = recordsFromExistingApiData({
    orders: [{
      createTime: Date.parse('2026-09-10T04:00:00+08:00'),
      userOpenid: 'guest_1',
      merchantOpenid: 'owner_1',
      store_id: 'store_a'
    }],
    dailyLogs: [{
      publishedAt: Date.parse('2026-09-11T10:00:00+08:00'),
      createTime: Date.parse('2026-09-11T10:00:00+08:00'),
      merchantOpenid: 'owner_1',
      userOpenid: 'guest_2',
      userViewedAt: Date.parse('2026-09-11T12:00:00+08:00'),
      store_id: 'store_a',
      status: 'published'
    }],
    users: [{
      _id: 'u_guest',
      openid: 'guest_3',
      nickName: '阿花',
      updateTime: Date.parse('2026-09-12T09:00:00+08:00'),
      visitStoreId: 'store_a'
    }],
    dayStart: Date.parse('2026-09-08T00:00:00+08:00'),
    now: Date.parse('2026-09-14T15:00:00+08:00'),
    dayKeyFn: (ts) => new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10),
    storeById: {
      store_a: { store_id: 'store_a', name: '汪汪之家', ownerOpenid: 'owner_1' }
    },
    userByOpenid: new Map([
      ['guest_1', { _id: 'g1', openid: 'guest_1', nickName: '客人甲' }],
      ['owner_1', { _id: 'm1', openid: 'owner_1', nickName: '店主小王' }],
      ['guest_2', { _id: 'g2', openid: 'guest_2' }],
      ['guest_3', { _id: 'u_guest', openid: 'guest_3', nickName: '阿花', visitStoreId: 'store_a' }]
    ]),
    merchantOpenids: ['owner_1']
  });
  const byDay = aggregateDauTrend(week, { dayKeys: ['2026-09-10', '2026-09-11', '2026-09-12'] });
  assert.equal(byDay[0].guestCount, 1);
  assert.equal(byDay[0].merchantCount, 1);
  assert.equal(byDay[0].merchants[0].storeName, '汪汪之家');
  assert.equal(byDay[1].guestCount, 1);
  assert.equal(byDay[1].merchantCount, 1);
  assert.equal(byDay[2].guestCount, 1);
  assert.equal(byDay[2].guests[0].storeName, '汪汪之家');

  console.log('user-activity.test.js ok');
}

main();
