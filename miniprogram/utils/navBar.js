function hideHomeButton() {
  if (typeof wx.hideHomeButton === 'function') {
    wx.hideHomeButton();
  }
}

module.exports = {
  hideHomeButton
};
