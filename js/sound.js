export class SoundPlayer {
  constructor(audioCtx, tickVolume, endVolume) {
    this._ctx     = audioCtx;
    this._tickVol = tickVolume / 100;
    this._endVol  = endVolume  / 100;
  }

  // Called by MetronomeScheduler at scheduled beat time
  scheduleBeat(time, isLeft) {
    this._tone(isLeft ? 800 : 500, 0.050, this._tickVol, time);
  }

  playEnd() {
    this._sweep(440, 880, 0.300, this._endVol, this._now());
  }

  playRoundEnd() {
    const t = this._now();
    this._tone(261, 0.180, this._endVol, t);
    this._tone(329, 0.180, this._endVol, t + 0.180);
    this._tone(392, 0.240, this._endVol, t + 0.360);
  }

  playStart() {
    this._sweep(1200, 2400, 0.120, this._endVol, this._now());
  }

  // ── Private synthesis ────────────────────────────────────────────────────

  _now() { return this._ctx.currentTime + 0.01; }

  _tone(hz, dur, amp, startTime) {
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);

    osc.frequency.value = hz;
    this._envelope(gain.gain, amp, startTime, dur);
    osc.start(startTime);
    osc.stop(startTime + dur);
  }

  _sweep(hzFrom, hzTo, dur, amp, startTime) {
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.connect(gain);
    gain.connect(this._ctx.destination);

    osc.frequency.setValueAtTime(hzFrom, startTime);
    osc.frequency.linearRampToValueAtTime(hzTo, startTime + dur);
    this._envelope(gain.gain, amp, startTime, dur);
    osc.start(startTime);
    osc.stop(startTime + dur);
  }

  // 5ms attack, 10ms release
  _envelope(gainParam, amp, start, dur) {
    gainParam.setValueAtTime(0, start);
    gainParam.linearRampToValueAtTime(amp, start + 0.005);
    gainParam.setValueAtTime(amp, start + dur - 0.010);
    gainParam.linearRampToValueAtTime(0, start + dur);
  }
}
