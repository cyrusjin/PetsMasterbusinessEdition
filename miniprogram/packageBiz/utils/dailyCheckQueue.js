const { isRemotePhoto, isLocalTempPath } = require('../../utils/photoPath');
const dailyMedia = require('./dailyMedia');

const USER_DIR = () => (wx.env && wx.env.USER_DATA_PATH) || '';
const STATE_KEY = 'dailyCheckUpload';

let queue = [];
let running = false;
let copiedFiles = [];

function getAppSafe() {
  try {
    return getApp();
  } catch (err) {
    return null;
  }
}

function publish(patch) {
  const app = getAppSafe();
  if (!app) return;
  if (!app.globalData) app.globalData = {};
  const prev = app.globalData[STATE_KEY] || {};
  const next = {
    active: false,
    text: '',
    done: 0,
    total: 0,
    needRefresh: false,
    ...prev,
    ...(patch || {})
  };
  app.globalData[STATE_KEY] = next;
}

function readState() {
  const app = getAppSafe();
  return (app && app.globalData && app.globalData[STATE_KEY]) || {
    active: false,
    text: '',
    done: 0,
    total: 0,
    needRefresh: false
  };
}

function consumeNeedRefresh() {
  const state = readState();
  if (!state.needRefresh) return false;
  publish({ needRefresh: false });
  return true;
}

function extOf(filePath, fallback) {
  const name = String(filePath || '').split('?')[0];
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!ext || ext.length > 5 || ext === name.toLowerCase()) return fallback || 'jpg';
  return ext.replace(/[^a-z0-9]/g, '') || fallback || 'jpg';
}

function persistLocalFile(src, fallbackExt) {
  if (!src || isRemotePhoto(src) || !isLocalTempPath(src)) {
    return Promise.resolve(src || '');
  }
  const root = USER_DIR();
  if (!root) return Promise.resolve(src);
  if (String(src).indexOf(root) === 0) return Promise.resolve(src);

  const dest = `${root}/dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extOf(src, fallbackExt)}`;
  return new Promise((resolve) => {
    try {
      wx.getFileSystemManager().copyFile({
        srcPath: src,
        destPath: dest,
        success: () => {
          copiedFiles.push(dest);
          resolve(dest);
        },
        fail: () => resolve(src)
      });
    } catch (err) {
      resolve(src);
    }
  });
}

function cleanupCopiedFiles() {
  const fsm = wx.getFileSystemManager && wx.getFileSystemManager();
  const files = copiedFiles.slice();
  copiedFiles = [];
  files.forEach((path) => {
    try {
      fsm && fsm.unlink({ filePath: path, fail: () => {} });
    } catch (err) {
      // ignore
    }
  });
}

function persistMediaList(list) {
  return Promise.all((list || []).map((item) => {
    if (!item) return Promise.resolve(item);
    if (item.type === 'video') {
      return Promise.all([
        persistLocalFile(item.path, 'mp4'),
        persistLocalFile(item.thumb || '', 'jpg')
      ]).then(([path, thumb]) => ({
        ...item,
        path,
        thumb
      }));
    }
    return persistLocalFile(item.path, 'jpg').then((path) => ({
      ...item,
      path,
      thumb: path
    }));
  }));
}

function toast(title, icon) {
  wx.showToast({
    title: title || '',
    icon: icon || 'none',
    duration: icon === 'success' ? 1800 : 2500
  });
}

function submitLogs(job, cloudImages, cloudVideos, cloudVideoCovers) {
  const app = getAppSafe();
  if (!app) return Promise.reject(new Error('应用未就绪'));
  const videoList = cloudVideos || [];
  const coverList = cloudVideoCovers || [];

  if (job.editMode) {
    const order = job.selectedOrders[0];
    return app.updateDailyLog({
      id: job.editLogId,
      log_id: job.editLogId,
      orderId: order.id,
      petName: order.petName,
      checks: job.checks,
      description: job.desc,
      images: cloudImages,
      videos: videoList,
      videoCovers: coverList,
      video: videoList[0] || '',
      videoCover: coverList[0] || '',
      notifyOwner: true,
      isAbnormal: false,
      time: job.time,
      scheduledAt: job.scheduledAt,
      isScheduled: true,
      status: 'scheduled'
    }).then((res) => [res]);
  }

  return Promise.all(job.selectedOrders.map((order) => {
    const payload = {
      orderId: order.id,
      petName: order.petName,
      checks: job.checks,
      description: job.desc,
      images: cloudImages,
      videos: videoList,
      videoCovers: coverList,
      video: videoList[0] || '',
      videoCover: coverList[0] || '',
      notifyOwner: true,
      isAbnormal: false,
      time: job.time
    };
    if (job.isScheduled) {
      payload.scheduledAt = job.scheduledAt;
      payload.isScheduled = true;
      payload.status = 'scheduled';
    }
    return app.saveDailyLog(payload);
  }));
}

