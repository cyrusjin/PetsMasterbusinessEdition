const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const serverRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(serverRoot, '..', '..', '..');

function readWorkspace(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

function testClientPlanNormalization() {
  const filename = path.join(workspaceRoot, 'miniprogram/packageExtra/membership/membership.js');
  let source = fs.readFileSync(filename, 'utf8');
  source = source.replace('Page({', 'globalThis.__page = ({');
  source += '\nglobalThis.__membershipTest = { normalizePlans, normalizeMembership };\n';
  const sandbox = {
    globalThis: null,
    getApp: () => ({ globalData: {} }),
    require: (request) => {
      if (request.includes('membership')) return {};
      if (request.includes('navBar')) return { hideHomeButton() {} };
      throw new Error(`unexpected require: ${request}`);
    },
    wx: {},
    setTimeout() {}
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename });

  const plans = sandbox.__membershipTest.normalizePlans([
    { code: 'pro_monthly', name: '服务端月付', priceYuan: '29.9', periodText: '30天', badge: '新价' },
    { code: 'pro_yearly', priceYuan: '199' }
  ]);
  assert.strictEqual(plans[0].priceYuan, '29.9');
  assert.strictEqual(plans[0].name, '服务端月付');
  assert.strictEqual(plans[0].priceUnit, '月');
  assert.strictEqual(plans[2].priceYuan, '199');

  const staff = sandbox.__membershipTest.normalizeMembership({
    active: true,
    subscriptionActive: true,
    canPurchase: false
  });
  assert.strictEqual(staff.active, true);
  assert.strictEqual(staff.canPurchase, false);
}

function testServerInvariants() {
  const service = readWorkspace('work/petmaster-live/server/src/services/membershipService.js');
  const routes = readWorkspace('work/petmaster-live/server/src/routes/api.js');
  const config = readWorkspace('work/petmaster-live/server/src/config.js');
  const order = readWorkspace('work/petmaster-live/server/src/services/orderService.js');
  const mapRoute = readWorkspace('work/petmaster-live/server/src/routes/map.js');
  const adminMembership = readWorkspace('work/petmaster-live/website/admin/memberships.html');
  const dashboardService = readWorkspace('work/petmaster-live/server/src/services/platformStatsService.js');
  const dashboardPage = readWorkspace('work/petmaster-live/website/admin/dashboard.html');

  assert(routes.includes('guardedExceptActions'), 'store service must use a default-deny merchant guard');
  assert((routes.match(/guardedAction\('\*'/g) || []).length >= 4,
    'order, pet, daily and ledger services must default to membership protection');
  ['getMembershipStatus', 'createMembershipPay', 'queryMembershipPay', 'redeemMembershipCode', 'getDailyCheckInStatus', 'claimDailyCheckIn']
    .forEach((action) => assert(routes.includes(`'${action}'`), `missing membership allowlist action: ${action}`));
  assert(mapRoute.includes('membershipService.guardMerchantAction'), 'merchant map APIs must be membership protected');
  assert(order.includes('assertActiveMembership(existing.store_id)'), 'merchant order updates must be guarded');
  assert(!/basicPetLimit|BASIC_PET_LIMIT|assertBoardingCapacity|withStoreCapacityLock/.test(service + config + order),
    'pet-count membership limits must not return');
  assert(!service.includes('withTransaction'), 'membership correctness must not depend on replica-set transactions');
  ['appliedGrants', 'idempotencyKey', "status: 'processing'", "status: 'refunded'", 'reconcilePaidMembershipOrders']
    .forEach((marker) => assert(service.includes(marker), `missing membership state marker: ${marker}`));
  assert(service.includes('encryptRedeemCode(code)'), 'new redeem codes must be encrypted at rest');
  assert(service.includes('codeCipher: encryptRedeemCode(code)'), 'generated codes must persist their encrypted value');
  assert(service.includes('decryptRedeemCode(item.codeCipher, item.code_hash)'), 'admin code listing must recover full codes');
  assert(adminMembership.includes('navigator.clipboard') && adminMembership.includes("document.execCommand('copy')"),
    'admin copy must support modern and fallback clipboard APIs');
  assert(adminMembership.includes('code-copy-btn') && adminMembership.includes('copy-active-btn'),
    'admin code listing must provide row and bulk copy actions');
  assert(dashboardService.includes("status: 'paid'") && dashboardService.includes("source: 'wechat_pay'")
    && dashboardService.includes('subscriptionRevenue'),
  'dashboard subscription revenue must come from paid WeChat membership records');
  assert(dashboardPage.includes("label: '\u8ba2\u9605\u6536\u76ca'") && dashboardPage.includes('activePaidVipCount'),
    'dashboard must display subscription revenue and active paid VIP count');

  const shell = readWorkspace('miniprogram/utils/shell.js');
  const checkInPage = readWorkspace('miniprogram/pages/merchant/tab-check-in/tab-check-in.js');
  const membershipPage = readWorkspace('miniprogram/packageExtra/membership/membership.js');
  const membershipTpl = readWorkspace('miniprogram/packageExtra/membership/membership.wxml');
  assert(shell.includes('tab-check-in/tab-check-in'), 'check-in tab must be a merchant shell route');
  assert(shell.includes('isMembershipExemptRoute'), 'expired-membership redirect must exempt the check-in page');
  assert(shell.includes('isCheckInCampaignActive'), 'check-in tab must hide after the 21-day campaign');
  assert(!shell.includes('isExpiredPreviewActive'), 'local expired-membership preview must not intercept real access');
  assert(checkInPage.includes('skipMembership: campaignActive'), 'check-in page must skip membership lock only during the campaign');
  assert(checkInPage.includes('hideTabBar'), 'expired check-in entry must hide merchant tabs');
  assert(membershipPage.includes('onGoCheckIn'), 'expired membership page must provide a check-in entry');
  assert(membershipPage.includes("wx.navigateTo({ url })"), 'expired membership check-in entry must keep membership in the stack');
  assert(membershipTpl.includes('每日签到领会员'), 'membership page must show a check-in entry');
  assert(service.includes('checkInVersionSeenAt'), 'check-in campaign must start when merchant first sees this version');
  assert(service.includes("return 'checkin'"), 'check-in grants must be labeled as check-in payment method');
  assert(service.includes("'daily_checkin'"), 'daily check-in must grant membership days');
  const storesAdmin = readWorkspace('work/petmaster-live/website/admin/stores.html');
  const storeDetail = readWorkspace('work/petmaster-live/website/admin/store-detail.html');
  assert(storesAdmin.includes("checkin: '签到获得'"), 'store list must display check-in membership source');
  assert(storeDetail.includes('会员购买状态'), 'store detail must show membership purchase status');
  assert(storeDetail.includes('签到获得'), 'store detail must label check-in grants');
}

testClientPlanNormalization();
testServerInvariants();
console.log('membership logic tests passed');
