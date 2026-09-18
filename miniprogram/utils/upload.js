const { requestUploadSign, getToken } = require('./api');
const { isRemotePhoto } = require('./photoPath');

const UPLOAD_TIMEOUT_MS = 300000;
const UPLOAD_RETRY_TIMES = 3;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableUploadError(err) {
  const raw = String((err && (err.message || err.errMsg)) || '');
  if (/过大|违规|未登录|过期|无权|LIMIT_FILE_SIZE/i.test(raw)) return false;
  return /timeout|超时|fail|网络|ECONN|502|503|504|HTTP 5/i.test(raw);
}

function retry(task, times, delay) {
  return Promise.resolve()
    .then(task)
    .catch((err) => {
      if (times <= 1 || !isRetryableUploadError(err)) {
        return Promise.reject(err);
      }
      return wait(delay).then(() => retry(task, times - 1, Math.min(delay + 800, 4000)));
    });
}

function uploadLocalImage(localPath, folder) {
  if (!localPath || isRemotePhoto(localPath)) {
    return Promise.resolve(localPath || '');
  }
  const ext = (localPath.split('.').pop() || 'jpg').split('?')[0];
  return uploadFileToServer(localPath, folder || 'uploads', ext);
}

function uploadFileToServerOnce(filePath, folder, ext) {
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
        timeout: UPLOAD_TIMEOUT_MS,
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
          const raw = (err && (err.errMsg || err.message)) || '文件上传失败';
          if (/timeout/i.test(raw)) {
            reject(new Error('上传超时，请换短一点的视频或切到 WiFi 后重试'));
            return;
          }
          reject(new Error(raw));
        }
      });
    });
  });
}

function uploadFileToServer(filePath, folder, ext) {
  return retry(() => uploadFileToServerOnce(filePath, folder, ext), UPLOAD_RETRY_TIMES, 800);
}

module.exports = {
  uploadLocalImage,
  uploadFileToServer,
  retry,
  isRetryableUploadError
};
