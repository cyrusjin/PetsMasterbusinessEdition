function showValidationAlert(message, title = '请完善信息', extra) {
  const options = extra && typeof extra === 'object' ? extra : {};
  wx.showModal({
    title: title || '请完善信息',
    content: message,
    showCancel: false,
    confirmColor: '#E98657',
    success: (res) => {
      if (res.confirm && typeof options.onConfirm === 'function') {
        options.onConfirm();
      }
    }
  });
}

module.exports = { showValidationAlert };
