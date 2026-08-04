function hideHomeButton() {
  if (typeof wx.hideHomeButton === 'function') {
    wx.hideHomeButton();
  }
}

/**
 * 自定义导航栏尺寸（适配胶囊按钮）
 * @returns {{ statusBarHeight:number, navBarHeight:number, menuButton:object, totalHeight:number, sidePad:number }}
 */
function getCustomNavMetrics() {
  let statusBarHeight = 20;
  let menuButton = { top: 24, height: 32, width: 87, right: 7, bottom: 56, left: 281 };
  try {
    const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    statusBarHeight = Number(sys.statusBarHeight) || statusBarHeight;
  } catch (err) {
    // ignore
  }
  try {
    if (wx.getMenuButtonBoundingClientRect) {
      const rect = wx.getMenuButtonBoundingClientRect();
      if (rect && rect.height) menuButton = rect;
    }
  } catch (err) {
    // ignore
  }
  const gap = Math.max(0, (menuButton.top || 0) - statusBarHeight);
  const navBarHeight = gap * 2 + (menuButton.height || 32);
  return {
    statusBarHeight,
    navBarHeight,
    menuButton,
    totalHeight: statusBarHeight + navBarHeight,
    sidePad: 12
  };
}

module.exports = {
  hideHomeButton,
  getCustomNavMetrics
};
