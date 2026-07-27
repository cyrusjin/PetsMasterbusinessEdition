function showValidationAlert(message, title = '请完善信息') {
  wx.showModal({
    title,
    content: message,
    showCancel: false,
    confirmColor: '#E98657'
  });
}

module.exports = { showValidationAlert };
