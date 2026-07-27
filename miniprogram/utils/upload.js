const { requestUploadSign, getToken } = require('./api');
const { isRemotePhoto } = require('./storePhotos');

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
          let detail = '';
          try {
            const body = typeof uploadRes.data === 'string' ? JSON.parse(uploadRes.data) : uploadRes.data;
            detail = (body && body.errMsg) || '';
          } catch (e) {
            detail = '';
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
