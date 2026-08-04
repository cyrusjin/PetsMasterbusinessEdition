const { isValidMobilePhone } = require('./phone');

/**
 * 是否已拿到可用的微信昵称。
 * 单个英文字母/数字常见于 type=nickname 受控回写时只收到首字符的脏数据，不视为已授权。
 */
function isAuthorizedNickName(nickName) {
  const nick = (nickName || '').trim();
  if (!nick || nick === '微信用户') return false;
  if (/^[A-Za-z0-9]$/.test(nick)) return false;
  return true;
}

function getDisplayNickName(user, fallback = '小主') {
  const nick = user && user.nickName;
  return isAuthorizedNickName(nick) ? nick.trim() : fallback;
}

function hasUserAuthProfile(user) {
  const u = user || {};
  return isAuthorizedNickName(u.nickName) && isValidMobilePhone(u.phone);
}

function compareVersion(v1, v2) {
  const a = String(v1 || '0').split('.');
  const b = String(v2 || '0').split('.');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const n1 = parseInt(a[i] || '0', 10) || 0;
    const n2 = parseInt(b[i] || '0', 10) || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

function getSDKVersion() {
  try {
    if (typeof wx.getAppBaseInfo === 'function') {
      const info = wx.getAppBaseInfo() || {};
      if (info.SDKVersion) return String(info.SDKVersion);
    }
  } catch (err) { /* ignore */ }
  try {
    const info = wx.getSystemInfoSync() || {};
    return String(info.SDKVersion || '0.0.0');
  } catch (err) {
    return '0.0.0';
  }
}

/**
 * 昵称获取能力：
 * - nickname-input：基础库 >= 2.21.2，键盘上方点选（无授权弹窗）
 * - user-profile：旧版，wx.getUserProfile 弹窗
 * - manual：只能手输
 */
function getNickNameCapability() {
  const SDKVersion = getSDKVersion();
  const canNicknameInput = (typeof wx.canIUse === 'function' && wx.canIUse('input.type.nickname'))
    || compareVersion(SDKVersion, '2.21.2') >= 0;
  const canGetUserProfile = typeof wx.getUserProfile === 'function';
  let mode = 'manual';
  if (canNicknameInput) mode = 'nickname-input';
  else if (canGetUserProfile) mode = 'user-profile';
  return {
    SDKVersion,
    canNicknameInput,
    canGetUserProfile,
    mode
  };
}

module.exports = {
  isAuthorizedNickName,
  getDisplayNickName,
  hasUserAuthProfile,
  compareVersion,
  getSDKVersion,
  getNickNameCapability
};
