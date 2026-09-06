const crypto = require('crypto');
const fs = require('fs');
const db = require('../db');
const config = require('../config');
const oss = require('../oss');
const wechatPayService = require('./wechatPayService');

function formatYuan(amountFen) {
  return (Number(amountFen || 0) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function savingBadge(originalFen, actualFen) {
  const savingFen = Math.max(0, Number(originalFen) - Number(actualFen));
  return savingFen > 0 ? `省¥${formatYuan(savingFen)}` : '';
}

const HALF_YEAR_ORIGINAL_FEN = config.membership.monthlyPriceFen * 6;
const YEAR_ORIGINAL_FEN = config.membership.monthlyPriceFen * 12;
const PLANS = [
  { code: 'pro_monthly', name: '月付', priceYuan: formatYuan(config.membership.monthlyPriceFen), amountFen: config.membership.monthlyPriceFen, periodText: '1个月', months: 1, badge: '' },
  { code: 'pro_half_yearly', name: '半年付', priceYuan: formatYuan(config.membership.halfYearlyPriceFen), originalPriceYuan: formatYuan(HALF_YEAR_ORIGINAL_FEN), amountFen: config.membership.halfYearlyPriceFen, periodText: '6个月', months: 6, badge: savingBadge(HALF_YEAR_ORIGINAL_FEN, config.membership.halfYearlyPriceFen) },
  { code: 'pro_yearly', name: '年付', priceYuan: formatYuan(config.membership.yearlyPriceFen), originalPriceYuan: formatYuan(YEAR_ORIGINAL_FEN), amountFen: config.membership.yearlyPriceFen, periodText: '1年', months: 12, badge: savingBadge(YEAR_ORIGINAL_FEN, config.membership.yearlyPriceFen) }
];
const LEGACY_FREE_EXPIRES_AT = Date.UTC(2026, 8, 10, 16, 0, 0, 0);
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let collectionsPromise = null;
let paymentReconcileTimer = null;

function ensureCollections() {
  if (!collectionsPromise) {
    collectionsPromise = db.ensureCollections([
      'store_subscriptions',
      'membership_entitlements',
      'membership_redeem_codes',
      'membership_events',
      'membership_pay_orders',
      'membership_settings',
      'membership_promotion_tasks',
      'membership_task_submissions',
      'membership_task_rewards'
    ]).then(async () => {
      await Promise.all([
        db.collection('store_subscriptions').createIndex({ store_id: 1 }, { unique: true }),
        db.collection('membership_entitlements').createIndex({ idempotencyKey: 1 }, { unique: true }),
        db.collection('membership_entitlements').createIndex({ trialSubjectKey: 1 }, { unique: true, sparse: true }),
        db.collection('membership_entitlements').createIndex({ store_id: 1, expireAt: -1 }),
        db.collection('membership_redeem_codes').createIndex({ code_hash: 1 }, { unique: true }),
        db.collection('membership_redeem_codes').createIndex({ createdAt: -1 }),
        db.collection('membership_events').createIndex({ store_id: 1, createdAt: -1 }),
        db.collection('membership_events').createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }),
        db.collection('membership_pay_orders').createIndex({ order_id: 1 }, { unique: true }),
        db.collection('membership_pay_orders').createIndex({ activeKey: 1 }, { unique: true, sparse: true }),
        db.collection('membership_pay_orders').createIndex({ status: 1, lastVerifiedAt: 1 }),
        db.collection('membership_promotion_tasks').createIndex({ code: 1 }, { unique: true }),
        db.collection('membership_promotion_tasks').createIndex({ status: 1, sortOrder: 1, createdAt: -1 }),
        db.collection('membership_task_submissions').createIndex({ store_id: 1, task_code: 1 }, { unique: true }),
        db.collection('membership_task_submissions').createIndex({ status: 1, submittedAt: -1 }),
        db.collection('membership_task_rewards').createIndex({ store_id: 1, task_code: 1, subject_key: 1 }, { unique: true }),
        db.collection('membership_task_rewards').createIndex({ store_id: 1, createdAt: -1 })
      ]);
    }).catch((err) => {
      collectionsPromise = null;
      throw err;
    });
  }
  return collectionsPromise;
}

async function initializeMembership() {
  await ensureCollections();
  const now = Date.now();
  await db.collection('membership_settings').updateOne(
    { _id: 'rollout' },
    { $setOnInsert: { rolloutAt: now, legacyExpiresAt: LEGACY_FREE_EXPIRES_AT, createdAt: now } },
    { upsert: true }
  );
}

async function getRolloutSettings() {
  await initializeMembership();
  return db.collection('membership_settings').findOne({ _id: 'rollout' });
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCode(code) {
  return crypto
    .createHash('sha256')
    .update(`${normalizeCode(code)}:${config.jwtSecret}`)
    .digest('hex');
}

function redeemCodeEncryptionKey() {
  return crypto
    .createHash('sha256')
    .update(`${config.jwtSecret}:membership-redeem-code:v1`)
    .digest();
}

function encryptRedeemCode(code) {
  const displayCode = String(code || '').trim().toUpperCase();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', redeemCodeEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(displayCode, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptRedeemCode(ciphertext, expectedHash) {
  if (!ciphertext) return '';
  try {
    const [version, ivText, authTagText, encryptedText] = String(ciphertext).split('.');
    if (version !== 'v1' || !ivText || !authTagText || !encryptedText) return '';
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      redeemCodeEncryptionKey(),
      Buffer.from(ivText, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(authTagText, 'base64url'));
    const code = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final()
    ]).toString('utf8').trim().toUpperCase();
    return code && (!expectedHash || hashCode(code) === expectedHash) ? code : '';
  } catch (err) {
    return '';
  }
}

