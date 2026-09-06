const express = require('express');
const cors = require('cors');
const config = require('./config');
const { connectDb } = require('./db');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const configRouter = require('./routes/config');
const wechatOaRouter = require('./routes/wechatOa');
const wechatMpRouter = require('./routes/wechatMp');
const mapRouter = require('./routes/map');
const storeSharePageRouter = require('./routes/storeSharePage');
const wechatPayRouter = require('./routes/wechatPay');
const oss = require('./oss');
const {
  storeRouter,
  orderRouter,
  petRouter,
  dailyRouter,
  ledgerRouter,
  uploadRouter
} = require('./routes/api');
const { startDailyScheduleWorker, initDailyDatabase } = require('./services/dailyService');
const { initLedgerDatabase } = require('./services/ledgerService');
const { initializeMembership, startMembershipPaymentReconcileWorker } = require('./services/membershipService');

async function main() {
  await connectDb();
  console.log('[db] connected');

  oss.ensureMediaRoot();
  try {
    await initDailyDatabase();
  } catch (err) {
    console.warn('[daily] init database failed', (err && err.message) || err);
  }
  try {
    await initLedgerDatabase();
  } catch (err) {
    console.warn('[ledger] init database failed', (err && err.message) || err);
  }
  try {
    await initializeMembership();
  } catch (err) {
    console.warn('[membership] init database failed', (err && err.message) || err);
  }
  startDailyScheduleWorker();
  startMembershipPaymentReconcileWorker();
  // 入驻无订单引导推送已关闭（原 startMerchantNoOrderRemindWorker）

  const app = express();
  app.use(cors());

  // 服务号 / 小程序消息推送需要原始 XML/JSON，须在 json parser 之前挂载
  app.use('/api/wechat/oa', express.text({
    type: ['text/xml', 'application/xml', 'text/plain', '*/*'],
    limit: '1mb'
  }), wechatOaRouter);
  app.use('/api/wechat/mp', express.text({
    type: ['text/xml', 'application/xml', 'text/plain', 'application/json', '*/*'],
    limit: '1mb'
  }), wechatMpRouter);
  // 微信支付回调验签依赖未经 JSON parser 改写的原始报文
  app.use('/api/wechatpay', wechatPayRouter);

  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, time: Date.now() });
  });

  // 本地媒体静态访问：https://api.petmaster.me/media/...
  app.use('/media', express.static(config.media.root, {
    maxAge: '7d',
    fallthrough: true
  }));

  // 商家分享给客人：带 store_id 的服务号邀请页
  app.use('/s', storeSharePageRouter);

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/config', configRouter);
  app.use('/api/user', authRouter);
  app.use('/api/store', storeRouter);
  app.use('/api/order', orderRouter);
  app.use('/api/pet', petRouter);
  app.use('/api/daily', dailyRouter);
  app.use('/api/ledger', ledgerRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/map', mapRouter);

  app.use((req, res) => {
    res.status(404).json({ success: false, errMsg: '接口不存在' });
  });

  app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
