let wakeLock        = null;
let onStatus         = null;  // (active: boolean) => void
let releaseListener  = null;

export function setWakeLockStatusHandler(fn) {
  onStatus = fn;
}

export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    onStatus?.(false);
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    onStatus?.(true);
    releaseListener = () => { wakeLock = null; onStatus?.(false); };
    wakeLock.addEventListener('release', releaseListener);
  } catch (err) {
    console.warn('Wake Lock 取得失敗:', err);
    onStatus?.(false);
  }
}

// Releasing on purpose (training ended) shouldn't trigger the "lost wake lock" warning,
// so the unexpected-release listener is detached first.
export async function releaseWakeLock() {
  if (!wakeLock) return;
  wakeLock.removeEventListener('release', releaseListener);
  try {
    await wakeLock.release();
  } catch { /* already released */ }
  wakeLock = null;
}
