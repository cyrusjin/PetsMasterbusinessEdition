const TAP_THRESHOLD = 10;
const TAP_RESET_MS = 2500;

let tapCount = 0;
let lastTapAt = 0;

function registerSecretTap(onUnlock) {
  const now = Date.now();
  if (!lastTapAt || now - lastTapAt > TAP_RESET_MS) {
    tapCount = 0;
  }
  lastTapAt = now;
  tapCount += 1;
  if (tapCount >= TAP_THRESHOLD) {
    tapCount = 0;
    if (typeof onUnlock === 'function') {
      onUnlock();
    }
  }
}

function openAdminEntryFromPage(page) {
  if (!page || typeof page.selectComponent !== 'function') return;
  const admin = page.selectComponent('#hiddenAdminEntry');
  if (admin && typeof admin.openPasswordModal === 'function') {
    admin.openPasswordModal();
  }
}

function handlePageSecretTap(page) {
  registerSecretTap(() => openAdminEntryFromPage(page));
}

module.exports = {
  TAP_THRESHOLD,
  registerSecretTap,
  openAdminEntryFromPage,
  handlePageSecretTap
};
