const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.membership') });

function required(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function hashAdminPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function parseAdminAccounts(raw, salt) {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text.split(',').map((entry) => {
    const parts = entry.trim().split(':');
    const username = (parts[0] || '').trim();
    const password = parts.slice(1).join(':');
    if (!username || !password) return null;
    return {
      username,
      displayName: username,
      passwordHash: hashAdminPassword(password, salt)
    };
  }).filter(Boolean);
}

const userAppId = required('WX_APPID') || required('WX_USER_APPID');
const userSecret = required('WX_SECRET') || required('WX_USER_SECRET');
const merchantAppId = required('WX_MERCHANT_APPID', '');
const merchantSecret = required('WX_MERCHANT_SECRET', '');

function parseJsonMap(raw, fallback = {}) {
  const text = String(raw || '').trim();
  if (!text) return { ...fallback };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...fallback };
    return { ...fallback, ...parsed };
  } catch (_) {
    return { ...fallback };
  }
}

const defaultTemplateFields = {
  newOrder: {
    customerName: 'thing1',
    userPhone: 'phone_number11',
    projectName: 'thing6',
    serviceTime: 'time4'
  },
  orderStatus: {
    orderNo: 'character_string1',
    petName: 'thing2',
    status: 'phrase3',
    storeName: 'thing4',
    updateTime: 'time5'
  },
  orderCancel: {
    projectName: 'thing12',
    userPhone: 'phone_number16',
    cancelTime: 'time5'
  },
  merchantApplyApproved: {
    applicantName: 'thing2',
    merchantName: 'thing5',
    applyTime: 'time3'
  },
  merchantApplyRejected: {
    applicantName: 'thing2',
    applyTime: 'time3',
    merchantName: 'thing5',
    rejectReason: 'thing6'
  },
  merchantApplyAdmin: {
    userName: 'thing2',
    platformName: 'thing1'
  },
  dailyCheck: {
    storeName: 'thing6',
    customerName: 'thing1',
    projectName: 'thing8',
    checkTime: 'time10'
  },
  // thing5=商户名称 字段实际填引导文案；time3=首次申请入驻时间
  merchantNoOrder: {
    merchantName: 'thing5',
    applyTime: 'time3'
  }
};

