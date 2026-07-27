const { resolveImageUrl } = require('./imageCache');
const { buildOrderDetailSections } = require('./orderDetailView');

const CANVAS_WIDTH = 750;
const PADDING = 40;
const LINE_HEIGHT = 42;
const SECTION_GAP = 28;
const TITLE_SIZE = 36;
const SECTION_SIZE = 30;
const TEXT_SIZE = 26;
const PHOTO_SIZE = 220;
const PHOTO_GAP = 24;
const LABEL_COLOR = '#666666';
const TEXT_COLOR = '#333333';
const BG_COLOR = '#FFFFFF';
const BORDER_COLOR = '#F2DEC9';

function wrapText(ctx, text, maxWidth) {
  const content = text == null || text === '' ? '--' : String(text);
  const chars = content.split('');
  const lines = [];
  let line = '';
  chars.forEach((ch) => {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : ['--'];
}

function measureSections(ctx, sections, petImage) {
  const contentWidth = CANVAS_WIDTH - PADDING * 2;
  const labelWidth = 180;
  const valueWidth = contentWidth - labelWidth - 20;
  let height = PADDING;

  height += TITLE_SIZE + SECTION_GAP;
  height += LINE_HEIGHT + 10;

  sections.forEach((section) => {
    height += SECTION_SIZE + 20;
    if (section.title === '宠物信息') {
      height += PHOTO_SIZE + PHOTO_GAP;
    }
    section.rows.forEach((row) => {
      const valueLines = wrapText(ctx, row[1], valueWidth);
      height += Math.max(LINE_HEIGHT, valueLines.length * LINE_HEIGHT) + 16;
    });
    height += SECTION_GAP;
  });

  height += PADDING;
  return { height, labelWidth, valueWidth, contentWidth, petImage };
}

function drawPhotoBlock(ctx, image, y) {
  const photoX = (CANVAS_WIDTH - PHOTO_SIZE) / 2;
  ctx.fillStyle = '#F7F8FA';
  ctx.fillRect(photoX, y, PHOTO_SIZE, PHOTO_SIZE);
  ctx.strokeStyle = BORDER_COLOR;
  ctx.strokeRect(photoX, y, PHOTO_SIZE, PHOTO_SIZE);

  if (image) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(photoX, y, PHOTO_SIZE, PHOTO_SIZE);
    ctx.clip();
    const ratio = Math.max(PHOTO_SIZE / image.width, PHOTO_SIZE / image.height);
    const drawW = image.width * ratio;
    const drawH = image.height * ratio;
    const drawX = photoX + (PHOTO_SIZE - drawW) / 2;
    const drawY = y + (PHOTO_SIZE - drawH) / 2;
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = `${TEXT_SIZE}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('暂无宠物照片', CANVAS_WIDTH / 2, y + PHOTO_SIZE / 2);
    ctx.textAlign = 'left';
  }

  return y + PHOTO_SIZE + PHOTO_GAP;
}

function drawSections(ctx, sections, metrics) {
  const { labelWidth, valueWidth, petImage } = metrics;
  let y = PADDING;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, metrics.height);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = `bold ${TITLE_SIZE}px sans-serif`;
  ctx.fillText('寄养订单详情', PADDING, y + TITLE_SIZE);
  y += TITLE_SIZE + SECTION_GAP;

  ctx.font = `${TEXT_SIZE - 4}px sans-serif`;
  ctx.fillStyle = LABEL_COLOR;
  ctx.fillText(`导出时间：${formatNow()}`, PADDING, y + TEXT_SIZE);
  y += LINE_HEIGHT + 10;

  sections.forEach((section) => {
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `bold ${SECTION_SIZE}px sans-serif`;
    ctx.fillText(section.title, PADDING, y + SECTION_SIZE);
    y += SECTION_SIZE + 20;

    if (section.title === '宠物信息') {
      y = drawPhotoBlock(ctx, petImage, y);
    }

    section.rows.forEach((row) => {
      const valueLines = wrapText(ctx, row[1], valueWidth);
      const rowHeight = Math.max(LINE_HEIGHT, valueLines.length * LINE_HEIGHT);

      ctx.fillStyle = LABEL_COLOR;
      ctx.font = `${TEXT_SIZE}px sans-serif`;
      ctx.fillText(row[0], PADDING, y + TEXT_SIZE);

      ctx.fillStyle = TEXT_COLOR;
      valueLines.forEach((line, index) => {
        ctx.fillText(line, PADDING + labelWidth + 20, y + TEXT_SIZE + index * LINE_HEIGHT);
      });

      y += rowHeight + 8;
      ctx.strokeStyle = BORDER_COLOR;
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(CANVAS_WIDTH - PADDING, y);
      ctx.stroke();
      y += 8;
    });

    y += SECTION_GAP;
  });
}

function formatNow() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getCanvasNode(page) {
  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery().in(page);
    query.select('#orderExportCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) {
          reject(new Error('导出画布初始化失败'));
          return;
        }
        resolve(item.node);
      });
  });
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function exportOrderDetailImage(page, payload) {
  const sections = buildOrderDetailSections(
    payload.order,
    payload.petView,
    payload.feeSummary,
    payload.feeDetail
  );
  const photoSource = payload.petView.photo || '';

  return resolveImageUrl(photoSource)
    .then((resolvedPhoto) => getCanvasNode(page).then((canvas) => (
      loadCanvasImage(canvas, resolvedPhoto).then((petImage) => {
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        const metrics = measureSections(ctx, sections, petImage);

        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = metrics.height * dpr;
        ctx.scale(dpr, dpr);

        drawSections(ctx, sections, metrics);

        return new Promise((resolve, reject) => {
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'jpg',
            quality: 0.92,
            success: (res) => resolve(res.tempFilePath),
            fail: (err) => reject(new Error((err && err.errMsg) || '生成订单文件失败'))
          });
        });
      })
    )));
}

function shareExportedFile(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof wx.showShareImageMenu === 'function') {
      wx.showShareImageMenu({
        path: filePath,
        success: resolve,
        fail: (err) => {
          wx.previewImage({
            current: filePath,
            urls: [filePath],
            success: resolve,
            fail: () => reject(new Error((err && err.errMsg) || '分享失败，请长按图片保存后发送'))
          });
        }
      });
      return;
    }
    wx.previewImage({
      current: filePath,
      urls: [filePath],
      success: resolve,
      fail: reject
    });
  });
}

function exportAndShareOrderDetail(page, payload) {
  return exportOrderDetailImage(page, payload).then((filePath) => shareExportedFile(filePath));
}

module.exports = {
  exportAndShareOrderDetail
};
