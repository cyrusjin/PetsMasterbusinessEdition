const { isValidMobilePhone } = require('./phone');

function isAuthorizedNickName(nickName) {
  const nick = (nickName || '').trim();
  return !!nick && nick !== '微信用户';
}

function hasUserAuthProfile(user) {
  const u = user || {};
  return isAuthorizedNickName(u.nickName) && isValidMobilePhone(u.phone);
}

module.exports = {
  isAuthorizedNickName,
  hasUserAuthProfile
};