function parseCsvList(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 解析「微信号:服务号openid」映射，如 NYS_Eason:oSslh...,VanlaStory:oXxx */
function parseWechatIdOaMap(raw) {
  const map = {};
  parseCsvList(raw).forEach((entry) => {
    const idx = entry.indexOf(':');
    if (idx <= 0) return;
    const wechatId = entry.slice(0, idx).trim();
    const oaOpenid = entry.slice(idx + 1).trim();
    if (wechatId && oaOpenid) map[wechatId] = oaOpenid;
  });
  return map;
}

const config = {
  port: Number(required('PORT', '3000')),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/petmaster'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: required('JWT_EXPIRES_IN', '30d'),
  // 兼容旧变量：WX_APPID/WX_SECRET = 宠主端
  wxAppId: userAppId,
  wxSecret: userSecret,
  wxApps: {
    user: {
      appId: userAppId,
      secret: userSecret
    },
    merchant: {
      appId: merchantAppId || userAppId,
      secret: merchantSecret || userSecret
    }
  },
  // 服务号（模板消息推送 / 关注欢迎）
  wxOa: {
    appId: required('WX_OA_APPID', ''),
    secret: required('WX_OA_SECRET', ''),
    token: required('WX_OA_TOKEN', ''),
    aesKey: required('WX_OA_AES_KEY', ''),
    qrcodeUrl: required('WX_OA_QRCODE_URL', ''),
    adminNotify: {
      platformName: required('WX_OA_ADMIN_PLATFORM_NAME', '熠森宠物管家'),
      nicknames: parseCsvList(required('WX_OA_ADMIN_NOTIFY_NICKNAMES', 'Eason_,Freddie')),
      wechatIds: parseCsvList(required('WX_OA_ADMIN_NOTIFY_WECHAT_IDS', '')),
      // 小程序 openid（自动查用户表绑定的服务号 openid）
      mpOpenids: parseCsvList(required('WX_OA_ADMIN_NOTIFY_MP_OPENIDS', '')),
      oaOpenids: parseCsvList(required('WX_OA_ADMIN_NOTIFY_OA_OPENIDS', '')),
      // 可选：微信号直接映射服务号 openid，无需用户表字段
      wechatIdOaMap: parseWechatIdOaMap(required('WX_OA_ADMIN_NOTIFY_MAP', ''))
    },
    welcome: {
      text: required(
        'WX_OA_WELCOME_TEXT',
        '欢迎关注熠森宠物管家！我是你的宠物管家助手～点击下方小程序，即可预约托管、查看日常打卡，并及时接收服务通知。'
      ),
      // 默认推送商家端小程序
      mpAppId: required('WX_OA_WELCOME_MP_APPID', '') || merchantAppId || userAppId,
      mpPath: required('WX_OA_WELCOME_MP_PATH', 'pages/index/index'),
      mpTitle: required('WX_OA_WELCOME_MP_TITLE', '打开宠物管家'),
      thumbMediaId: required('WX_OA_WELCOME_THUMB_MEDIA_ID', '')
    },
    templates: {
      newOrder: required('WX_OA_TEMPLATE_NEW_ORDER', ''),
      orderStatus: required('WX_OA_TEMPLATE_ORDER_STATUS', ''),
      orderCancel: required('WX_OA_TEMPLATE_ORDER_CANCEL', ''),
      merchantApplyApproved: required('WX_OA_TEMPLATE_MERCHANT_APPLY_APPROVED', ''),
      merchantApplyRejected: required('WX_OA_TEMPLATE_MERCHANT_APPLY_REJECTED', ''),
      merchantApplyAdmin: required('WX_OA_TEMPLATE_MERCHANT_APPLY_ADMIN', ''),
      dailyCheck: required('WX_OA_TEMPLATE_DAILY_CHECK', ''),
      merchantNoOrder: required('WX_OA_TEMPLATE_MERCHANT_NO_ORDER', '')
    },
    templateFields: {
      newOrder: parseJsonMap(required('WX_OA_FIELDS_NEW_ORDER', ''), defaultTemplateFields.newOrder),
      orderStatus: parseJsonMap(required('WX_OA_FIELDS_ORDER_STATUS', ''), defaultTemplateFields.orderStatus),
      orderCancel: parseJsonMap(required('WX_OA_FIELDS_ORDER_CANCEL', ''), defaultTemplateFields.orderCancel),
      merchantApplyApproved: parseJsonMap(
        required('WX_OA_FIELDS_MERCHANT_APPLY_APPROVED', ''),
        defaultTemplateFields.merchantApplyApproved
      ),
      merchantApplyRejected: parseJsonMap(
        required('WX_OA_FIELDS_MERCHANT_APPLY_REJECTED', ''),
        defaultTemplateFields.merchantApplyRejected
      ),
      merchantApplyAdmin: parseJsonMap(
        required('WX_OA_FIELDS_MERCHANT_APPLY_ADMIN', ''),
        defaultTemplateFields.merchantApplyAdmin
      ),
      dailyCheck: parseJsonMap(required('WX_OA_FIELDS_DAILY_CHECK', ''), defaultTemplateFields.dailyCheck),
      merchantNoOrder: parseJsonMap(
        required('WX_OA_FIELDS_MERCHANT_NO_ORDER', ''),
        defaultTemplateFields.merchantNoOrder
      )
    }
  },
  // 小程序消息推送（mediaCheckAsync 异步审图结果），两端可共用同一 Token/AES
  wxMp: {
    token: required('WX_MP_TOKEN', '') || required('WX_OA_TOKEN', ''),
    aesKey: required('WX_MP_AES_KEY', ''),
    // true：上传同步 imgSecCheck 拦截违规图（推荐）；false：仅异步抽检
    syncImageCheck: String(required('WX_MEDIA_SYNC_CHECK', 'true')).toLowerCase() !== 'false'
  },
  // 腾讯位置服务（接送导航距离）
  tencentMapKey: required('TENCENT_MAP_KEY', ''),
  // 媒体文件存轻量服务器本地磁盘（不再依赖 OSS）
  media: {
    root: required('MEDIA_ROOT', path.join(__dirname, '..', 'data', 'media')),
    apiPublicBaseUrl: required('API_PUBLIC_BASE_URL', 'https://api.petmaster.me'),
    publicBaseUrl: required('MEDIA_PUBLIC_BASE_URL', 'https://api.petmaster.me/media')
  },
  membership: {
    enabled: String(required('MEMBERSHIP_ENABLED', 'true')).toLowerCase() !== 'false',
    monthlyPriceFen: Math.max(1, Number(required('MEMBERSHIP_MONTHLY_PRICE_FEN', '1990')) || 1990),
    halfYearlyPriceFen: Math.max(1, Number(required('MEMBERSHIP_HALF_YEARLY_PRICE_FEN', '9900')) || 9900),
    yearlyPriceFen: Math.max(1, Number(required('MEMBERSHIP_YEARLY_PRICE_FEN', '16900')) || 16900),
    payEnabled: String(required('MEMBERSHIP_PAY_ENABLED', 'false')).toLowerCase() === 'true',
    wechatPay: {
      mchId: required('WECHAT_PAY_MCH_ID', ''),
      certSerial: required('WECHAT_PAY_CERT_SERIAL', ''),
      privateKeyPath: required('WECHAT_PAY_PRIVATE_KEY_PATH', ''),
      apiV3KeyPath: required('WECHAT_PAY_API_V3_KEY_PATH', ''),
      publicKeyId: required('WECHAT_PAY_PUBLIC_KEY_ID', ''),
      publicKeyPath: required('WECHAT_PAY_PUBLIC_KEY_PATH', ''),
      notifyUrl: required('WECHAT_PAY_NOTIFY_URL', '')
    }
  },
  // 保留空 oss 字段，避免旧引用报错
  oss: {
    region: required('OSS_REGION', 'oss-cn-hangzhou'),
    bucket: required('OSS_BUCKET', ''),
    accessKeyId: required('OSS_ACCESS_KEY_ID', ''),
    accessKeySecret: required('OSS_ACCESS_KEY_SECRET', ''),
    publicBaseUrl: required('OSS_PUBLIC_BASE_URL', ''),
    publicRead: true,
    signedUrlExpires: 3600
  },
  devMockWechat: String(required('DEV_MOCK_WECHAT', 'false')).toLowerCase() === 'true',
  adminPasswordSalt: required('ADMIN_PASSWORD_SALT', required('JWT_SECRET', 'dev-secret-change-me')),
  adminJwtExpiresIn: required('ADMIN_JWT_EXPIRES_IN', '8h'),
  adminAccounts: parseAdminAccounts(
    required('ADMIN_ACCOUNTS', 'jinsen:PetMaster@2026,reviewer:Review@2026'),
    required('ADMIN_PASSWORD_SALT', required('JWT_SECRET', 'dev-secret-change-me'))
  )
};

module.exports = config;
