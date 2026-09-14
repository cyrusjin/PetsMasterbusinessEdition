const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const get = (obj, key) => key.split('.').reduce((v,k) => v && v[k], obj);
function put(obj, key, value, remove) {
  const keys = key.split('.'); let node = obj;
  keys.slice(0,-1).forEach(k => { node[k] ||= {}; node = node[k]; });
  if (remove) delete node[keys.at(-1)]; else node[keys.at(-1)] = clone(value);
}
function matches(row, filter) {
  return Object.entries(filter).every(([key, val]) => {
    if (key === '$or') return val.some(part => matches(row, part));
    const found = get(row, key);
    if (val && typeof val === 'object') {
      if ('$exists' in val) return (found !== undefined) === val.$exists;
      if ('$in' in val) return val.$in.includes(found);
      if ('$lt' in val) return found < val.$lt;
    }
    return found === val;
  });
}
function setup() {
  const rows = { orders: [], stores: [], collection_agreements: [] };
  const calls = { create: 0, refund: 0, close: 0 };
  const transactions = new Map();
  const refunds = new Map();
  let ready = true;
  const db = {
    collection(name) { return {
      async updateOne(filter, ops) {
        const row = rows[name].find(r => matches(r,filter)); if (!row) return { matchedCount: 0 };
        Object.entries(ops.$set || {}).forEach(([k,v]) => put(row,k,v));
        Object.keys(ops.$unset || {}).forEach(k => put(row,k,null,true));
        Object.entries(ops.$push || {}).forEach(([k,v]) => { row[k] ||= []; row[k].push(clone(v)); });
        return { matchedCount: 1 };
      }, async createIndex() {}
    }; },
    async findOne(name, filter) { return clone(rows[name].find(r => matches(r, filter)) || null); },
    async findMany(name, filter) { return clone(rows[name].filter(r => matches(r,filter))); },
    async updateById(name, id, fields) { await this.collection(name).updateOne({ _id:id }, { $set: fields }); return this.findOne(name,{_id:id}); },
    async insertOne(name, row) { rows[name].push(clone(row)); return row; }
  };
  const identity = { async findPrimaryUserByOpenid(id) { return { openid:id, openids: { merchant:id } }; }, collectOpenids(user) { return [user.openid]; } };
  const tx = (p,state='SUCCESS') => ({ out_trade_no:p.tradeNo, sp_mchid:p.spMchId, sub_mchid:p.subMchId, sp_appid:p.appId,
    amount:{total:p.amountFen,currency:'CNY'}, trade_state:state, transaction_id:'wx_transaction', payer:{sp_openid:p.payerOpenid} });
  const pay = {
    ready: () => ready, appId: () => 'wx_app', mchId: () => 'sp_merchant', buildPayment: id => ({paySign:'signed',package:id}),
    async create(p) { calls.create++; transactions.set(p.tradeNo, tx(p,'NOTPAY')); return { prepay_id:'prepay_'+p.tradeNo }; },
    async query(p) { const t = transactions.get(p.tradeNo); if (!t) throw Object.assign(new Error('missing'),{code:'ORDER_NOT_EXIST'}); return clone(t); },
    async close(p) { calls.close++; if (transactions.get(p.tradeNo)?.trade_state === 'SUCCESS') throw Object.assign(new Error('paid'),{code:'ORDERPAID'}); transactions.set(p.tradeNo,tx(p,'CLOSED')); },
    async refund(p) { calls.refund++; const r = {out_refund_no:p.refundNo,out_trade_no:p.tradeNo,amount:{total:p.amountFen,refund:p.amountFen},status:'PROCESSING'}; refunds.set(p.refundNo,r); return clone(r); },
    async queryRefund(p) { const r = refunds.get(p.refundNo); if (!r) throw Object.assign(new Error('missing'),{code:'RESOURCE_NOT_EXISTS'}); return clone(r); },
    parseNotification(raw) { return { transaction:JSON.parse(raw) }; },
    async queryApplication() { return {applyment_state:'APPLYMENT_STATE_FINISHED',sub_mchid:'1234567890',applyment_state_msg:'完成'}; }
  };
  const agreement = require('../src/services/collectionAgreement');
  function load(file, deps) {
    const module = {exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services',file),'utf8'), { module, exports:module.exports,
      require: id => deps[id] || (id === 'crypto' ? require('crypto') : (()=>{throw new Error(id);})()),
      console, Date, setInterval, clearInterval, Buffer }, {filename:file});
    return module.exports;
  }
  const config = { media:{publicBaseUrl:'https://api.petmaster.me/media'},oss:{publicBaseUrl:''} };
  const collection = load('collectionService.js', {'../db':db,'../config':config,'./identity':identity,'./partnerPayService':pay,'./collectionAgreement':agreement,'./collectionOnboardingService':{configured:()=>ready,sync:async s=>s}});
  const service = load('orderPaymentService.js', {'../db':db,'./identity':identity,'./partnerPayService':pay,'./collectionService':collection});
  const order = { _id:'one',order_id:'order1',userOpenid:'buyer',store_id:'store1',storeName:'测试门店',status:'pending',totalFee:100,
    paymentMode:'online',paymentConfirmedAt:0,paymentSubMchId:'1234567890',payment:{status:'unpaid'} };
  rows.orders.push(order); rows.stores.push({_id:'store',store_id:'store1',ownerOpenid:'owner'});
  const run = (action, extra={}, user='buyer') => service.handle({action,order_id:'order1',...extra},user);
  return { rows, order, service, collection, pay, calls, transactions, refunds, tx, run, setReady: value => {ready=value;} };
}
async function testPayment() {
  const t=setup(); const {order,service,run,pay,calls,transactions,tx}=t;
  await assert.rejects(run('createOrderPayment'),/商家确认/);
  await assert.rejects(run('createOrderPayment',{},'intruder'),/无权/);
  await assert.rejects(service.guardUpdate(order,{status:'awaiting_arrival'},false),/仅商家/);
  const patch={status:'awaiting_arrival'}; await service.guardUpdate(order,patch,true); Object.assign(order,patch);
  assert.equal(service.publicPayment(order).canPay,true);
  t.setReady(false); await assert.rejects(run('createOrderPayment'),/暂未开放/); t.setReady(true);
  order.editPendingConfirm=true; await assert.rejects(run('createOrderPayment'),/商家确认/); order.editPendingConfirm=false;
  await run('createOrderPayment',{amountFen:1,subMchId:'attacker'});
  assert.equal(order.payment.amountFen,10000); assert.equal(order.payment.subMchId,'1234567890');
  const firstTrade=order.payment.tradeNo;
  await run('createOrderPayment'); assert.equal(calls.create,1); assert.equal(order.payment.tradeNo,firstTrade);
  await assert.rejects(service.guardUpdate(order,{status:'boarding'},true),/支付/);
  const forged=tx(order.payment); forged.amount.total=1;
  await assert.rejects(service.notification(JSON.stringify(forged),{}),/不匹配/); assert.equal(order.payment.status,'pending');
  const wrongPayer=tx(order.payment); wrongPayer.payer.sp_openid='intruder';
  await assert.rejects(service.notification(JSON.stringify(wrongPayer),{}),/付款人/);
  transactions.set(firstTrade,tx(order.payment));
  const concurrent = await Promise.allSettled([
    service.notification(JSON.stringify(tx(order.payment)),{}),
    run('queryOrderPayment')
  ]);
  assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(item => item.status === 'rejected').length, 1);
  assert.match(concurrent.find(item => item.status === 'rejected').reason.message, /正在处理/);
  assert.equal(order.payment.status,'paid');
  await service.notification(JSON.stringify(tx(order.payment)),{}); assert.equal(order.payment.status,'paid');
  await assert.rejects(service.guardUpdate(order,{totalFee:90},true),/不可直接改价/);
  await assert.rejects(service.guardUpdate(order,{status:'cancelled'},true),/退款/);
  await assert.rejects(run('refundOrderPayment',{confirmFullRefund:true},'intruder'),/店主/);
  await run('requestOrderRefund'); assert.equal(order.payment.refundRequested,true);
  await assert.rejects(service.guardUpdate(order,{status:'boarding'},true),/退款申请/);
  await run('refundOrderPayment',{confirmFullRefund:true},'owner'); assert.equal(order.payment.status,'refunding');
  await run('refundOrderPayment',{confirmFullRefund:true},'owner'); assert.equal(calls.refund,1);
  t.refunds.get(order.payment.refundNo).status='SUCCESS';
  await run('queryOrderPayment'); assert.equal(order.payment.status,'refunded'); assert.equal(order.status,'cancelled');
  await service.notification(JSON.stringify(tx(order.payment)),{}); assert.equal(order.payment.status,'refunded');
  assert.equal(order.paymentLock,undefined);
}
async function testCloseAndRecovery() {
  const t=setup(); Object.assign(t.order,{status:'awaiting_arrival',paymentConfirmedAt:1});
  t.order.paymentLock='active'; t.order.paymentLockAt=Date.now();
  await assert.rejects(t.run('createOrderPayment'),/正在处理/);
  t.order.paymentLockAt=Date.now()-3*60*1000;
  let createThrow=true; const create=t.pay.create;
  t.pay.create=async p=>{const result=await create(p); if(createThrow){createThrow=false;throw new Error('timeout');}return result;};
  await assert.rejects(t.run('createOrderPayment'),/timeout/); const id=t.order.payment.tradeNo;
  await t.run('createOrderPayment'); assert.notEqual(t.order.payment.tradeNo,id);
  await t.service.guardUpdate(t.order,{totalFee:120},true); assert.equal(t.order.payment.status,'closed');t.order.totalFee=120;
  await t.run('createOrderPayment'); assert.notEqual(t.order.payment.tradeNo,id); assert.equal(t.order.payment.amountFen,12000);
  const original=t.pay.close; t.pay.close=async()=>{throw Object.assign(new Error('unknown'),{code:'ORDER_NOT_EXIST'});};
  await assert.rejects(t.service.guardUpdate(t.order,{status:'cancelled'},true),/尚未确认关闭/);
  assert.equal(t.order.status,'awaiting_arrival'); t.pay.close=original;
  await t.service.guardUpdate(t.order,{status:'cancelled'},true); assert.equal(t.order.payment.status,'closed');
  t.order.paymentMode='offline'; await t.service.guardUpdate(t.order,{status:'completed'},true);
  assert.equal(t.service.publicPayment(t.order).canPay,false);
  for (const amount of [-1,Infinity,NaN,0.001,1000001]) assert.throws(()=>t.service.amountFen({totalFee:amount}),/金额无效/);
  assert.equal(t.service.amountFen({totalFee:19.9}),1990);
}
async function testCollection() {
  const t=setup(); const c=t.collection;
  await assert.rejects(c.handle({action:'getCollectionSettings',store_id:'store1'},'buyer'),/店主/);
  const r=await c.handle({action:'getCollectionSettings',store_id:'store1'},'owner');
  assert.equal(r.collection.mode,'offline');
  const event={action:'applyCollection',store_id:'store1',accepted:true,agreementVersion:r.agreement.version,agreementHash:r.agreementHash,subMchId:'forged',application:{
    licenseName:'测试宠物店',licenseNumber:'92610113MA7ABC1234',operatorName:'店主',merchantShortName:'测试宠物店',
    businessAddress:'陕西省西安市测试路1号',servicePhone:'13800000000',accountType:'operator_personal',accountName:'店主',
    contactName:'店主',contactPhone:'13800000000',businessLicenseUrl:'https://api.petmaster.me/media/store-licenses/license.jpg',
    storefrontPhotos:['https://api.petmaster.me/media/store-photos/store.jpg']
  }};
  await assert.rejects(c.handle({...event,accepted:false},'owner'),/协议/);
  await assert.rejects(c.handle({...event,agreementHash:'stale'},'owner'),/协议/);
  await assert.rejects(c.handle(event,'owner'),/敏感/);
  await assert.rejects(c.handle({action:'setCollectionMode',store_id:'store1',mode:'online'},'owner'),/审核/);
  t.rows.stores[0].collection = { state:'ready',subMchId:'1234567890',agreementHash:r.agreementHash,agreementVersion:r.agreement.version };
  assert.notEqual(t.rows.stores[0].collection.mode,'online');
  await c.handle({action:'setCollectionMode',store_id:'store1',mode:'online'},'owner');
  assert.equal(t.rows.stores[0].collection.mode,'online');
  await c.handle({action:'setCollectionMode',store_id:'store1',mode:'offline'},'owner');
  assert.equal(t.order.paymentMode,'online','切换设置不能影响存量订单');
}
(async()=>{await testPayment();await testCloseAndRecovery();await testCollection();console.log('order payment tests passed: authorization, confirmation, amounts, idempotency, refund, close, recovery, agreement and opt-in');})().catch(e=>{console.error(e);process.exitCode=1;});
