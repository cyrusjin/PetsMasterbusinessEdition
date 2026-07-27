function copyText(text, toastTitle = '已复制') {
  const value = String(text == null ? '' : text).trim();
  if (!value || value === '--') {
    wx.showToast({ title: '暂无可复制内容', icon: 'none' });
    return;
  }
  wx.setClipboardData({
    data: value,
    success: () => wx.showToast({ title: toastTitle, icon: 'success' })
  });
}

module.exports = {
  copyText
};
