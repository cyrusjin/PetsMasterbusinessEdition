const express = require('express');
const { signAdminToken, adminRequired } = require('../middleware/auth');
const adminService = require('../services/adminService');
const storeService = require('../services/storeService');
const orderService = require('../services/orderService');
const notifyLogService = require('../services/notifyLogService');
const appConfigService = require('../services/appConfigService');
const platformStatsService = require('../services/platformStatsService');
const announcementService = require('../services/announcementService');
const membershipService = require('../services/membershipService');

const adminRouter = express.Router();

adminRouter.post('/login', (req, res) => {
  const username = (req.body && req.body.username) || '';
  const password = (req.body && req.body.password) || '';
  if (!username || !password) {
    return res.status(400).json({ success: false, errMsg: '请输入账号和密码' });
  }

  const result = adminService.verifyAdminLogin(username, password);
  if (!result.success) {
    return res.status(401).json(result);
  }

  const token = signAdminToken({
    role: 'admin',
    username: result.username
  });

  return res.json({
    success: true,
    token,
    username: result.username,
    displayName: result.displayName
  });
});

adminRouter.get('/me', adminRequired, (req, res) => {
  return res.json({
    success: true,
    username: req.admin.username
  });
});

adminRouter.get('/applications', adminRequired, async (req, res) => {
  try {
    const result = await storeService.listPendingMerchantApplications();
    return res.json(result);
  } catch (err) {
    console.error('admin list applications failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.post('/applications/review', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await storeService.reviewMerchantApplication({
      store_id: body.store_id,
      decision: body.decision,
      rejectReason: body.rejectReason
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] review', req.admin.username, body.store_id, body.decision);
    return res.json(result);
  } catch (err) {
    console.error('admin review failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '操作失败'
    });
  }
});