function randomCode() {
  let raw = '';
  for (let i = 0; i < 12; i += 1) {
    raw += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `PM-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function getStore(storeId) {
  if (!storeId) return null;
  const rows = await db.findMany('stores', { store_id: storeId }, { limit: 1 });
  return rows.length ? rows[0] : null;
}

async function canManageStore(store, openid, ownerOnly = false) {
  if (!store || !openid) return false;
  if (store.ownerOpenid === openid) return true;
  if (ownerOnly) return false;
  return Array.isArray(store.staffOpenids) && store.staffOpenids.includes(openid);
}

async function getSubscription(storeId) {
  await ensureCollections();
  return db.collection('store_subscriptions').findOne({ store_id: storeId });
}

async function ensureBootstrapEntitlements(store, rollout) {
  if (!store || !store.store_id) return;
  const registeredAt = Number(store.createTime || store.approvedAt) || 0;
  const trialStartAt = Number(store.approvedAt || registeredAt) || registeredAt;
  const rolloutAt = Number(rollout && rollout.rolloutAt) || Date.now();
  const legacyExpiresAt = Number(rollout && rollout.legacyExpiresAt) || LEGACY_FREE_EXPIRES_AT;
  let entitlement = null;
  if (registeredAt && registeredAt < rolloutAt) {
    entitlement = {
      idempotencyKey: `migration:${store.store_id}`,
      sourceType: 'migration',
      source: 'legacy_migration',
      startAt: registeredAt,
      expireAt: legacyExpiresAt
    };
  } else if (registeredAt) {
    const businessIdentity = [store.legalName, store.contactPhone].map((item) => String(item || '').trim()).filter(Boolean).join('|');
    const subjectRaw = String(businessIdentity || store.businessLicense || store.store_id).trim().toLowerCase();
    const trialSubjectKey = crypto.createHash('sha256').update(subjectRaw || store.store_id).digest('hex');
    const priorTrial = await db.collection('membership_entitlements').findOne({ trialSubjectKey });
    if (priorTrial && priorTrial.store_id !== store.store_id) return;
    entitlement = {
      idempotencyKey: `trial:${store.store_id}`,
      trialSubjectKey,
      sourceType: 'trial',
      source: 'registration_trial',
      startAt: trialStartAt,
      expireAt: trialStartAt + TRIAL_DURATION_MS
    };
  }
  if (!entitlement) return;
  try {
    await db.collection('membership_entitlements').updateOne(
      { idempotencyKey: entitlement.idempotencyKey },
      {
        $setOnInsert: {
          store_id: store.store_id,
          ...entitlement,
          status: 'active',
          createTime: Date.now()
        }
      },
      { upsert: true }
    );
  } catch (err) {
    if (!(err && err.code === 11000 && entitlement.sourceType === 'trial')) throw err;
  }
}

async function ensureStoreBootstrap(storeId) {
  await ensureBootstrapEntitlements(await getStore(storeId), await getRolloutSettings());
}

async function buildMembership(storeId) {
  const now = Date.now();
  const [subscription, store, rollout] = await Promise.all([
    getSubscription(storeId),
    getStore(storeId),
    getRolloutSettings()
  ]);
  await ensureBootstrapEntitlements(store, rollout);
  const entitlements = await db.collection('membership_entitlements').find({
    store_id: storeId,
    status: 'active',
    expireAt: { $gt: now }
  }).toArray();
  if (!config.membership.enabled) {
    return {
      active: true,
      accessActive: true,
      subscriptionActive: false,
      migrationActive: false,
      trialActive: false,
      promotionActive: false,
      accessType: 'disabled',
      statusType: 'granted',
      expireAt: null,
      expireAtText: '',
      trialExpireAt: null,
      trialExpireAtText: '',
      trialDaysRemaining: 0,
      enabled: false,
      payConfigured: false,
      canPurchase: false
    };
  }
  const subscriptionExpireAt = Number(subscription && subscription.expireAt) || 0;
  const currentEntitlements = entitlements.filter((item) => Number(item.startAt) <= now);
  const hasType = (type) => currentEntitlements.some((item) => item.sourceType === type);
  const hasRecordedSubscription = currentEntitlements.some((item) => !['promotion', 'migration', 'trial'].includes(item.sourceType));
  const hasRecordedAggregate = entitlements.some((item) => ['subscription', 'promotion'].includes(item.sourceType));
  const legacyAggregateActive = subscriptionExpireAt > now && !hasRecordedAggregate;
  const legacyPromotion = legacyAggregateActive && /^task_/.test(String(subscription && subscription.lastSource || ''));
  const subscriptionActive = hasRecordedSubscription || (legacyAggregateActive && !legacyPromotion);
  const promotionActive = hasType('promotion') || legacyPromotion;
  const migrationActive = hasType('migration');
  const trialActive = hasType('trial');
  const trialEntitlement = entitlements.find((item) => item.sourceType === 'trial');
  const trialExpireAt = Number(trialEntitlement && trialEntitlement.expireAt) || 0;
  const active = subscriptionActive || promotionActive || migrationActive || trialActive;
  const expireAt = Math.max(subscriptionExpireAt, ...entitlements.map((item) => Number(item.expireAt) || 0));
  const accessType = subscriptionActive ? 'subscription' : (promotionActive ? 'promotion' : (migrationActive ? 'migration' : (trialActive ? 'trial' : 'expired')));
  return {
    active,
    accessActive: active,
    subscriptionActive,
    migrationActive,
    trialActive,
    promotionActive,
    accessType,
    statusType: subscriptionActive ? 'subscribed' : (promotionActive || migrationActive ? 'granted' : (trialActive ? 'trial' : 'expired')),
    expireAt: active ? expireAt : null,
    expireAtText: active ? formatDate(expireAt) : '',
    trialExpireAt: trialExpireAt || null,
    trialExpireAtText: trialExpireAt ? formatDate(trialExpireAt) : '',
    trialDaysRemaining: trialActive ? Math.max(1, Math.ceil((trialExpireAt - now) / 86400000)) : 0,
    enabled: config.membership.enabled,
    payConfigured: config.membership.payEnabled && wechatPayService.credentialsReady()
  };
}

async function getMembershipStatus(event, openid) {
  const storeId = String(event.store_id || '').trim();
  const store = await getStore(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  if (!await canManageStore(store, openid)) return { success: false, errMsg: '无权查看该门店订阅' };
  const membership = await buildMembership(storeId);
  membership.canPurchase = store.ownerOpenid === openid;
  return {
    success: true,
    membership,
    plans: PLANS.map(({ amountFen, months, ...plan }) => plan)
  };
}

function sourceTypeFor(source) {
  return /^task_/.test(String(source || '')) ? 'promotion' : 'subscription';
}

async function idempotentUpsert(collectionName, filter, update) {
  try {
    return await db.collection(collectionName).updateOne(filter, update, { upsert: true });
  } catch (err) {
    if (err && err.code === 11000) return null;
    throw err;
  }
}

async function extendMembershipAtomic({ storeId, months, days, source, actor, referenceId }) {
  await ensureCollections();
  await ensureStoreBootstrap(storeId);
  const now = Date.now();
  const currentSubscription = await db.collection('store_subscriptions').findOne({ store_id: storeId });
  if (currentSubscription && Number(currentSubscription.expireAt) > now) {
    const currentRecorded = await db.collection('membership_entitlements').findOne({
      store_id: storeId,
      status: 'active',
      sourceType: { $in: ['subscription', 'promotion'] },
      startAt: { $lte: now },
      expireAt: { $gt: now }
    });
    if (!currentRecorded) {
      const legacyKey = `legacy:${storeId}:${Number(currentSubscription.expireAt)}`;
      await idempotentUpsert('membership_entitlements',
        { idempotencyKey: legacyKey },
        {
          $setOnInsert: {
            idempotencyKey: legacyKey,
            store_id: storeId,
            sourceType: sourceTypeFor(currentSubscription.lastSource),
            source: currentSubscription.lastSource || 'legacy_subscription',
            startAt: now,
            expireAt: Number(currentSubscription.expireAt),
            status: 'active',
            createTime: now
          }
        }
      );
    }
  }
  const idempotencyKey = `${source || 'membership'}:${referenceId || ''}`;
  const safeMonths = months == null ? null : Math.min(Math.max(parseInt(months, 10) || 1, 1), 120);
  const safeDays = days == null ? null : Math.min(Math.max(parseInt(days, 10) || 1, 1), 3650);
  const activeEntitlement = await db.collection('membership_entitlements').find({
    store_id: storeId,
    status: 'active',
    expireAt: { $gt: now }
  }).sort({ expireAt: -1 }).limit(1).next();
  const minimumBase = Math.max(now, Number(activeEntitlement && activeEntitlement.expireAt) || 0);
  const grantsExpr = { $ifNull: ['$appliedGrants', []] };
  const grantKeysExpr = { $map: { input: grantsExpr, as: 'grant', in: '$$grant.key' } };
  const alreadyAppliedExpr = { $in: [idempotencyKey, grantKeysExpr] };
  const baseExpr = { $max: [minimumBase, { $ifNull: ['$expireAt', 0] }] };
  const expireExpr = safeDays == null
    ? { $toLong: { $dateAdd: { startDate: { $toDate: baseExpr }, unit: 'month', amount: safeMonths } } }
    : { $add: [baseExpr, safeDays * 86400000] };
  const result = await db.collection('store_subscriptions').findOneAndUpdate(
    { store_id: storeId },
    [{
      $set: {
        store_id: storeId,
        tier: 'pro',
        expireAt: { $cond: [alreadyAppliedExpr, { $ifNull: ['$expireAt', 0] }, expireExpr] },
        lastSource: { $cond: [alreadyAppliedExpr, '$lastSource', source || ''] },
        updateTime: { $cond: [alreadyAppliedExpr, '$updateTime', now] },
        createTime: { $ifNull: ['$createTime', now] },
        appliedGrants: {
          $cond: [
            alreadyAppliedExpr,
            grantsExpr,
            { $concatArrays: [grantsExpr, [{ key: idempotencyKey, startAt: baseExpr, expireAt: expireExpr, source: source || '', createdAt: now }]] }
          ]
        }
      }
    }],
    { upsert: true, returnDocument: 'after' }
  );
  const updated = result && (result.value || result);
  const grant = Array.isArray(updated && updated.appliedGrants)
    ? updated.appliedGrants.find((item) => item && item.key === idempotencyKey)
    : null;
  if (!grant) throw new Error('会员权益原子发放失败');
  const expireAt = Number(grant.expireAt) || 0;
  const startAt = Number(grant.startAt) || now;
  await idempotentUpsert('membership_entitlements',
    { idempotencyKey },
    {
      $setOnInsert: {
        idempotencyKey,
        store_id: storeId,
        sourceType: sourceTypeFor(source),
        source: source || '',
        actor: actor || '',
        referenceId: referenceId || '',
        startAt,
        expireAt,
        ...(safeDays == null ? { months: safeMonths } : { days: safeDays }),
        status: 'active',
        createTime: now
      }
    }
  );
  await idempotentUpsert('membership_events',
    { idempotencyKey },
    {
      $setOnInsert: {
        idempotencyKey,
        store_id: storeId,
        type: 'extend',
        source,
        ...(safeDays == null ? { months: safeMonths } : { days: safeDays }),
        previousExpireAt: startAt,
        expireAt,
        actor: actor || '',
        referenceId: referenceId || '',
        createdAt: now
      }
    }
  );
  return expireAt;
}

async function extendSubscription(storeId, months, source, actor, referenceId) {
  return extendMembershipAtomic({ storeId, months, source, actor, referenceId });
}

async function extendSubscriptionDays(storeId, days, source, actor, referenceId) {
  return extendMembershipAtomic({ storeId, days, source, actor, referenceId });
}

async function revokeMembershipEntitlement(source, referenceId, actor) {
  await ensureCollections();
  const idempotencyKey = `${source}:${referenceId}`;
  let entitlement = await db.collection('membership_entitlements').findOne({ idempotencyKey });
  if (!entitlement) {
    const event = await db.collection('membership_events').findOne({ source, referenceId, type: 'extend' });
    if (!event) return { revoked: false, duplicate: true };
    entitlement = {
      store_id: event.store_id,
      startAt: Number(event.previousExpireAt) || Number(event.createdAt) || Date.now(),
      expireAt: Number(event.expireAt) || 0
    };
  }
  const now = Date.now();
  const duration = Math.max(0, Number(entitlement.expireAt) - Number(entitlement.startAt));
  const revokedKeysExpr = { $ifNull: ['$revokedGrantKeys', []] };
  const alreadyRevokedExpr = { $in: [idempotencyKey, revokedKeysExpr] };
  const grantsExpr = { $ifNull: ['$appliedGrants', []] };
  const result = await db.collection('store_subscriptions').findOneAndUpdate(
    { store_id: entitlement.store_id },
    [{
      $set: {
        expireAt: {
          $cond: [alreadyRevokedExpr, '$expireAt', { $max: [now, { $subtract: [{ $ifNull: ['$expireAt', now] }, duration] }] }]
        },
        revokedGrantKeys: {
          $cond: [alreadyRevokedExpr, revokedKeysExpr, { $concatArrays: [revokedKeysExpr, [idempotencyKey]] }]
        },
        appliedGrants: {
          $cond: [
            alreadyRevokedExpr,
            grantsExpr,
            {
              $map: {
                input: grantsExpr,
                as: 'grant',
                in: {
                  $cond: [
                    { $and: [{ $ne: ['$$grant.key', idempotencyKey] }, { $gte: ['$$grant.startAt', Number(entitlement.expireAt)] }] },
                    { $mergeObjects: ['$$grant', { startAt: { $subtract: ['$$grant.startAt', duration] }, expireAt: { $subtract: ['$$grant.expireAt', duration] } }] },
                    '$$grant'
                  ]
                }
              }
            }
          ]
        },
        updateTime: { $cond: [alreadyRevokedExpr, '$updateTime', now] }
      }
    }],
    { returnDocument: 'before' }
  );
  const previous = result && (result.value || result);
  const alreadyRevoked = Array.isArray(previous && previous.revokedGrantKeys)
    && previous.revokedGrantKeys.includes(idempotencyKey);
  await db.collection('membership_entitlements').updateOne(
    { idempotencyKey },
    {
      $set: { status: 'revoked', revokedAt: now, revokedBy: actor || 'system' },
      $setOnInsert: {
        idempotencyKey,
        store_id: entitlement.store_id,
        sourceType: sourceTypeFor(source),
        source,
        referenceId,
        startAt: Number(entitlement.startAt),
        expireAt: Number(entitlement.expireAt),
        createTime: now
      }
    },
    { upsert: true }
  );
  if (duration > 0) {
    await db.collection('membership_entitlements').updateMany(
      {
        store_id: entitlement.store_id,
        status: 'active',
        sourceType: { $in: ['subscription', 'promotion'] },
        startAt: { $gte: Number(entitlement.expireAt) },
        shiftedByRevocations: { $ne: idempotencyKey }
      },
      [{
        $set: {
          startAt: { $subtract: ['$startAt', duration] },
          expireAt: { $subtract: ['$expireAt', duration] },
          shiftedByRevocations: { $concatArrays: [{ $ifNull: ['$shiftedByRevocations', []] }, [idempotencyKey]] }
        }
      }]
    );
  }
  await db.collection('membership_events').updateOne(
    { idempotencyKey: `revoke:${idempotencyKey}` },
    {
      $setOnInsert: {
        idempotencyKey: `revoke:${idempotencyKey}`,
        store_id: entitlement.store_id,
        type: 'revoke',
        source,
        referenceId,
        revokedEntitlementId: entitlement._id ? String(entitlement._id) : idempotencyKey,
        durationMs: duration,
        actor: actor || 'system',
        createdAt: now
      }
    },
    { upsert: true }
  );
  return { revoked: !alreadyRevoked, duplicate: alreadyRevoked, storeId: entitlement.store_id };
}

async function grantTaskReward(storeId, taskCode, subjectKey, actor, referenceId, durationMonths = 1) {
  await ensureCollections();
  await ensureStoreBootstrap(storeId);
  const now = Date.now();
  const months = Math.min(Math.max(parseInt(durationMonths, 10) || 1, 1), 120);
  let existing = await db.collection('membership_task_rewards').findOne({
    store_id: storeId, task_code: taskCode, subject_key: String(subjectKey)
  });
  if (existing && existing.status === 'granted') return { granted: false, duplicate: true, expireAt: existing.expireAt || null };
  if (!existing) {
    try {
      const inserted = await db.collection('membership_task_rewards').insertOne({
        store_id: storeId,
        task_code: taskCode,
        subject_key: String(subjectKey),
        months,
        status: 'granting',
        actor: actor || 'system',
        referenceId: referenceId || '',
        createdAt: now
      });
      existing = { _id: inserted.insertedId, status: 'granting' };
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      existing = await db.collection('membership_task_rewards').findOne({
        store_id: storeId, task_code: taskCode, subject_key: String(subjectKey)
      });
      if (existing && existing.status === 'granted') return { granted: false, duplicate: true, expireAt: existing.expireAt || null };
    }
  }
  const expireAt = await extendSubscription(
    storeId, months, `task_${taskCode}`, actor || 'system', referenceId || String(existing._id)
  );
  await db.collection('membership_task_rewards').updateOne(
    { _id: existing._id },
    { $set: { status: 'granted', grantedAt: Date.now(), expireAt } }
  );
  return { granted: true, expireAt };
}

async function grantTaskRewardDays(storeId, taskCode, subjectKey, actor, referenceId, durationDays) {
  await ensureCollections();
  await ensureStoreBootstrap(storeId);
  const now = Date.now();
  const days = Math.min(Math.max(parseInt(durationDays, 10) || 1, 1), 3650);
  let existing = await db.collection('membership_task_rewards').findOne({
    store_id: storeId, task_code: taskCode, subject_key: String(subjectKey)
  });
  if (existing && existing.status === 'granted') return { granted: false, duplicate: true, expireAt: existing.expireAt || null };
  if (!existing) {
    try {
      const inserted = await db.collection('membership_task_rewards').insertOne({
      store_id: storeId,
      task_code: taskCode,
      subject_key: String(subjectKey),
      days,
      status: 'granting',
      actor: actor || 'system',
      referenceId: referenceId || '',
      createdAt: now
      });
      existing = { _id: inserted.insertedId, status: 'granting' };
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      existing = await db.collection('membership_task_rewards').findOne({
        store_id: storeId, task_code: taskCode, subject_key: String(subjectKey)
      });
      if (existing && existing.status === 'granted') return { granted: false, duplicate: true, expireAt: existing.expireAt || null };
    }
  }
  const expireAt = await extendSubscriptionDays(
    storeId, days, `task_${taskCode}`, actor || 'system', referenceId || String(existing._id)
  );
  await db.collection('membership_task_rewards').updateOne(
    { _id: existing._id },
    { $set: { status: 'granted', grantedAt: Date.now(), expireAt } }
  );
  return { granted: true, expireAt };
}

function normalizePromotionTaskInput(input = {}) {
  const title = String(input.title || '').trim().slice(0, 80);
  const description = String(input.description || '').trim().slice(0, 500);
  const requirementText = String(input.requirementText || '').trim().slice(0, 500);
  const rewardMonths = Math.min(Math.max(parseInt(input.rewardMonths, 10) || 1, 1), 120);
  const status = ['draft', 'published', 'paused'].includes(String(input.status)) ? String(input.status) : 'draft';
  const startsAt = input.startsAt ? new Date(input.startsAt).getTime() : null;
  const endsAt = input.endsAt ? new Date(input.endsAt).getTime() : null;
  const sortOrder = Math.min(Math.max(parseInt(input.sortOrder, 10) || 0, -9999), 9999);
  return { title, description, requirementText, rewardMonths, status, startsAt, endsAt, sortOrder };
}

async function listPromotionTasksAdmin() {
  await ensureCollections();
  const rows = await db.collection('membership_promotion_tasks').find({}).sort({ sortOrder: 1, createdAt: -1 }).toArray();
  return { success: true, tasks: rows.map((item) => ({ ...item, id: String(item._id) })) };
}

async function savePromotionTask(input, adminUsername) {
  await ensureCollections();
  const task = normalizePromotionTaskInput(input);
  if (!task.title || !task.description || !task.requirementText) {
    return { success: false, errMsg: '请完整填写任务标题、任务说明和截图要求' };
  }
  if (task.startsAt && task.endsAt && task.endsAt <= task.startsAt) {
    return { success: false, errMsg: '结束时间必须晚于开始时间' };
  }
  const now = Date.now();
  const _id = db.toObjectId(String(input.id || ''));
  if (_id) {
    const existing = await db.collection('membership_promotion_tasks').findOne({ _id });
    if (!existing) return { success: false, errMsg: '推广任务不存在' };
    await db.collection('membership_promotion_tasks').updateOne(
      { _id },
      { $set: { ...task, updatedAt: now, updatedBy: adminUsername || '', publishedAt: task.status === 'published' ? (existing.publishedAt || now) : existing.publishedAt || null } }
    );
    return { success: true, id: String(_id) };
  }
  const code = `promo_${now}_${crypto.randomBytes(3).toString('hex')}`;
  const result = await db.collection('membership_promotion_tasks').insertOne({
    code,
    ...task,
    createdAt: now,
    createdBy: adminUsername || '',
    updatedAt: now,
    updatedBy: adminUsername || '',
    publishedAt: task.status === 'published' ? now : null
  });
  return { success: true, id: String(result.insertedId), code };
}

async function updatePromotionTaskStatus(input, adminUsername) {
  await ensureCollections();
  const _id = db.toObjectId(String(input.id || ''));
  const status = String(input.status || '');
  if (!_id || !['published', 'paused'].includes(status)) return { success: false, errMsg: '任务状态参数不正确' };
  const now = Date.now();
  const update = { status, updatedAt: now, updatedBy: adminUsername || '' };
  if (status === 'published') update.publishedAt = now;
  const result = await db.collection('membership_promotion_tasks').updateOne({ _id }, { $set: update });
  if (!result.matchedCount) return { success: false, errMsg: '推广任务不存在' };
  return { success: true };
}

async function getPromotionTasks(event, openid) {
  await ensureCollections();
  const storeId = String(event.store_id || '').trim();
  const store = await getStore(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  if (!await canManageStore(store, openid)) return { success: false, errMsg: '无权查看该门店任务' };
  const now = Date.now();
  const tasks = await db.collection('membership_promotion_tasks').find({
    status: 'published',
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gt: now } }] }
    ]
  }).sort({ sortOrder: 1, createdAt: -1 }).toArray();
  const codes = tasks.map((item) => item.code);
  const submissions = codes.length
    ? await db.collection('membership_task_submissions').find({ store_id: storeId, task_code: { $in: codes } }).toArray()
    : [];
  const submissionByCode = new Map(submissions.map((item) => [item.task_code, item]));
  return {
    success: true,
    tasks: tasks.map((item) => {
      const submission = submissionByCode.get(item.code) || {};
      return {
        code: item.code,
        title: item.title,
        description: item.description,
        requirementText: item.requirementText,
        rewardText: item.rewardMode === 'like_days' ? '每获得 1 个赞赠送 1 天使用期限，多平台点赞数可合并核验' : `审核通过赠送 ${item.rewardMonths || 1} 个月使用权限`,
        status: submission.status || 'available',
        proofUrl: submission.proofUrl || '',
        reviewNote: submission.reviewNote || '',
        canSubmit: store.ownerOpenid === openid
      };
    })
  };
}

async function submitPromotionProof(event, openid) {
  await ensureCollections();
  const storeId = String(event.store_id || '').trim();
  const taskCode = String(event.task_code || '').trim();
  const proofUrl = String(event.proof_url || '').trim();
  const allowedProofBases = [config.oss && config.oss.publicBaseUrl, config.media && config.media.publicBaseUrl]
    .filter(Boolean);
  let validProofUrl = false;
  try {
    const parsed = new URL(proofUrl);
    validProofUrl = parsed.protocol === 'https:' && allowedProofBases.some((base) => {
      const allowed = new URL(base);
      return parsed.host === allowed.host && parsed.pathname.includes('/promotion-proofs/');
    });
  } catch (err) {
    validProofUrl = false;
  }
  if (validProofUrl) {
    const objectKey = oss.extractObjectKey(proofUrl);
    const imageExt = /\.(jpe?g|png|webp)$/i.test(objectKey);
    let imageSizeValid = false;
    try {
      const imagePath = oss.absolutePathForKey(objectKey);
      imageSizeValid = fs.existsSync(imagePath) && fs.statSync(imagePath).size > 0 && fs.statSync(imagePath).size <= 10 * 1024 * 1024;
    } catch (err) {
      imageSizeValid = false;
    }
    validProofUrl = imageExt && imageSizeValid;
  }
  if (!validProofUrl) return { success: false, errMsg: '请上传平台生成的推广截图' };
  const store = await getStore(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  if (!await canManageStore(store, openid, true)) return { success: false, errMsg: '仅店主可以提交推广审核' };
  const now = Date.now();
  const task = await db.collection('membership_promotion_tasks').findOne({ code: taskCode, status: 'published' });
  if (!task || (task.startsAt && task.startsAt > now) || (task.endsAt && task.endsAt <= now)) {
    return { success: false, errMsg: '推广任务不存在或已结束' };
  }
  const existing = await db.collection('membership_task_submissions').findOne({ store_id: storeId, task_code: taskCode });
  if (existing && ['pending', 'reviewing'].includes(existing.status)) return { success: false, errMsg: '该任务正在审核中' };
  if (existing && existing.status === 'approved') return { success: false, errMsg: '该任务已审核通过' };
  const submissionUpdate = {
    $set: {
      proofUrl,
      screenshotUrl: proofUrl,
      status: 'pending',
      rewardMonthsSnapshot: Number(task.rewardMonths) || 1,
      rewardModeSnapshot: task.rewardMode || 'fixed_months',
      taskTitleSnapshot: task.title,
      submittedAt: now,
      submittedBy: openid,
      updateTime: now
    },
    $unset: { reviewNote: '', reviewedAt: '', reviewedBy: '', rewardGranted: '', reviewStartedAt: '' }
  };
  if (existing) {
    const updated = await db.collection('membership_task_submissions').updateOne(
      { _id: existing._id, status: existing.status },
      submissionUpdate
    );
    if (!updated.modifiedCount) return { success: false, errMsg: '任务状态已变化，请刷新后重试' };
  } else {
    try {
      await db.collection('membership_task_submissions').insertOne({
        store_id: storeId,
        task_code: taskCode,
        ...submissionUpdate.$set,
        createTime: now
      });
    } catch (err) {
      if (err && err.code === 11000) return { success: false, errMsg: '任务已提交，请刷新查看状态' };
      throw err;
    }
  }
  return { success: true };
}

async function listTaskSubmissions(query = {}) {
  await ensureCollections();
  const status = String(query.status || 'pending');
  const promotionTasks = await db.collection('membership_promotion_tasks').find({}).toArray();
  const promotionCodes = promotionTasks.map((item) => item.code);
  if (!promotionCodes.length) return { success: true, submissions: [] };
  const filter = status === 'all'
    ? { task_code: { $in: promotionCodes } }
    : { status: status === 'pending' ? { $in: ['pending', 'reviewing'] } : status, task_code: { $in: promotionCodes } };
  const rows = await db.collection('membership_task_submissions').find(filter).sort({ submittedAt: -1 }).limit(300).toArray();
  const stores = await db.collection('stores').find({ store_id: { $in: rows.map((item) => item.store_id) } }).project({ store_id: 1, name: 1, storeName: 1 }).toArray();
  const names = new Map(stores.map((item) => [item.store_id, item.name || item.storeName || item.store_id]));
  const taskByCode = new Map(promotionTasks.map((item) => [item.code, item]));
  return { success: true, submissions: rows.map((item) => { const task = taskByCode.get(item.task_code) || {}; return { id: String(item._id), storeId: item.store_id, storeName: names.get(item.store_id) || item.store_id, taskCode: item.task_code, taskTitle: item.taskTitleSnapshot || task.title || item.task_code, rewardMode: item.rewardModeSnapshot || task.rewardMode || 'fixed_months', rewardMonths: item.rewardMonthsSnapshot || task.rewardMonths || 1, screenshotUrl: item.proofUrl || item.screenshotUrl, status: item.status, submittedAt: item.submittedAt, reviewedAt: item.reviewedAt || null, reviewedBy: item.reviewedBy || '', reviewNote: item.reviewNote || '' }; }) };
}

async function reviewTaskSubmission(input, adminUsername) {
  await ensureCollections();
  const _id = db.toObjectId(String(input.id || ''));
  const decision = String(input.decision || '');
  const reviewNote = String(input.note || '').trim().slice(0, 200);
  if (!_id || !['approve', 'reject'].includes(decision)) return { success: false, errMsg: '审核参数不正确' };
  const preview = await db.collection('membership_task_submissions').findOne({ _id });
  if (!preview) return { success: false, errMsg: '任务申请不存在' };
  const previewTask = await db.collection('membership_promotion_tasks').findOne({ code: preview.task_code });
  const rewardMode = preview.rewardModeSnapshot || (previewTask && previewTask.rewardMode) || 'fixed_months';
  const likeCount = Math.min(Math.max(parseInt(input.likeCount, 10) || 0, 0), 3650);
  if (decision === 'approve' && rewardMode === 'like_days' && likeCount < 1) {
    return { success: false, errMsg: '请填写核验后的点赞数' };
  }
  if (preview.status === 'approved' || preview.status === 'rejected') {
    return { success: false, errMsg: '该任务已经审核完成' };
  }
  if (preview.status === 'reviewing') {
    const grantedReward = await db.collection('membership_task_rewards').findOne({
      store_id: preview.store_id,
      task_code: preview.task_code,
      subject_key: 'once',
      status: 'granted'
    });
    if (grantedReward) {
      await db.collection('membership_task_submissions').updateOne(
        { _id, status: 'reviewing' },
        { $set: { status: 'approved', reviewedAt: Date.now(), reviewedBy: adminUsername || '', rewardGranted: true }, $unset: { reviewStartedAt: '' } }
      );
      return { success: true, duplicate: true };
    }
    if (Date.now() - Number(preview.reviewStartedAt || 0) < 2 * 60 * 1000) {
      return { success: false, errMsg: '该任务正在审核处理中' };
    }
  }
  if (decision === 'approve') await ensureStoreBootstrap(preview.store_id);
  const claimedResult = await db.collection('membership_task_submissions').findOneAndUpdate(
    {
      _id,
      $or: [
        { status: 'pending' },
        { status: 'reviewing', reviewStartedAt: { $lt: Date.now() - 2 * 60 * 1000 } }
      ]
    },
    { $set: { status: 'reviewing', reviewStartedAt: Date.now(), reviewedBy: adminUsername || '' } },
    { returnDocument: 'after' }
  );
  const submission = claimedResult && (claimedResult.value || claimedResult);
  if (!submission || !submission._id) return { success: false, errMsg: '该任务已被审核或正在处理中' };
  if (decision === 'reject') {
    await db.collection('membership_task_submissions').updateOne(
      { _id, status: 'reviewing' },
      { $set: { status: 'rejected', reviewNote, reviewedAt: Date.now(), reviewedBy: adminUsername || '' }, $unset: { reviewStartedAt: '' } }
    );
    return { success: true };
  }
  const reward = rewardMode === 'like_days'
    ? await grantTaskRewardDays(submission.store_id, submission.task_code, 'once', adminUsername || 'admin', String(_id), likeCount)
    : await grantTaskReward(submission.store_id, submission.task_code, 'once', adminUsername || 'admin', String(_id), submission.rewardMonthsSnapshot || 1);
  await db.collection('membership_task_submissions').updateOne(
    { _id, status: 'reviewing' },
    {
      $set: {
        status: 'approved',
        reviewNote,
        verifiedLikeCount: rewardMode === 'like_days' ? likeCount : null,
        rewardedDays: rewardMode === 'like_days' ? likeCount : null,
        reviewedAt: Date.now(),
        reviewedBy: adminUsername || '',
        rewardGranted: reward.granted || reward.duplicate
      },
      $unset: { reviewStartedAt: '' }
    }
  );
  return { success: true, duplicate: !!reward.duplicate };
}

async function redeemMembershipCode(event, openid) {
  await ensureCollections();
  const storeId = String(event.store_id || '').trim();
  const code = normalizeCode(event.code);
  if (!storeId || !code) return { success: false, errMsg: '请输入有效兑换码' };
  const store = await getStore(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  if (!await canManageStore(store, openid, true)) {
    return { success: false, errMsg: '仅店主可以兑换会员' };
  }

  const now = Date.now();
  await ensureStoreBootstrap(storeId);
  const claimedResult = await db.collection('membership_redeem_codes').findOneAndUpdate(
    {
      code_hash: hashCode(code),
      status: 'active',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    },
    {
      $set: {
        status: 'redeemed',
        redeemedAt: now,
        redeemedStoreId: storeId,
        redeemedBy: openid
      }
    },
    { returnDocument: 'after' }
  );
  let claimed = claimedResult && (claimedResult.value || claimedResult);
  if (!claimed || !claimed.code_hash) {
    const existing = await db.collection('membership_redeem_codes').findOne({ code_hash: hashCode(code) });
    if (existing && existing.status === 'redeemed' && existing.redeemedStoreId === storeId && existing.redeemedBy === openid) {
      claimed = existing;
    } else if (existing && existing.status === 'redeemed') {
      return { success: false, errCode: 'REDEEM_CODE_USED', errMsg: '该兑换码已被使用' };
    }
    if (existing && existing.status === 'void') return { success: false, errCode: 'REDEEM_CODE_VOID', errMsg: '该兑换码已作废' };
    if (existing && existing.expiresAt && existing.expiresAt <= now) return { success: false, errCode: 'REDEEM_CODE_EXPIRED', errMsg: '该兑换码已过期' };
    if (!claimed) return { success: false, errCode: 'REDEEM_CODE_INVALID', errMsg: '兑换码不存在或无效' };
  }
  const durationDays = Number(claimed.durationDays) || 0;
  const durationMonths = durationDays > 0 ? 0 : (Number(claimed.durationMonths) || 1);
  const expireAt = durationDays > 0
    ? await extendSubscriptionDays(storeId, durationDays, 'redeem_code', openid, String(claimed._id))
    : await extendSubscription(storeId, durationMonths, 'redeem_code', openid, String(claimed._id));
  return {
    success: true,
    grantedDays: durationDays || null,
    grantedMonths: durationMonths || null,
    expireAt,
    membership: await buildMembership(storeId)
  };
}

function newPayOrderId() {
  return `PMM${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function settleMembershipPay(payOrder, transaction) {
  if (!payOrder) throw new Error('会员支付订单不存在');
  if (!transaction || transaction.trade_state !== 'SUCCESS') return { paid: false };
  const cfg = config.membership.wechatPay || {};
  const amountFen = Number(transaction.amount && transaction.amount.total);
  if (transaction.out_trade_no !== payOrder.order_id) throw new Error('微信支付订单号不匹配');
  if (transaction.mchid !== cfg.mchId) throw new Error('微信支付商户号不匹配');
  if (transaction.appid !== config.wxApps.merchant.appId) throw new Error('微信支付AppID不匹配');
  if (amountFen !== Number(payOrder.amountFen)) throw new Error('微信支付金额不匹配');
  if (transaction.amount && transaction.amount.currency && transaction.amount.currency !== 'CNY') throw new Error('微信支付币种不匹配');

  await ensureStoreBootstrap(payOrder.store_id);
  const current = await db.collection('membership_pay_orders').findOne({ order_id: payOrder.order_id });
  if (!current) throw new Error('会员支付订单不存在');
  if (current.status === 'paid') return { paid: true, duplicate: true, expireAt: current.expireAt || null };
  const claim = await db.collection('membership_pay_orders').updateOne(
    { order_id: payOrder.order_id, status: { $in: ['pending', 'paying', 'processing', 'failed', 'closed', 'revoked'] } },
    { $set: { status: 'processing', transactionId: transaction.transaction_id || '', successTime: transaction.success_time || '', updateTime: Date.now() } }
  );
  if (!claim.modifiedCount) return { paid: false, duplicate: true };
  const expireAt = await extendSubscription(
    payOrder.store_id,
    Number(payOrder.months) || 1,
    'wechat_pay',
    payOrder.payerOpenid || '',
    payOrder.order_id
  );
  await db.collection('membership_pay_orders').updateOne(
    { order_id: payOrder.order_id, status: 'processing' },
    { $set: { status: 'paid', paidAt: Date.now(), expireAt, lastVerifiedAt: Date.now(), updateTime: Date.now() }, $unset: { settleError: '', activeKey: '' } }
  );
  return { paid: true, expireAt };
}

async function createMembershipPay(event, openid) {
  await ensureCollections();
  if (!config.membership.enabled) {
    return { success: false, errCode: 'MEMBERSHIP_DISABLED', errMsg: '会员服务当前已暂停，无需购买即可使用' };
  }
  if (!config.membership.payEnabled || !wechatPayService.credentialsReady()) {
    return { success: false, errCode: 'PAY_NOT_CONFIGURED', errMsg: '微信支付暂未配置，请使用兑换码开通' };
  }
  const storeId = String(event.store_id || '').trim();
  const planCode = String(event.plan_code || 'pro_monthly').trim();
  const plan = PLANS.find((item) => item.code === planCode);
  if (!plan) return { success: false, errMsg: '会员套餐不存在' };
  const store = await getStore(storeId);
  if (!store) return { success: false, errMsg: '店铺不存在' };
  if (!await canManageStore(store, openid, true)) return { success: false, errMsg: '仅店主可以购买会员' };
  if (!openid) return { success: false, errMsg: '无法获取支付用户身份' };

  const activeKey = `${storeId}:${openid}`;
  let openOrder = await db.collection('membership_pay_orders').findOne({
    activeKey,
    status: { $in: ['pending', 'paying'] }
  });
  if (openOrder && !openOrder.prepayId) {
    if (Date.now() - Number(openOrder.createTime || 0) < 2 * 60 * 1000) {
      return { success: false, errCode: 'PAY_ORDER_CREATING', errMsg: '支付订单正在创建，请稍后重试' };
    }
    await db.collection('membership_pay_orders').updateOne(
      { order_id: openOrder.order_id, status: 'pending' },
      { $set: { status: 'failed', failCode: 'CREATE_TIMEOUT', updateTime: Date.now() }, $unset: { activeKey: '' } }
    );
    openOrder = null;
  }
  if (openOrder && openOrder.planCode === plan.code && openOrder.prepayId && Number(openOrder.expiresAt) > Date.now()) {
    return {
      success: true,
      order_id: openOrder.order_id,
      reused: true,
      payment: wechatPayService.buildMiniProgramPayment(openOrder.prepayId)
    };
  }
  if (openOrder) {
    try {
      const transaction = await wechatPayService.queryTransaction(openOrder.order_id);
      if (transaction.trade_state === 'SUCCESS') {
        await settleMembershipPay(openOrder, transaction);
        return { success: false, errCode: 'PREVIOUS_ORDER_PAID', errMsg: '上一笔订单已支付，会员权益已到账，请刷新页面查看' };
      }
      if (['NOTPAY', 'USERPAYING'].includes(transaction.trade_state)) {
        await wechatPayService.closeTransaction(openOrder.order_id);
      }
    } catch (err) {
      if (!['ORDER_NOT_EXIST', 'ORDER_CLOSED'].includes(err && err.code)) {
        return { success: false, errCode: err.code || 'WECHAT_PAY_ERROR', errMsg: err.message || '处理上一笔支付订单失败' };
      }
    }
    await db.collection('membership_pay_orders').updateOne(
      { order_id: openOrder.order_id, status: { $ne: 'paid' } },
      { $set: { status: 'closed', updateTime: Date.now() }, $unset: { activeKey: '' } }
    );
  }

  const orderId = newPayOrderId();
  const now = Date.now();
  const expiresAt = now + 2 * 60 * 60 * 1000;
  const payOrder = {
    order_id: orderId,
    store_id: storeId,
    planCode: plan.code,
    planName: plan.name,
    months: plan.months,
    amountFen: plan.amountFen,
    payerOpenid: openid,
    appid: config.wxApps.merchant.appId,
    mchid: config.membership.wechatPay.mchId,
    activeKey,
    status: 'pending',
    expiresAt,
    createTime: now,
    updateTime: now
  };
  try {
    await db.collection('membership_pay_orders').insertOne(payOrder);
  } catch (err) {
    if (err && err.code === 11000) {
      const concurrent = await db.collection('membership_pay_orders').findOne({ activeKey });
      if (concurrent && concurrent.prepayId && concurrent.planCode === plan.code) {
        return {
          success: true,
          order_id: concurrent.order_id,
          reused: true,
          payment: wechatPayService.buildMiniProgramPayment(concurrent.prepayId)
        };
      }
      return { success: false, errCode: 'PAY_ORDER_CREATING', errMsg: '支付订单正在创建，请稍后重试' };
    }
    throw err;
  }
  try {
    const result = await wechatPayService.createJsapiOrder({
      orderId,
      amountFen: plan.amountFen,
      openid,
      description: `熠森宠物会员服务-${plan.name}`,
      attach: `membership:${storeId}:${plan.code}`.slice(0, 128),
      timeExpire: new Date(expiresAt).toISOString()
    });
    if (!result.prepay_id) throw new Error('微信支付未返回预支付编号');
    await db.collection('membership_pay_orders').updateOne(
      { order_id: orderId },
      { $set: { status: 'paying', prepayId: result.prepay_id, updateTime: Date.now() } }
    );
    return {
      success: true,
      order_id: orderId,
      payment: wechatPayService.buildMiniProgramPayment(result.prepay_id)
    };
  } catch (err) {
    await db.collection('membership_pay_orders').updateOne(
      { order_id: orderId },
      { $set: { status: 'failed', failCode: err.code || '', failMessage: String(err.message || err).slice(0, 200), updateTime: Date.now() }, $unset: { activeKey: '' } }
    );
    return { success: false, errCode: err.code || 'WECHAT_PAY_ERROR', errMsg: err.message || '创建支付失败' };
  }
}

async function queryMembershipPay(event, openid) {
  await ensureCollections();
  const orderId = String(event.order_id || '').trim();
  const payOrder = await db.collection('membership_pay_orders').findOne({ order_id: orderId });
  if (!payOrder) return { success: false, errMsg: '支付订单不存在' };
  const store = await getStore(payOrder.store_id);
  if (!await canManageStore(store, openid, true)) return { success: false, errMsg: '无权查询该支付订单' };
  if (payOrder.status === 'paid') {
    if (Date.now() - Number(payOrder.lastVerifiedAt || payOrder.paidAt || 0) < 5 * 60 * 1000) {
      return { success: true, status: 'paid', membership: await buildMembership(payOrder.store_id) };
    }
  }
  if (payOrder.status === 'refunded') {
    return { success: true, status: 'refunded', tradeState: 'REFUND', membership: await buildMembership(payOrder.store_id) };
  }
  if (['closed', 'revoked', 'failed', 'payerror'].includes(payOrder.status)) {
    return { success: true, status: 'failed', tradeState: payOrder.tradeState || payOrder.status.toUpperCase() };
  }
  if (!config.membership.payEnabled || !wechatPayService.credentialsReady()) {
    return { success: false, errCode: 'PAY_NOT_CONFIGURED', errMsg: '微信支付配置尚未完成' };
  }
  try {
    const transaction = await wechatPayService.queryTransaction(orderId);
    if (transaction.trade_state === 'SUCCESS') {
      const settled = await settleMembershipPay(payOrder, transaction);
      await db.collection('membership_pay_orders').updateOne(
        { order_id: orderId, status: 'paid' },
        { $set: { lastVerifiedAt: Date.now(), updateTime: Date.now() } }
      );
      if (settled.paid) return { success: true, status: 'paid', membership: await buildMembership(payOrder.store_id) };
      return { success: true, status: 'pending' };
    }
    if (transaction.trade_state === 'REFUND') {
      await revokeMembershipEntitlement('wechat_pay', orderId, 'wechat_pay_refund');
      await db.collection('membership_pay_orders').updateOne(
        { order_id: orderId },
        { $set: { status: 'refunded', tradeState: 'REFUND', refundedAt: Date.now(), updateTime: Date.now() }, $unset: { activeKey: '' } }
      );
      return { success: true, status: 'refunded', tradeState: 'REFUND', membership: await buildMembership(payOrder.store_id) };
    }
    const terminalStatus = {
      CLOSED: 'closed',
      REVOKED: 'revoked',
      PAYERROR: 'payerror'
    }[transaction.trade_state];
    if (terminalStatus) {
      await db.collection('membership_pay_orders').updateOne(
        { order_id: orderId, status: { $ne: 'paid' } },
        { $set: { status: terminalStatus, tradeState: transaction.trade_state, updateTime: Date.now() }, $unset: { activeKey: '' } }
      );
      return { success: true, status: 'failed', tradeState: transaction.trade_state };
    }
    return { success: true, status: 'pending', tradeState: transaction.trade_state || '' };
  } catch (err) {
    if (err.code === 'ORDER_NOT_EXIST') {
      if (Date.now() - Number(payOrder.createTime || 0) < 5 * 60 * 1000) return { success: true, status: 'pending' };
      await db.collection('membership_pay_orders').updateOne(
        { order_id: orderId, status: { $ne: 'paid' } },
        { $set: { status: 'failed', tradeState: 'ORDER_NOT_EXIST', updateTime: Date.now() }, $unset: { activeKey: '' } }
      );
      return { success: true, status: 'failed', tradeState: 'ORDER_NOT_EXIST' };
    }
    return { success: false, errCode: err.code || 'WECHAT_PAY_ERROR', errMsg: err.message || '查询支付失败' };
  }
}

async function reconcilePaidMembershipOrders() {
  if (!config.membership.payEnabled || !wechatPayService.credentialsReady()) return { checked: 0, refunded: 0 };
  await ensureCollections();
  const staleBefore = Date.now() - 6 * 60 * 60 * 1000;
  const orders = await db.collection('membership_pay_orders').find({
    status: 'paid',
    $or: [{ lastVerifiedAt: { $lt: staleBefore } }, { lastVerifiedAt: { $exists: false } }]
  }).sort({ lastVerifiedAt: 1, paidAt: 1 }).limit(50).toArray();
  let refunded = 0;
  for (const payOrder of orders) {
    try {
      const transaction = await wechatPayService.queryTransaction(payOrder.order_id);
      if (transaction.trade_state === 'REFUND') {
        await revokeMembershipEntitlement('wechat_pay', payOrder.order_id, 'wechat_pay_refund');
        await db.collection('membership_pay_orders').updateOne(
          { order_id: payOrder.order_id },
          { $set: { status: 'refunded', tradeState: 'REFUND', refundedAt: Date.now(), lastVerifiedAt: Date.now(), updateTime: Date.now() } }
        );
        refunded += 1;
      } else {
        await db.collection('membership_pay_orders').updateOne(
          { order_id: payOrder.order_id, status: 'paid' },
          { $set: { tradeState: transaction.trade_state || '', lastVerifiedAt: Date.now(), updateTime: Date.now() } }
        );
      }
    } catch (err) {
      console.warn('[membership] payment reconcile failed', payOrder.order_id, err && err.message ? err.message : err);
    }
  }
  return { checked: orders.length, refunded };
}

function startMembershipPaymentReconcileWorker() {
  if (paymentReconcileTimer || !config.membership.payEnabled) return;
  const tick = () => reconcilePaidMembershipOrders().catch((err) => {
    console.warn('[membership] payment reconcile tick failed', err && err.message ? err.message : err);
  });
  const initialTimer = setTimeout(tick, 30 * 1000);
  if (initialTimer.unref) initialTimer.unref();
  paymentReconcileTimer = setInterval(tick, 6 * 60 * 60 * 1000);
  if (paymentReconcileTimer.unref) paymentReconcileTimer.unref();
}

async function handleMembershipPayNotification(rawBody, headers) {
  await ensureCollections();
  const parsed = wechatPayService.parseNotification(rawBody, headers);
  const transaction = parsed.transaction;
  if (!transaction || !transaction.out_trade_no) throw new Error('微信支付通知订单号缺失');
  const payOrder = await db.collection('membership_pay_orders').findOne({ order_id: transaction.out_trade_no });
  if (!payOrder) throw new Error('微信支付通知对应订单不存在');
  if (transaction.trade_state === 'SUCCESS') await settleMembershipPay(payOrder, transaction);
  else if (transaction.trade_state === 'REFUND') {
    await revokeMembershipEntitlement('wechat_pay', payOrder.order_id, 'wechat_pay_refund');
    await db.collection('membership_pay_orders').updateOne(
      { order_id: payOrder.order_id },
      { $set: { status: 'refunded', tradeState: 'REFUND', refundedAt: Date.now(), updateTime: Date.now() }, $unset: { activeKey: '' } }
    );
  } else {
    const status = { CLOSED: 'closed', REVOKED: 'revoked', PAYERROR: 'payerror' }[transaction.trade_state] || payOrder.status;
    await db.collection('membership_pay_orders').updateOne(
      { order_id: payOrder.order_id, status: { $ne: 'paid' } },
      {
        $set: { status, tradeState: transaction.trade_state || '', updateTime: Date.now() },
        ...(['closed', 'revoked', 'payerror'].includes(status) ? { $unset: { activeKey: '' } } : {})
      }
    );
  }
  return { success: true };
}

async function assertActiveMembership(storeId) {
  if (!config.membership.enabled) return { active: true, accessActive: true };
  const membership = await buildMembership(storeId);
  if (membership.active) return membership;
  const err = new Error('免费试用或会员服务已到期，请开通会员后继续使用');
  err.code = 'MEMBERSHIP_REQUIRED';
  err.membership = membership;
  throw err;
}

function storeIdFromEvent(event = {}) {
  return String(
    event.store_id || event.storeId
    || (event.shop && (event.shop.store_id || event.shop.storeId))
    || (event.order && (event.order.store_id || event.order.storeId))
    || (event.log && (event.log.store_id || event.log.storeId))
    || (event.entry && (event.entry.store_id || event.entry.storeId))
    || ''
  ).trim();
}

async function guardMerchantAction(event, openid) {
  if (!config.membership.enabled || !openid) return null;
  const requestedStoreId = storeIdFromEvent(event);
  let store = requestedStoreId ? await getStore(requestedStoreId) : null;
  if (store && !await canManageStore(store, openid)) return null;
  if (!store) {
    store = await db.collection('stores').findOne({
      $or: [{ ownerOpenid: openid }, { staffOpenids: openid }]
    });
  }
  if (!store || !store.store_id) return null;
  try {
    await assertActiveMembership(store.store_id);
    return null;
  } catch (err) {
    if (err && err.code === 'MEMBERSHIP_REQUIRED') {
      return { success: false, errCode: err.code, errMsg: err.message, membership: err.membership };
    }
    throw err;
  }
}

async function generateRedeemCodes(input, adminUsername) {
  await ensureCollections();
  const count = Math.min(Math.max(parseInt(input.count, 10) || 1, 1), 200);
  const note = String(input.note || '').trim().slice(0, 120);
  const durationDays = Math.min(Math.max(parseInt(input.durationDays, 10) || 1, 1), 3650);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).getTime() : null;
  if (input.expiresAt && !Number.isFinite(expiresAt)) return { success: false, errMsg: '失效日期格式不正确' };
  const batchId = `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();
  const plainCodes = [];
  const docs = [];
  const hashes = new Set();
  while (docs.length < count) {
    const code = randomCode();
    const codeHash = hashCode(code);
    if (hashes.has(codeHash)) continue;
    hashes.add(codeHash);
    plainCodes.push(code);
    docs.push({
      code_hash: codeHash,
      codePreview: `PM-****-****-${code.slice(-4)}`,
      codeCipher: encryptRedeemCode(code),
      batchId,
      note,
      durationDays,
      status: 'active',
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      createdAt: now,
      createdBy: adminUsername || ''
    });
  }
  await db.collection('membership_redeem_codes').insertMany(docs, { ordered: true });
  return { success: true, batchId, codes: plainCodes, count, durationDays, expiresAt: Number.isFinite(expiresAt) ? expiresAt : null };
}

async function listRedeemCodes(query = {}) {
  await ensureCollections();
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 500);
  const rows = await db.collection('membership_redeem_codes').find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  return {
    success: true,
    codes: rows.map((item) => {
      const code = decryptRedeemCode(item.codeCipher, item.code_hash);
      return {
        id: String(item._id),
        code,
        codeAvailable: !!code,
        codePreview: code || item.codePreview,
        batchId: item.batchId,
        note: item.note || '',
        status: item.status,
        durationDays: item.durationDays || null,
        durationMonths: item.durationDays ? null : (item.durationMonths || 1),
        expiresAt: item.expiresAt || null,
        redeemedAt: item.redeemedAt || null,
        redeemedStoreId: item.redeemedStoreId || '',
        createdAt: item.createdAt,
        createdBy: item.createdBy || ''
      };
    })
  };
}

async function voidRedeemCode(id, adminUsername) {
  await ensureCollections();
  const _id = db.toObjectId(String(id || ''));
  if (!_id) return { success: false, errMsg: '缺少兑换码 ID' };
  const result = await db.collection('membership_redeem_codes').updateOne(
    { _id, status: 'active' },
    { $set: { status: 'void', voidedAt: Date.now(), voidedBy: adminUsername || '' } }
  );
  if (!result.modifiedCount) return { success: false, errMsg: '兑换码不存在或已无法作废' };
  return { success: true };
}

module.exports = {
  PLANS,
  buildMembership,
  getMembershipStatus,
  redeemMembershipCode,
  createMembershipPay,
  queryMembershipPay,
  handleMembershipPayNotification,
  reconcilePaidMembershipOrders,
  startMembershipPaymentReconcileWorker,
  assertActiveMembership,
  guardMerchantAction,
  generateRedeemCodes,
  listRedeemCodes,
  voidRedeemCode,
  listTaskSubmissions,
  reviewTaskSubmission,
  initializeMembership,
  getPromotionTasks,
  submitPromotionProof,
  listPromotionTasksAdmin,
  savePromotionTask,
  updatePromotionTaskStatus
};
