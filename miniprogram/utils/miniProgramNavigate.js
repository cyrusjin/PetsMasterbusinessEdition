/**
 * 跳转另一小程序时使用的目标版本。
 * 当前端为开发版/体验版时，可打开对方对应版本；正式版只能打开对方正式版。
 */
function resolveTargetEnvVersion() {
  try {
    const env = wx.getAccountInfoSync().miniProgram.envVersion;
    if (env === 'develop' || env === 'trial') {
      return env;
    }
  } catch (err) {
    // ignore
  }
  return 'release';
}

module.exports = {
  resolveTargetEnvVersion
};