adminRouter.get('/dashboard', adminRequired, async (req, res) => {
  try {
    const result = await platformStatsService.getPlatformDashboard();
    return res.json(result);
  } catch (err) {
    console.error('admin dashboard failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

/** 宠物数据报表（后续订阅数据服务可复用） */
adminRouter.get('/reports/pets', adminRequired, async (req, res) => {
  try {
    const result = await platformStatsService.getPetReport();
    return res.json(result);
  } catch (err) {
    console.error('admin pet report failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

/** 店铺营业额报表（后续订阅数据服务可复用） */
adminRouter.get('/reports/store-revenue', adminRequired, async (req, res) => {
  try {
    const result = await platformStatsService.getStoreRevenueReport();
    return res.json(result);
  } catch (err) {
    console.error('admin store revenue report failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores', adminRequired, async (req, res) => {
  try {
    const result = await storeService.listAdminStores(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin list stores failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/detail', adminRequired, async (req, res) => {
  try {
    const result = await storeService.getAdminStoreDetail({
      store_id: (req.query && req.query.store_id) || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('admin get store detail failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/insights', adminRequired, async (req, res) => {
  try {
    const result = await storeService.getAdminStoreInsights({
      store_id: (req.query && req.query.store_id) || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('admin get store insights failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/coop-contract', adminRequired, async (req, res) => {
  try {
    const result = await storeService.getAdminCoopContract({
      store_id: (req.query && req.query.store_id) || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('admin get coop contract failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/orders', adminRequired, async (req, res) => {
  try {
    const result = await orderService.listAdminStoreOrders(req.query || {});
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('admin list store orders failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/orders/detail', adminRequired, async (req, res) => {
  try {
    const result = await orderService.getAdminOrderDetail(req.query || {});
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error('admin get order detail failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.post('/stores/access', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await storeService.updateAdminStoreAccess({
      store_id: body.store_id,
      action: body.action,
      reason: body.reason
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] store access', req.admin.username, body.store_id, body.action);
    return res.json(result);
  } catch (err) {
    console.error('admin store access failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '操作失败'
    });
  }
});

adminRouter.post('/stores/delete', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await storeService.deleteAdminStore({
      store_id: body.store_id
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] store delete', req.admin.username, body.store_id, 'users=', result.resetUsers);
    return res.json(result);
  } catch (err) {
    console.error('admin store delete failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '删除失败'
    });
  }
});

adminRouter.post('/stores/bind-oa', adminRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await storeService.bindAdminStoreOa({
      store_id: body.store_id,
      oa_openid: body.oa_openid || body.oaOpenid || ''
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log(
      '[admin] store bind oa',
      req.admin.username,
      body.store_id,
      result.ownerOaBound ? 'bound' : 'cleared'
    );
    return res.json(result);
  } catch (err) {
    console.error('admin store bind oa failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '操作失败'
    });
  }
});

adminRouter.get('/stores/push-status', adminRequired, async (req, res) => {
  try {
    const result = await notifyLogService.listAdminStorePushStatus(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin list store push status failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/stores/push-logs', adminRequired, async (req, res) => {
  try {
    const result = await notifyLogService.listAdminPushLogs(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin list store push logs failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.get('/config/merchant-switch', adminRequired, async (req, res) => {
  try {
    const result = await appConfigService.getMerchantSwitchStatus(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin get merchant-switch config failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.put('/config/merchant-switch', adminRequired, async (req, res) => {
  try {
    const result = await appConfigService.updateMerchantSwitchConfig(
      req.body || {},
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] merchant-switch', req.admin.username);
    return res.json(result);
  } catch (err) {
    console.error('admin update merchant-switch config failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '保存失败'
    });
  }
});

adminRouter.get('/config/versions', adminRequired, async (req, res) => {
  try {
    const result = await appConfigService.listVersions();
    return res.json(result);
  } catch (err) {
    console.error('admin list versions failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.post('/config/versions', adminRequired, async (req, res) => {
  try {
    const result = await appConfigService.upsertVersion(
      req.body || {},
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] version upsert', req.admin.username, result.version && result.version.version);
    return res.json(result);
  } catch (err) {
    console.error('admin upsert version failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '保存失败'
    });
  }
});

adminRouter.put('/config/versions/:version', adminRequired, async (req, res) => {
  try {
    const version = decodeURIComponent((req.params && req.params.version) || '');
    const body = req.body || {};
    let result;
    if (Object.prototype.hasOwnProperty.call(body, 'merchantSwitchEnabled')
      && body.note === undefined
      && Object.keys(body).length <= 2) {
      result = await appConfigService.setVersionEnabled(
        version,
        body.merchantSwitchEnabled,
        (req.admin && req.admin.username) || ''
      );
    } else {
      result = await appConfigService.upsertVersion(
        { ...body, version },
        (req.admin && req.admin.username) || ''
      );
    }
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] version update', req.admin.username, version, body.merchantSwitchEnabled);
    return res.json(result);
  } catch (err) {
    console.error('admin update version failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '保存失败'
    });
  }
});

adminRouter.delete('/config/versions/:version', adminRequired, async (req, res) => {
  try {
    const version = decodeURIComponent((req.params && req.params.version) || '');
    const result = await appConfigService.deleteVersion(
      version,
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] version delete', req.admin.username, version);
    return res.json(result);
  } catch (err) {
    console.error('admin delete version failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '删除失败'
    });
  }
});

adminRouter.get('/announcements', adminRequired, async (req, res) => {
  try {
    const result = await announcementService.listAdmin(req.query || {});
    return res.json(result);
  } catch (err) {
    console.error('admin list announcements failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

adminRouter.post('/announcements', adminRequired, async (req, res) => {
  try {
    const result = await announcementService.createAnnouncement(
      req.body || {},
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] announcement create', req.admin.username, result.announcement && result.announcement.id);
    return res.json(result);
  } catch (err) {
    console.error('admin create announcement failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '创建失败'
    });
  }
});

adminRouter.put('/announcements/:id', adminRequired, async (req, res) => {
  try {
    const result = await announcementService.updateAnnouncement(
      (req.params && req.params.id) || '',
      req.body || {},
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] announcement update', req.admin.username, req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('admin update announcement failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '保存失败'
    });
  }
});

adminRouter.delete('/announcements/:id', adminRequired, async (req, res) => {
  try {
    const result = await announcementService.deleteAnnouncement((req.params && req.params.id) || '');
    if (!result.success) {
      return res.status(400).json(result);
    }
    console.log('[admin] announcement delete', req.admin.username, req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('admin delete announcement failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '删除失败'
    });
  }
});

adminRouter.get('/membership/codes', adminRequired, async (req, res) => {
  try {
    return res.json(await membershipService.listRedeemCodes(req.query || {}));
  } catch (err) {
    console.error('admin list membership codes failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '加载失败' });
  }
});

adminRouter.post('/membership/codes/generate', adminRequired, async (req, res) => {
  try {
    const result = await membershipService.generateRedeemCodes(
      req.body || {},
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) return res.status(400).json(result);
    console.log('[admin] membership codes generated', req.admin.username, result.batchId, result.count);
    return res.json(result);
  } catch (err) {
    console.error('admin generate membership codes failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '生成失败' });
  }
});

adminRouter.post('/membership/codes/void', adminRequired, async (req, res) => {
  try {
    const result = await membershipService.voidRedeemCode(
      (req.body && req.body.id) || '',
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) return res.status(400).json(result);
    console.log('[admin] membership code voided', req.admin.username, req.body && req.body.id);
    return res.json(result);
  } catch (err) {
    console.error('admin void membership code failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '作废失败' });
  }
});

adminRouter.get('/membership/tasks', adminRequired, async (req, res) => {
  try {
    return res.json(await membershipService.listTaskSubmissions(req.query || {}));
  } catch (err) {
    console.error('admin list membership tasks failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '加载失败' });
  }
});

adminRouter.post('/membership/tasks/review', adminRequired, async (req, res) => {
  try {
    const result = await membershipService.reviewTaskSubmission(
      req.body || {},
      (req.admin && req.admin.username) || ''
    );
    if (!result.success) return res.status(400).json(result);
    console.log('[admin] membership task reviewed', req.admin.username, req.body && req.body.id, req.body && req.body.decision);
    return res.json(result);
  } catch (err) {
    console.error('admin review membership task failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '审核失败' });
  }
});

adminRouter.get('/membership/promotion-tasks', adminRequired, async (req, res) => {
  try {
    return res.json(await membershipService.listPromotionTasksAdmin());
  } catch (err) {
    console.error('admin list promotion tasks failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '加载失败' });
  }
});

adminRouter.post('/membership/promotion-tasks/save', adminRequired, async (req, res) => {
  try {
    const result = await membershipService.savePromotionTask(req.body || {}, (req.admin && req.admin.username) || '');
    if (!result.success) return res.status(400).json(result);
    console.log('[admin] promotion task saved', req.admin.username, result.id);
    return res.json(result);
  } catch (err) {
    console.error('admin save promotion task failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '保存失败' });
  }
});

adminRouter.post('/membership/promotion-tasks/status', adminRequired, async (req, res) => {
  try {
    const result = await membershipService.updatePromotionTaskStatus(req.body || {}, (req.admin && req.admin.username) || '');
    if (!result.success) return res.status(400).json(result);
    console.log('[admin] promotion task status changed', req.admin.username, req.body && req.body.id, req.body && req.body.status);
    return res.json(result);
  } catch (err) {
    console.error('admin update promotion task status failed', err);
    return res.status(500).json({ success: false, errMsg: (err && err.message) || '操作失败' });
  }
});

module.exports = adminRouter;
