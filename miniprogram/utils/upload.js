const { requestUploadSign, getToken } = require('./api');
const { isRemotePhoto } = require('./photoPath');

function uploadLocalImage(localPath, folder) {
  if (!localPath || isRemotePhoto(localPath)) {
    return Promise.resolve(localPath || '');
  }
  const ext = (localPath.split('.').pop() || 'jpg').split('?')[0];
  return uploadFileToServer(localPath, folder || 'uploads', ext);
}

function uploadFileToServer(filePath, folder, ext) {
  return requestUploadSign(folder, ext).then((res) => {
    if (!res.success || !res.upload) {
      return Promise.reject(new Error((res && res.errMsg) || '获取上传签名失败'));
    }
    const form = res.upload;
    const token = getToken();
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: form.host,
        filePath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : {},
        formData: {
          key: form.key
        },
        success: (uploadRes) => {
          const status = uploadRes.statusCode || 0;
          if (status >= 200 && status < 300) {
            resolve(form.publicUrl);
            return;
          }
          if (status === 413) {
            reject(new Error('文件过大，请换小一点的'));
            return;
          }
          let detail = '';
          try {
            const body = typeof uploadRes.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes.data;
            detail = (body && body.errMsg) || '';
          } catch (e) {
            detail = '';
          }
          const detailText = String(detail || '');
          if (/过大|too large|LIMIT_FILE_SIZE|Entity Too Large/i.test(detailText)
            || /过大|too large|LIMIT_FILE_SIZE|Entity Too Large/i.test(String(uploadRes.data || ''))) {
            reject(new Error('文件过大，请换小一点的'));
            return;
          }
          reject(new Error(detail || `上传失败 HTTP ${status}`));
        },
        fail: (err) => {
          reject(new Error((err && (err.errMsg || err.message)) || '文件上传失败'));
        }
      });
    });
  });
}

module.exports = {
  uploadLocalImage,
  uploadFileToServer
};
