const assert = require('node:assert/strict');
const Module = require('node:module');

const origRequire = Module.prototype.require;
Module.prototype.require = function mockRequire(id) {
  if (id === 'dotenv') {
    return { config() { return {}; } };
  }
  return origRequire.apply(this, arguments);
};

const oss = require('../src/oss');
const config = require('../src/config');

async function main() {
  const videoUrl = `${config.media.publicBaseUrl.replace(/\/$/, '')}/daily/store/order/clip.mp4`;
  const storedCover = `${config.media.publicBaseUrl.replace(/\/$/, '')}/daily/store/order/thumb.jpg`;

  const withStored = await oss.resolveVideoCoverUrl(videoUrl, storedCover);
  assert.equal(withStored, storedCover);

  const started = Date.now();
  const missing = await oss.resolveVideoCoverUrl(videoUrl, '');
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1000, `resolveVideoCoverUrl 不应同步等 ffmpeg，实际 ${elapsed}ms`);
  assert.equal(missing, `${config.media.publicBaseUrl.replace(/\/$/, '')}/daily/store/order/clip_cover.jpg`);

  console.log('daily-cover-timeout.test.js ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
