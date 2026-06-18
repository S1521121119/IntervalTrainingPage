const LOOKAHEAD_MS   = 25;   // scheduler wakeup interval (ms)
const SCHEDULE_AHEAD = 0.1;  // how far ahead to schedule beats (sec)

export class MetronomeScheduler {
  constructor(audioCtx, sound) {
    this._ctx   = audioCtx;
    this._sound = sound;

    this.currentAps  = 1.0;
    this._nextBeatTime = 0;
    this._nextIsLeft   = false; // which side the NEXT scheduled beat plays
    this._lastIsLeft   = true;  // visual: which side is currently lit (after last fired beat)
    this._pending      = [];    // [{time, isLeft}] sorted ascending
    this._timerId      = null;
    this._running      = false;
  }

  // Visual state – read every rAF to update metronome dots
  get isLeft() {
    const now = this._ctx.currentTime;
    let state = this._lastIsLeft;
    for (const b of this._pending) {
      if (b.time <= now) state = b.isLeft;
      else break;
    }
    return state;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  start(aps, startLeft = true) {
    this.stop();
    this._pending      = [];
    this.currentAps    = Math.max(0.05, aps);
    this._lastIsLeft   = startLeft;
    this._nextIsLeft   = !startLeft; // first beat toggles to the other side (matches C# behavior)
    this._nextBeatTime = this._ctx.currentTime + 0.05;
    this._running      = true;
    this._tick();
  }

  stop() {
    this._running = false;
    clearTimeout(this._timerId);
    this._pending = [];
  }

  setAps(aps) {
    this.currentAps = Math.max(0.05, aps);
  }

  // Equivalent of C# Reset() — restart with new APS and side
  reset(aps, startLeft = true) { this.start(aps, startLeft); }

  pause()        { this.stop(); }
  resume(aps)    { this.reset(aps); }

  // ── Scheduler loop ───────────────────────────────────────────────────────

  _tick() {
    if (!this._running) return;

    const now = this._ctx.currentTime;

    // Promote fired beats to _lastIsLeft, clean up pending list
    let i = 0;
    while (i < this._pending.length && this._pending[i].time <= now) {
      this._lastIsLeft = this._pending[i].isLeft;
      i++;
    }
    if (i > 0) this._pending.splice(0, i);

    // Schedule beats inside the lookahead window
    while (this._nextBeatTime < now + SCHEDULE_AHEAD) {
      const isLeft = this._nextIsLeft;
      this._sound.scheduleBeat(this._nextBeatTime, isLeft);
      this._pending.push({ time: this._nextBeatTime, isLeft });

      const interval = 1.0 / (this.currentAps * 2);
      this._nextBeatTime += interval;
      this._nextIsLeft = !isLeft;
    }

    this._timerId = setTimeout(() => this._tick(), LOOKAHEAD_MS);
  }
}

// ── APS easing helper (same formula as C# MetronomeController) ────────────

export function calculateRestAps(elapsedMs, totalMs, fromAps, toAps) {
  if (totalMs <= 0) return toAps;
  const t = Math.min(elapsedMs / totalMs, 1.0);
  const eased = toAps > fromAps
    ? t * t * t                      // 慢→快：ease-in cubic
    : 1.0 - Math.pow(1.0 - t, 3);   // 快→慢：ease-out cubic
  return fromAps + (toAps - fromAps) * eased;
}
