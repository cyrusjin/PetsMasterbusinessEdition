const crypto = require('crypto');
const config = require('../config');

function hashPassword(password) {
  const salt = config.adminPasswordSalt;
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  const attempt = hashPassword(password);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(attempt, 'hex'),
      Buffer.from(passwordHash, 'hex')
    );
  } catch (err) {
    return false;
  }
}

function findAdminAccount(username) {
  const name = String(username || '').trim();
  if (!name) return null;
  return (config.adminAccounts || []).find((item) => item.username === name) || null;
}

function verifyAdminLogin(username, password) {
  const account = findAdminAccount(username);
  if (!account) {
    return { success: false, errMsg: '账号或密码错误' };
  }
  if (!verifyPassword(password, account.passwordHash)) {
    return { success: false, errMsg: '账号或密码错误' };
  }
  return {
    success: true,
    username: account.username,
    displayName: account.displayName || account.username
  };
}

module.exports = {
  hashPassword,
  verifyAdminLogin
};
