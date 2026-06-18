import { NOSLEEP_WEBM, NOSLEEP_MP4 } from './nosleepmedia.js';

let wakeLock        = null;
let onStatus         = null;  // (active: boolean) => void
let releaseListener  = null;
let video            = null;

// The Wake Lock API can resolve successfully on iOS Safari yet the OS still
// auto-locks the screen in practice, so a silent looping video — the
// long-standing NoSleep.js trick — plays alongside it as a more reliable
// fallback (iOS has always special-cased active video playback to avoid sleep).
function getVideo() {
  if (video) return video;
  video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  Object.assign(video.style, {
    position: 'fixed', top: '0', left: '0',
    width: '1px', height: '1px', opacity: '0', pointerEvents: 'none',
  });

  const addSource = (type, src) => {
    const s = document.createElement('source');
    s.type = `video/${type}`;
    s.src   = src;
    video.appendChild(s);
  };
  addSource('webm', NOSLEEP_WEBM);
  addSource('mp4',  NOSLEEP_MP4);

  // Whichever source the browser picks, keep it looping: short clips can just
  // use the loop attribute, longer ones need a manual rewind to avoid a stall
  // at the loop boundary (the actual NoSleep.js workaround for iOS).
  video.addEventListener('loadedmetadata', () => {
    if (video.duration <= 1) {
      video.loop = true;
    } else {
      video.addEventListener('timeupdate', () => {
        if (video.currentTime > 0.5) video.currentTime = Math.random();
      });
    }
  });

  document.body.appendChild(video);
  return video;
}

export function setWakeLockStatusHandler(fn) {
  onStatus = fn;
}

export async function requestWakeLock() {
  getVideo().play().catch(() => {});

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
  video?.pause();
  if (!wakeLock) return;
  wakeLock.removeEventListener('release', releaseListener);
  try {
    await wakeLock.release();
  } catch { /* already released */ }
  wakeLock = null;
}
