const MAX_BYTES = 5 * 1024 * 1024;
function nativeCall(invoke, label, milliseconds = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时，请重新拍摄照片后再试`)), milliseconds);
    const success = value => { clearTimeout(timer); resolve(value); };
    const fail = () => { clearTimeout(timer); reject(new Error(`${label}失败，请重新选择清晰的原件照片`)); };
    try { invoke({ success, fail }); } catch (_) { fail(); }
  });
}
function imageInfo(src) {
  return nativeCall(callbacks => wx.getImageInfo({ src, ...callbacks }), '读取照片');
}
function fileSize(filePath) {
  return nativeCall(callbacks => wx.getFileSystemManager().getFileInfo({ filePath, ...callbacks }), '读取照片大小').then(r => r.size);
}

// Keep smaller originals intact. Larger photos are resized proportionally without cropping.
module.exports = async function prepareImage(file, onStage = () => {}) {
  try {
    onStage('正在读取照片');
    const info = await imageInfo(file.tempFilePath);
    const size = Number.isFinite(file.size) && file.size > 0 ? file.size : await fileSize(file.tempFilePath);
    if (size <= MAX_BYTES && info.width * info.height <= 40000000 && ['jpeg', 'jpg', 'png'].includes(info.type)) return file.tempFilePath;
    for (const [edge, quality] of [[3200, 90], [2600, 85], [2200, 80], [1800, 75]]) {
      onStage('正在压缩照片');
      const ratio = Math.min(1, edge / Math.max(info.width, info.height));
      const result = await nativeCall(callbacks => wx.compressImage({
        src: file.tempFilePath, quality,
        compressedWidth: Math.max(1, Math.round(info.width * ratio)),
        compressedHeight: Math.max(1, Math.round(info.height * ratio)),
        ...callbacks
      }), '压缩照片', 20000);
      const compressed = await imageInfo(result.tempFilePath);
      if (await fileSize(result.tempFilePath) <= MAX_BYTES && compressed.width * compressed.height <= 40000000 && ['jpeg', 'jpg', 'png'].includes(compressed.type)) return result.tempFilePath;
    }
    throw new Error('compression incomplete');
  } catch (error) {
    throw new Error(/^(读取照片|压缩照片)/.test(error.message || '') ? error.message : '照片自动处理未成功，请重新拍摄清晰完整的原件照片后上传');
  }
};
