/**
 * 店铺邀请海报：落地页风格 + 带 store_id 的服务号二维码
 */

function downloadTempFile(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('缺少图片地址'));
      return;
    }
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error('下载图片失败'));
      },
      fail: (err) => reject(err || new Error('下载图片失败'))
    });
  });
}

function shareLocalImage(filePath) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error('缺少本地图片'));
      return;
    }
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path: filePath,
        success: () => resolve({ shared: true }),
        fail: (err) => reject(err || new Error('打开分享失败'))
      });
      return;
    }
    wx.previewImage({
      urls: [filePath],
      current: filePath,
      success: () => resolve({ previewed: true }),
      fail: (err) => reject(err || new Error('预览失败'))
    });
  });
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCoverImage(ctx, img, x, y, w, h, radius) {
  if (!img) return;
  ctx.save();
  roundRect(ctx, x, y, w, h, radius || 0);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function wrapName(name, maxChars) {
  const text = String(name || '宠物寄养').trim() || '宠物寄养';
  if (text.length <= maxChars) return [text];
  const first = text.slice(0, maxChars);
  const rest = text.slice(maxChars);
  return [first, rest.length > maxChars ? `${rest.slice(0, maxChars - 1)}…` : rest];
}

function exportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      fileType: 'jpg',
      quality: 0.92,
      success: (res) => {
        if (res && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error('导出海报失败'));
      },
      fail: (err) => reject(err || new Error('导出海报失败'))
    });
  });
}

/**
 * 本地绘制邀请海报
 */
function buildLocalStorePoster({ storeName, logoPath, qrPath }) {
  if (!wx.createOffscreenCanvas) {
    return Promise.reject(new Error('当前微信版本过低，无法生成海报'));
  }
  if (!qrPath) {
    return Promise.reject(new Error('缺少服务号二维码'));
  }

  const width = 750;
  const height = 1200;
  const canvas = wx.createOffscreenCanvas({ type: '2d', width, height });
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('无法创建画布'));
  }

  return Promise.all([
    loadCanvasImage(canvas, logoPath || ''),
    loadCanvasImage(canvas, qrPath)
  ]).then(([logoImg, qrImg]) => {
    if (!qrImg) {
      throw new Error('二维码加载失败');
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#e8f6ef');
    gradient.addColorStop(0.45, '#f7faf8');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#5f7a6c';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('熠森宠物管家 · 猫森宠物服务号', 48, 64);

    ctx.save();
    ctx.shadowColor = 'rgba(31, 74, 52, 0.12)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, 40, 96, 670, 1040, 36);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    const logoX = 303;
    const logoY = 148;
    const logoSize = 144;
    if (logoImg) {
      drawCoverImage(ctx, logoImg, logoX, logoY, logoSize, logoSize, 28);
    } else {
      roundRect(ctx, logoX, logoY, logoSize, logoSize, 28);
      ctx.fillStyle = '#d9ebe1';
      ctx.fill();
      ctx.fillStyle = '#3d6b54';
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('宠', logoX + logoSize / 2, logoY + 92);
    }

    const nameLines = wrapName(storeName, 12);
    ctx.fillStyle = '#1f2a24';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    nameLines.forEach((line, index) => {
      ctx.fillText(line, width / 2, 318 + index * 52);
    });

    ctx.fillStyle = '#5b6b62';
    ctx.font = '26px sans-serif';
    ctx.fillText('长按识别二维码，关注服务号', width / 2, 450);
    ctx.fillText('关注后自动收到预约小程序，无需再点菜单', width / 2, 492);

    roundRect(ctx, 163, 548, 424, 424, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#e5efe9';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(qrImg, 175, 560, 400, 400);

    ctx.fillStyle = '#6a7c72';
    ctx.font = '24px sans-serif';
    ctx.fillText('扫码即可绑定本店 · 小程序封面为本店头像', width / 2, 1030);

    return exportCanvas(canvas);
  });
}

function shareStorePosterFromUrl(posterUrl) {
  return downloadTempFile(posterUrl).then((path) => shareLocalImage(path));
}

/**
 * 优先本地绘制海报（手机有中文字体）；失败再走服务端海报
 */
function shareStoreInvitePoster({ posterUrl, qrcodeUrl, storeLogo, storeName }) {
  const buildLocal = () => {
    if (!qrcodeUrl) {
      return Promise.reject(new Error('未生成可分享图片'));
    }
    return downloadTempFile(qrcodeUrl).then((qrPath) => {
      const logoPromise = storeLogo && /^https?:\/\//i.test(storeLogo)
        ? downloadTempFile(storeLogo).catch(() => '')
        : Promise.resolve('');
      return logoPromise.then((logoPath) => buildLocalStorePoster({
        storeName: storeName || '宠物寄养',
        logoPath: logoPath || '',
        qrPath
      })).then((path) => shareLocalImage(path));
    });
  };

  return buildLocal().catch((localErr) => {
    if (!posterUrl) {
      return Promise.reject(localErr || new Error('生成海报失败'));
    }
    return shareStorePosterFromUrl(posterUrl).catch(() => {
      return Promise.reject(localErr || new Error('生成海报失败'));
    });
  });
}

module.exports = {
  downloadTempFile,
  shareLocalImage,
  shareStorePosterFromUrl,
  buildLocalStorePoster,
  shareStoreInvitePoster
};
