/** 猫森宠物服务号 */
const OA_USERNAME = 'gh_058363435a28';
const OA_DISPLAY_NAME = '熠森宠物';
const DEFAULT_OA_QRCODE = '/images/oa-qrcode.png';

function isOaBound(user) {
  return !!(user && user.oaBound);
}

function openOfficialAccountProfile(options = {}) {
  const onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
  if (!wx.openOfficialAccountProfile) {
    wx.showToast({
      title: `请搜索「${OA_DISPLAY_NAME}」关注`,
      icon: 'none'
    });
    if (onComplete) onComplete({ ok: false });
    return;
  }
  wx.openOfficialAccountProfile({
    username: OA_USERNAME,
    complete: () => {
      if (onComplete) onComplete({ ok: true });
    },
    fail: () => {
      wx.showToast({
        title: `打开失败，请搜索「${OA_DISPLAY_NAME}」关注`,
        icon: 'none'
      });
    }
  });
}

module.exports = {
  OA_USERNAME,
  OA_DISPLAY_NAME,
  DEFAULT_OA_QRCODE,
  isOaBound,
  openOfficialAccountProfile
};
