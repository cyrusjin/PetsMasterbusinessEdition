const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');
const client = require('./partnerPayClient').createClient(config.orderPayments);
const MATERIAL_DAYS = 30;
const materialKinds = new Set(['license', 'idFront', 'idBack', 'qualification']);
const industries = ['居民生活服务', '零售', '宠物医院'];
let vaultKey;
function key() {
  if (!vaultKey) {
    const location = process.env.COLLECTION_VAULT_KEY_PATH || path.resolve(__dirname, '../../keys/collection-vault.key');
    vaultKey = fs.readFileSync(location);
    if (vaultKey.length !== 32) throw new Error('开户资料加密配置无效');
  }
  return vaultKey;
}
function seal(data, scope) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), nonce);
  cipher.setAAD(Buffer.from(scope));
  return Buffer.concat([nonce, cipher.update(data), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
function unseal(value, scope) {
  const packed = Buffer.from(value, 'base64');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), packed.subarray(0, 12));
  cipher.setAAD(Buffer.from(scope));
  cipher.setAuthTag(packed.subarray(-16));
  return Buffer.concat([cipher.update(packed.subarray(12, -16)), cipher.final()]);
}
function configured() {
  try { key(); return !!config.orderPayments.enabled && client.credentialsReady(); } catch (_) { return false; }
}
function normalize(input) {
  const a = {};
  for (const field of ['licenseName','licenseNumber','operatorName','merchantShortName','businessAddress','servicePhone','accountType','contactPhone','contactEmail','idNumber','idStart','idEnd','accountBank','bankName','accountNumber','industry','license','idFront','idBack','qualification']) {
    a[field] = String(input[field] || '').trim();
    if (a[field].length > 200) throw new Error('申请资料字段过长');
  }
  a.licenseNumber = a.licenseNumber.toUpperCase(); a.idNumber = a.idNumber.toUpperCase();
  if (!a.licenseName || !a.operatorName || !a.merchantShortName || !a.businessAddress) throw new Error('请完整填写执照名称、经营者、商户简称和地址');
  if (!/^([0-9]{15}|[0-9A-Z]{18})$/.test(a.licenseNumber)) throw new Error('请填写15位注册号或18位统一社会信用代码');
  if (!/^[\d+\-\s]{6,25}$/.test(a.servicePhone) || !/^1\d{10}$/.test(a.contactPhone)) throw new Error('请填写有效客服电话和经营者手机号');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.contactEmail)) throw new Error('请填写经营者邮箱');
  if (!/^\d{17}[\dX]$/.test(a.idNumber)) throw new Error('请填写经营者18位身份证号码');
  const weights = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2];
  if ('10X98765432'[weights.reduce((sum, w, i) => sum + w * Number(a.idNumber[i]), 0) % 11] !== a.idNumber[17]) throw new Error('身份证号码校验失败，请核对');
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const today = new Date(Date.now() + 8*3600000).toISOString().slice(0,10);
  if (!date(a.idStart) || a.idStart < '1900-01-01' || a.idStart >= today || (a.idEnd !== '长期' && (!date(a.idEnd) || a.idEnd <= today || a.idEnd <= a.idStart))) throw new Error('请填写有效的身份证起止日期；长期有效请填写“长期”');
  if (!['operator_personal','business'].includes(a.accountType)) throw new Error('请选择结算账户类型');
  if (!/^\d{8,32}$/.test(a.accountNumber)) throw new Error('请填写8至32位结算银行卡号或对公账号');
  if (!a.accountBank) throw new Error('请选择开户银行');
  if (!industries.includes(a.industry)) throw new Error('请选择实际经营行业');
  for (const field of ['license','idFront','idBack', ...(a.industry === '宠物医院' ? ['qualification'] : [])]) {
    if (!/^[a-f0-9]{32}$/.test(a[field])) throw new Error('请上传营业执照、身份证正反面及所需行业资质');
  }
  a.contactName = a.operatorName;
  a.accountName = a.accountType === 'business' ? a.licenseName : a.operatorName;
  return a;
}
function publicApplication(a) {
  const output = { ...a, subjectType: 'individual' };
  delete output.idNumber; delete output.accountNumber;
  // Sensitive values are re-entered for a rejected application; never returned by store/admin APIs.
  output.idNumber = ''; output.accountNumber = '';
  return output;
}
async function saveMaterial(store, kind, buffer, acceptedBy) {
  if (!configured()) throw new Error('自动开户配置尚未完成');
  if (!materialKinds.has(kind)) throw new Error('资料类型无效');
  if (await db.collection('collection_materials').countDocuments({ store_id: store.store_id, createdAt: { $gt: new Date(Date.now()-3600000) } }) >= 30) throw new Error('上传过于频繁，请稍后再试');
  const sharp = require('sharp');
  let meta;
  try { meta = await sharp(buffer, { limitInputPixels: 40000000 }).metadata(); } catch (_) { throw new Error('请上传清晰的JPG或PNG原件照片'); }
  if (!['jpeg','png'].includes(meta.format) || buffer.length > 5*1024*1024) throw new Error('请上传5MB以内的JPG或PNG照片');
  const token = crypto.randomBytes(16).toString('hex');
  await db.insertOne('collection_materials', { token, store_id: store.store_id, kind, filename: `${kind}.${meta.format === 'jpeg' ? 'jpg' : 'png'}`, sealed: seal(buffer, `${store.store_id}:${token}`), sensitiveConsentVersion: '2026-09-10.v3', sensitiveAcceptedBy: acceptedBy, createdAt: new Date(), expiresAt: new Date(Date.now()+MATERIAL_DAYS*86400000) });
  return token;
}
async function material(storeId, token, kind) {
  const row = await db.findOne('collection_materials', { store_id: storeId, token, ...(kind ? { kind } : {}), expiresAt: { $gt: new Date() } });
  if (!row) throw new Error('开户照片已过期或不属于本店，请重新上传');
  return row;
}
let bankCache = {};
async function banks(type) {
  const kind = type === 'business' ? 'corporate-banking' : 'personal-banking';
  if (bankCache[kind]?.until > Date.now()) return bankCache[kind].items;
  const items = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const r = await client.request('GET', `/v3/capital/capitallhh/banks/${kind}?offset=${offset}&limit=100`);
    for (const b of r.data || []) items.push({ name: b.account_bank, needBranch: !!b.need_bank_branch });
    if (!r.data?.length || items.length >= r.total_count || r.data.length < 100) break;
  }
  if (!items.length || items.some(b => !b.name)) throw new Error('开户银行列表暂不可用，请稍后重试');
  const unique = [...new Map(items.map(b => [b.name, b])).values()];
  bankCache[kind] = { until: Date.now()+3600000, items: unique };
  return unique;
}
async function validateMaterials(storeId, a) {
  for (const field of ['license','idFront','idBack', ...(a.industry === '宠物医院' ? ['qualification'] : [])]) await material(storeId, a[field], field);
  const bank = (await banks(a.accountType)).find(b => b.name === a.accountBank);
  if (!bank) throw new Error('请重新选择微信支付支持的开户银行');
  if (bank.needBranch && !a.bankName) throw new Error('请填写开户银行完整支行名称');
}
async function payload(store, a) {
  const media = {};
  for (const field of ['license','idFront','idBack', ...(a.industry === '宠物医院' ? ['qualification'] : [])]) {
    const row = await material(store.store_id, a[field], field);
    if (row.mediaId && row.uploadedAt > Date.now()-3600000) media[field] = row.mediaId;
    else {
      const result = await client.uploadMedia(unseal(row.sealed, `${store.store_id}:${row.token}`), row.filename);
      if (!result.media_id) throw new Error('微信未返回有效资料编号');
      media[field] = result.media_id;
      await db.updateById('collection_materials', row._id, { mediaId: result.media_id, uploadedAt: Date.now() });
    }
  }
  const enc = client.encryptSensitive;
  return {
    business_code: store.collection.businessCode,
    contact_info: { contact_type: 'LEGAL', contact_name: enc(a.operatorName), mobile_phone: enc(a.contactPhone), contact_email: enc(a.contactEmail) },
    subject_info: { subject_type: 'SUBJECT_TYPE_INDIVIDUAL', business_license_info: { license_copy: media.license, license_number: a.licenseNumber, merchant_name: a.licenseName, legal_person: a.operatorName, license_address: a.businessAddress }, identity_info: { id_doc_type: 'IDENTIFICATION_TYPE_IDCARD', id_card_info: { id_card_copy: media.idFront, id_card_national: media.idBack, id_card_name: enc(a.operatorName), id_card_number: enc(a.idNumber), card_period_begin: a.idStart, card_period_end: a.idEnd } } },
    business_info: { merchant_shortname: a.merchantShortName, service_phone: a.servicePhone, sales_info: { sales_scenes_type: ['SALES_SCENES_MINI_PROGRAM'], mini_program_info: { mini_program_appid: config.orderPayments.appId } } },
    settlement_info: { settlement_id: '719', qualification_type: a.industry, ...(media.qualification ? { qualifications: [media.qualification] } : {}) },
    bank_account_info: { bank_account_type: a.accountType === 'business' ? 'BANK_ACCOUNT_TYPE_CORPORATE' : 'BANK_ACCOUNT_TYPE_PERSONAL', account_name: enc(a.accountName), account_bank: a.accountBank, ...(a.bankName ? { bank_name: a.bankName } : {}), account_number: enc(a.accountNumber) }
  };
}
function remoteFields(remote) {
  const state = remote.applyment_state === 'APPLYMENT_STATE_FINISHED' ? 'ready' : ['APPLYMENT_STATE_TO_BE_SIGNED','APPLYMENT_STATE_SIGNING','APPLYMENT_STATE_TO_BE_CONFIRMED','APPLYMENT_STATE_ACCOUNT_NEED_VERIFY'].includes(remote.applyment_state) ? 'signing' : ['APPLYMENT_STATE_REJECTED','APPLYMENT_STATE_CANCELED'].includes(remote.applyment_state) ? 'rejected' : 'auditing';
  const id = String(remote.applyment_id || '');
  if (!/^\d{1,32}$/.test(id)) throw new Error('微信未返回有效申请单号');
  const review = [remote.applyment_state_msg, ...(remote.audit_detail || []).map(x => x.reject_reason)].filter(Boolean).join('；');
  return { 'collection.state': state, 'collection.applymentId': id, 'collection.remoteState': remote.applyment_state, 'collection.reviewMessage': review.slice(0,1500), 'collection.signUrl': /^https:\/\/pay\.weixin\.qq\.com\//.test(remote.sign_url || '') ? remote.sign_url : '', 'collection.syncedAt': Date.now() };
}
async function applyRemote(store, remote, extraFilter = {}) {
  const fields = remoteFields(remote);
  if (fields['collection.state'] === 'ready') {
    const sub = String(remote.sub_mchid || '');
    if (!/^\d{8,32}$/.test(sub) || (store.collection.subMchId && store.collection.subMchId !== sub)) throw new Error('微信收款商户号校验失败');
    fields['collection.subMchId'] = sub;
  }
  await db.collection('stores').updateOne({ _id: store._id, 'collection.businessCode': store.collection.businessCode, ...extraFilter }, { $set: fields, $unset: { 'collection.sealedApplication': '' } });
  return db.findOne('stores', { _id: store._id });
}
async function sync(store) {
  const p = store.collection || {};
  if (!configured() || p.state === 'submitting' || !p.applymentId) return store;
  const url = p.businessCode ? `business_code/${encodeURIComponent(p.businessCode)}` : `applyment_id/${encodeURIComponent(p.applymentId)}`;
  return applyRemote(store, await client.request('GET', `/v3/applyment4sub/applyment/${url}`), { 'collection.state': p.state });
}
async function queue(store, input, acceptance) {
  if (!configured()) throw new Error('自动开户配置尚未完成，请稍后再试');
  store = await sync(store);
  const p = store.collection || {};
  if (p.state === 'submitting' || (p.applymentId && p.state !== 'rejected')) return store;
  const a = normalize(input);
  await validateMaterials(store.store_id, a);
  const code = p.remoteState === 'APPLYMENT_STATE_CANCELED' || !p.businessCode ? `${config.orderPayments.wechatPay.mchId}_${crypto.randomBytes(16).toString('hex')}` : p.businessCode;
  const version = crypto.randomBytes(16).toString('hex');
  const fields = { ...acceptance, 'collection.businessCode': code, 'collection.queueVersion': version, 'collection.state': 'submitting', 'collection.phase': 'queued', 'collection.sealedApplication': seal(Buffer.from(JSON.stringify(a)), `${store.store_id}:${version}`), 'collection.application': publicApplication(a), 'collection.requestedAt': p.requestedAt || Date.now(), 'collection.nextAttemptAt': 0, 'collection.reviewMessage': '资料已保存，系统正在自动提交微信支付', 'collection.signUrl': '' };
  const result = await db.collection('stores').updateOne({ _id: store._id, 'collection.state': p.state || { $exists: false }, 'collection.queueVersion': p.queueVersion || { $exists: false } }, { $set: fields });
  if (!result.matchedCount) throw new Error('申请状态已更新，请刷新查看');
  return db.findOne('stores', { _id: store._id });
}
function missing(err) {
  return err.signatureVerified && (['RESOURCE_NOT_EXISTS','NOT_FOUND','269754389'].includes(String(err.code))
    || (err.code === 'PARAM_ERROR' && err.message === '未能找到申请单'));
}
async function processOne(store) {
  const p = store.collection;
  const lease = crypto.randomBytes(16).toString('hex');
  const result = await db.collection('stores').updateOne({ _id: store._id, 'collection.state': 'submitting', 'collection.queueVersion': p.queueVersion, $or: [{ 'collection.leaseUntil': { $exists: false } }, { 'collection.leaseUntil': { $lt: Date.now() } }] }, { $set: { 'collection.lease': lease, 'collection.leaseUntil': Date.now()+180000 } });
  if (!result.matchedCount) return;
  const filter = { _id: store._id, 'collection.lease': lease, 'collection.queueVersion': p.queueVersion };
  try {
    if (p.phase === 'sending') {
      try {
        const r = await client.request('GET', `/v3/applyment4sub/applyment/business_code/${encodeURIComponent(p.businessCode)}`);
        if (!['APPLYMENT_STATE_REJECTED','APPLYMENT_STATE_CANCELED'].includes(r.applyment_state)) return await applyRemote(store, r, { 'collection.lease': lease });
      } catch (err) { if (!missing(err)) throw err; }
    }
    const a = JSON.parse(unseal(p.sealedApplication, `${store.store_id}:${p.queueVersion}`).toString('utf8'));
    const body = await payload(store, a);
    await db.collection('stores').updateOne(filter, { $set: { 'collection.phase': 'sending' } });
    const r = await client.request('POST', '/v3/applyment4sub/applyment/', body);
    const id = String(r.applyment_id || '');
    if (!/^\d{1,32}$/.test(id)) throw new Error('微信未返回有效申请单号');
    await db.collection('stores').updateOne(filter, { $set: { 'collection.applymentId': id, 'collection.state': 'auditing', 'collection.reviewMessage': '已自动提交微信支付，等待审核', 'collection.syncedAt': Date.now() }, $unset: { 'collection.sealedApplication': '' } });
  } catch (err) {
    // Never log remote text, request bodies, document numbers or account numbers.
    const permanent = err.signatureVerified && err.httpStatus >= 400 && err.httpStatus < 500 && ![408,409,429].includes(err.httpStatus) && !['SYSTEM_ERROR','FREQUENCY_LIMITED'].includes(String(err.code));
    const expired = /开户照片已过期/.test(err.message || '');
    const code = /^[A-Z0-9_]{1,50}$/.test(String(err.code || '')) ? String(err.code) : 'RETRY';
    const reason = String(err.message || '').replace(/[A-Za-z0-9+/=]{40,}/g, '[已隐藏]').replace(/\d{8,}/g, '[已隐藏]').slice(0,400);
    await db.collection('stores').updateOne(filter, { $set: { 'collection.state': permanent || expired ? 'rejected' : 'submitting', 'collection.reviewMessage': expired ? '开户照片已过期，请重新上传后提交' : permanent ? `微信未接受申请（${code}）：${reason}。请核对后重新提交` : '微信响应尚未确认，系统将自动查询并重试，请勿重复申请', 'collection.nextAttemptAt': Date.now()+60000 }, ...(permanent || expired ? { $unset: { 'collection.sealedApplication': '' } } : {}) });
  } finally {
    await db.collection('stores').updateOne(filter, { $unset: { 'collection.lease': '', 'collection.leaseUntil': '' } });
  }
}
let running = false;
async function tick() {
  if (running || !configured()) return;
  running = true;
  try {
    const rows = await db.findMany('stores', { 'collection.state': { $in: ['submitting','auditing','signing'] } }, { limit: 50, sort: { 'collection.syncedAt': 1 } });
    for (const store of rows) {
      try {
        if (store.collection.state === 'submitting') { if (!(store.collection.nextAttemptAt > Date.now())) await processOne(store); }
        else if (!(store.collection.syncedAt > Date.now()-60000)) await sync(store);
      } catch (_) { /* Retry on the next worker pass; no sensitive error logging. */ }
    }
  } finally { running = false; }
}
async function initialize() {
  await db.collection('collection_materials').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('collection_materials').createIndex({ token: 1 }, { unique: true });
  await db.collection('collection_materials').createIndex({ store_id: 1, createdAt: 1 });
  setInterval(() => tick().catch(() => {}), 20000).unref();
  tick().catch(() => {});
}
module.exports = { configured, normalize, publicApplication, saveMaterial, material, banks, queue, sync, initialize, tick, processOne, payload, remoteFields, seal, unseal };