function resolveVideoItem(job, item) {
  const task = job.compressTasks && item && item.id ? job.compressTasks[item.id] : null;
  const wait = task ? Promise.resolve(task).catch(() => null) : Promise.resolve(null);
  return wait.then((ready) => {
    if (ready && ready.removed) {
      return Promise.reject(new Error(dailyMedia.VIDEO_TOO_LARGE_MSG));
    }
    const latest = (ready && ready.path) ? ready : item;
    return persistLocalFile(latest.path, 'mp4').then((path) => ({
      path,
      thumb: latest.thumb || item.thumb || '',
      skipCompress: !!latest.compressed
    }));
  });
}

function runJob(job) {
  const app = getAppSafe();
  const totalVideos = (job.mediaList || []).filter((item) => item && item.type === 'video').length;
  publish({
    active: true,
    text: totalVideos ? `正在上传 0/${totalVideos}` : '正在后台上传打卡',
    done: 0,
    total: totalVideos,
    needRefresh: false
  });

  const persist = persistMediaList(job.mediaList || []).then((mediaList) => {
    job.mediaList = mediaList;
    return mediaList;
  });

  const uploadPromise = persist.then((mediaList) => {
    const videoItems = mediaList.filter((item) => item.type === 'video');
    const imageItems = mediaList.filter((item) => item.type === 'image');
    if (app && app.isMerchantDemoMode && app.isMerchantDemoMode()) {
      return Promise.all(videoItems.map((item) => resolveVideoItem(job, item).catch(() => item)))
        .then(() => ({
          images: imageItems.map((item) => item.path).filter(Boolean),
          videos: videoItems.map((item) => item.path).filter(Boolean),
          videoCovers: videoItems.map((item) => item.thumb || ''),
          video: (videoItems[0] && videoItems[0].path) || '',
          videoCover: (videoItems[0] && videoItems[0].thumb) || ''
        }));
    }

    return dailyMedia.uploadDailyMedia(
      imageItems.map((item) => item.path),
      videoItems.map((item) => item.path),
      job.storeId,
      job.uploadOrderId,
      videoItems.map((item) => item.thumb || ''),
      {
        skipCompressFlags: videoItems.map((item) => !!item.compressed),
        prepareItem: (index) => resolveVideoItem(job, videoItems[index]),
        onProgress: ({ done, total }) => {
          publish({
            active: true,
            text: total > 0 ? `正在上传 ${done}/${total}` : '正在后台上传打卡',
            done,
            total
          });
        }
      }
    );
  });

  return uploadPromise
    .then(({ images, videos, videoCovers }) => submitLogs(job, images, videos, videoCovers))
    .then(() => {
      publish({ active: false, text: '', done: 0, total: 0, needRefresh: true });
      if (job.editMode) {
        toast(`已保存 ${job.time}`, 'success');
        return;
      }
      if (job.isScheduled) {
        toast(`已定时 ${job.time}`, 'success');
        return;
      }
      const count = (job.selectedOrders || []).length;
      toast(count > 1 ? `已为${count}只宠物打卡` : '打卡成功', 'success');
    })
    .catch((err) => {
      publish({ active: false, text: '', done: 0, total: 0, needRefresh: false });
      const message = (err && (err.message || err.errMsg))
        || (job.editMode ? '保存失败' : (job.isScheduled ? '定时失败' : '打卡失败'));
      toast(message, 'none');
    })
    .finally(() => {
      cleanupCopiedFiles();
    });
}

function pump() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  Promise.resolve()
    .then(() => runJob(job))
    .then(() => {
      running = false;
      pump();
    }, () => {
      running = false;
      pump();
    });
}

function enqueue(job) {
  queue.push(job);
  publish({
    active: true,
    text: '正在后台上传打卡',
    done: 0,
    total: (job.mediaList || []).filter((item) => item && item.type === 'video').length,
    needRefresh: false
  });
  pump();
}

function isBusy() {
  return running || queue.length > 0;
}

module.exports = {
  enqueue,
  isBusy,
  readState,
  consumeNeedRefresh
};
