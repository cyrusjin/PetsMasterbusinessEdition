const express = require('express');
const appConfigService = require('../services/appConfigService');
const holidayCalendarService = require('../services/holidayCalendarService');
const announcementService = require('../services/announcementService');

const configRouter = express.Router();

/** 小程序公开读取：是否展示「切换商家版」入口 */
configRouter.get('/merchant-switch', async (req, res) => {
  try {
    const result = await appConfigService.getMerchantSwitchStatus({
      envVersion: (req.query && (req.query.envVersion || req.query.env)) || '',
      version: (req.query && req.query.version) || ''
    });
    return res.json(result);
  } catch (err) {
    console.error('get merchant-switch config failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败',
      merchant_switch_enabled: false,
      merchantSwitchEnabled: false
    });
  }
});

/**
 * 放假休息日日历（按节日分组）。
 * 数据来自免费接口 timor.tech，服务端缓存；失败时回退本地兜底表。
 * 仅返回休息日（holiday=true），不含补班日。
 */
configRouter.get('/holiday-rest-days', async (req, res) => {
  try {
    const year = (req.query && req.query.year) || new Date().getFullYear();
    const result = await holidayCalendarService.getRestDayGroups(year);
    return res.json({
      ...result,
      years: holidayCalendarService.getAvailableYears()
    });
  } catch (err) {
    console.error('get holiday-rest-days failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载休息日失败',
      groups: [],
      years: holidayCalendarService.getAvailableYears()
    });
  }
});

/** 平台公告（小程序公开读取，仅已发布） */
configRouter.get('/announcements', async (req, res) => {
  try {
    const result = await announcementService.listPublic({
      audience: (req.query && req.query.audience) || 'merchant',
      limit: (req.query && req.query.limit) || 50
    });
    return res.json(result);
  } catch (err) {
    console.error('get announcements failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载公告失败',
      list: []
    });
  }
});

configRouter.get('/announcements/:id', async (req, res) => {
  try {
    const item = await announcementService.getById((req.params && req.params.id) || '');
    if (!item || item.status !== 'published') {
      return res.status(404).json({ success: false, errMsg: '公告不存在或未发布' });
    }
    const audience = (req.query && req.query.audience) || 'merchant';
    if (!announcementService.matchesAudience(item.audience, audience)) {
      return res.status(404).json({ success: false, errMsg: '公告不存在或未发布' });
    }
    return res.json({ success: true, announcement: item });
  } catch (err) {
    console.error('get announcement detail failed', err);
    return res.status(500).json({
      success: false,
      errMsg: (err && err.message) || '加载失败'
    });
  }
});

module.exports = configRouter;
