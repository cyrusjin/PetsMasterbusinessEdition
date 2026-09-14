const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
function setup() {
  const rows = { stores: [{ _id:'s',store_id:'store',ownerOpenid:'owner',collection:{mode:'offline'} }], collection_materials: [] };
  const clone = x => structuredClone(x);
  const get = (r,k) => k.split('.').reduce((a,b)=>a?.[b],r);
  const match = (r,f) => Object.entries(f).every(([k,v]) => k === '$or' ? v.some(x=>match(r,x)) : v && typeof v === 'object' ? Object.entries(v).every(([op,x]) => op === '$exists' ? (get(r,k)!==undefined)===x : op === '$lt' ? get(r,k)<x : op === '$gt' ? get(r,k)>x : op === '$in' ? x.includes(get(r,k)) : false) : get(r,k)===v);
  function update(row,key,value,remove) { const parts=key.split('.'); let r=row; for(const k of parts.slice(0,-1)) r=r[k] ||= {}; if(remove) delete r[parts.at(-1)]; else r[parts.at(-1)] = clone(value); }
  const db = {
    collection: name => ({ updateOne: async (f,ops) => { const row=rows[name].find(r=>match(r,f)); if(!row)return {matchedCount:0}; for(const [k,v] of Object.entries(ops.$set||{}))update(row,k,v); for(const k of Object.keys(ops.$unset||{}))update(row,k,null,true); return {matchedCount:1}; }, countDocuments:async f=>rows[name].filter(r=>match(r,f)).length }),
    findOne:async(name,f)=>clone(rows[name].find(r=>match(r,f))||null), findMany:async(name,f)=>clone(rows[name].filter(r=>match(r,f))),
    insertOne:async(name,r)=>{ rows[name].push(clone(r)); return r; },
    updateById:async(name,id,f)=>{ await db.collection(name).updateOne({_id:id},{$set:f}); return db.findOne(name,{_id:id}); }
  };
  let posts=0, uploads=0, timeout=false, reject=false, remote=null, missingWechat=false;
  const client = { credentialsReady:()=>true, encryptSensitive:s=>`encrypted:${s}`, uploadMedia:async()=>{uploads++;return {media_id:'wx_media'};}, request:async(method,url,body)=>{
    if(url.includes('/banks/')) return {data:[{account_bank:'测试银行',need_bank_branch:true}],total_count:1};
    if(method==='POST') { posts++; if(reject) throw Object.assign(new Error('contact_email格式错误'),{code:'PARAM_ERROR',httpStatus:400,signatureVerified:true}); remote={applyment_id:1234567890,applyment_state:'APPLYMENT_STATE_AUDITING'}; if(timeout)throw new Error('timeout'); return {applyment_id:1234567890}; }
    if(remote)return clone(remote); throw Object.assign(new Error(missingWechat?'未能找到申请单':'missing'),{code:missingWechat?'PARAM_ERROR':'RESOURCE_NOT_EXISTS',httpStatus:missingWechat?400:404,signatureVerified:true});
  }};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/collectionOnboardingService.js'),'utf8'),{module,exports:module.exports,require:id=>({'crypto':crypto,'fs':{readFileSync:()=>Buffer.alloc(32,7)},'path':path,'../db':db,'../config':{orderPayments:{enabled:true,appId:'wx_app',wechatPay:{mchId:'12345'}}},'./partnerPayClient':{createClient:()=>client}}[id]||require(id)), __dirname,process:{env:{}},Buffer,Date,setInterval,console}, {filename:'collectionOnboardingService.js'});
  const s=module.exports;
  const a={licenseName:'测试宠物店',licenseNumber:'92610113MA7ABC1234',operatorName:'测试经营者',merchantShortName:'测试宠物店',businessAddress:'测试地址',servicePhone:'13800000000',accountType:'operator_personal',contactPhone:'13800000000',contactEmail:'test@example.com',idNumber:'11010519491231002X',idStart:'2020-01-01',idEnd:'长期',accountBank:'测试银行',bankName:'测试银行测试支行',accountNumber:'6222021234567890',industry:'居民生活服务'};
  for(const [i,k] of ['license','idFront','idBack'].entries()){const token=String(i+1).repeat(32); a[k]=token; rows.collection_materials.push({_id:k,store_id:'store',token,kind:k,expiresAt:new Date(Date.now()+86400000),filename:k+'.jpg',sealed:s.seal(Buffer.from('test image'),`store:${token}`)});}
  return {s,a,rows,db,get store(){return clone(rows.stores[0]);},get posts(){return posts;},get uploads(){return uploads;},setTimeout:v=>{timeout=v;},setReject:v=>{reject=v;},setRemote:v=>{remote=v;},setWechatMissing:()=>{missingWechat=true;}};
}
async function main() {
  let t=setup(); const {s,a}=t;
  const sealed=s.seal(Buffer.from('private account'),'scope'); assert.equal(s.unseal(sealed,'scope').toString(),'private account'); assert.throws(()=>s.unseal(sealed,'other')); const bad=Buffer.from(sealed,'base64');bad[13]^=1;assert.throws(()=>s.unseal(bad.toString('base64'),'scope'));
  assert.throws(()=>s.normalize({...a,idNumber:'110105194912310020'}),/校验/);
  assert.throws(()=>s.normalize({...a,idStart:'2020-02-30'}),/日期/);
  assert.throws(()=>s.normalize({...a,industry:'未知'}),/行业/);
  await assert.rejects(s.queue(t.store,{...a,license:'a'.repeat(32)},{}),/不属于/);
  await assert.rejects(s.queue(t.store,{...a,bankName:''},{}),/支行/);
  await assert.rejects(s.queue(t.store,{...a,industry:'宠物医院'},{}),/资质/);
  const [first,second]=await Promise.allSettled([s.queue(t.store,a,{}),s.queue(t.store,a,{})]);
  assert.equal([first,second].filter(r=>r.status==='fulfilled').length,1);
  assert.equal(t.store.collection.mode,'offline'); assert.equal(t.store.collection.application.idNumber,''); assert.equal(t.store.collection.application.accountNumber,'');
  assert(!JSON.stringify(t.store).includes(a.accountNumber)); assert(!JSON.stringify(t.store).includes(a.idNumber));
  const body=await s.payload(t.store,s.normalize(a)); assert.equal(body.contact_info.contact_type,'LEGAL'); assert.equal(body.settlement_info.settlement_id,'719'); assert.equal(body.subject_info.identity_info.id_card_info.id_card_number,'encrypted:'+a.idNumber); assert.equal(body.bank_account_info.account_name,'encrypted:'+a.operatorName);
  await Promise.all([s.processOne(t.store),s.processOne(t.store)]); assert.equal(t.posts,1); assert.equal(t.store.collection.applymentId,'1234567890'); assert.equal(t.store.collection.state,'auditing'); assert.equal(t.store.collection.sealedApplication,undefined);
  await s.queue(t.store,a,{}); assert.equal(t.posts,1);
  t.setRemote({applyment_id:1234567890,applyment_state:'APPLYMENT_STATE_REJECTED',audit_detail:[{reject_reason:'请补充清晰执照'}]}); await s.sync(t.store); assert.equal(t.store.collection.state,'rejected'); assert.match(t.store.collection.reviewMessage,/清晰执照/);
  const code=t.store.collection.businessCode; await s.queue(t.store,a,{}); assert.equal(t.store.collection.businessCode,code); await s.processOne(t.store); assert.equal(t.posts,2);
  t.setRemote({applyment_id:1234567890,applyment_state:'APPLYMENT_STATE_FINISHED',sub_mchid:'1234567890',sign_url:'https://evil.example/sign'}); await s.sync(t.store); assert.equal(t.store.collection.state,'ready'); assert.equal(t.store.collection.signUrl,''); assert.equal(t.store.collection.mode,'offline');
  t=setup(); await t.s.queue(t.store,t.a,{});t.setTimeout(true);await t.s.processOne(t.store);assert.equal(t.store.collection.state,'submitting');assert.equal(t.store.collection.phase,'sending');await t.s.processOne(t.store);assert.equal(t.posts,1,'查询恢复超时结果，不能重复提交');assert.equal(t.store.collection.state,'auditing');
  t=setup();await t.s.queue(t.store,t.a,{});t.setReject(true);await t.s.processOne(t.store);assert.equal(t.store.collection.state,'rejected');assert.equal(t.store.collection.sealedApplication,undefined);t.setReject(false);await t.s.queue(t.store,t.a,{});await t.s.processOne(t.store);assert.equal(t.store.collection.state,'auditing','首次参数错误后无需管理员即可补件');
  t=setup();await t.s.queue(t.store,t.a,{});t.rows.stores[0].collection.phase='sending';t.setWechatMissing();await t.s.processOne(t.store);assert.equal(t.posts,1);assert.equal(t.store.collection.state,'auditing','微信真实的PARAM_ERROR未找到申请单响应允许安全重试');
  console.log('collection onboarding passed: encrypted storage, ownership, validation, concurrent submission, timeout recovery, rejection/resubmission, signed state and offline opt-in');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
