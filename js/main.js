import { State, IntervalTrainingEngine } from './engine.js';
import { MetronomeScheduler, calculateRestAps } from './metronome.js';
import { SoundPlayer } from './sound.js';
import { loadLocal, saveLocal, openPlanFile, savePlanFile, saveSummaryFile, DEFAULT_PLAN, clonePlan } from './config.js';
import {
  renderExerciseTable, refreshRepsCells, setParamFields, getParamValues,
  getCheckboxStates, showSaveLocalBtn,
  updateTrainingDisplay, showPauseOverlay, hidePauseOverlay,
  renderSummary, openEditModal,
} from './ui.js';
import { requestWakeLock, releaseWakeLock } from './wakelock.js';

// ── App state ─────────────────────────────────────────────────────────────────

let workingPlan  = null;  // live-edited copy
let originalPlan = null;  // snapshot from last save (dirty check)
let tickVol = 80, endVol = 100;

// Training runtime
let audioCtx = null;
let sound    = null;
let metro    = null;
let engine   = null;

// Timing
// trainingStartPerf / phaseStartPerf are shifted forward by pause durations
// so `now - trainingStartPerf` and `now - phaseStartPerf` are always "active time"
let trainingStartPerf = 0;
let phaseStartPerf    = 0;
let pauseStartPerf    = 0;
let sessionStartDate  = null;  // wall-clock Date when training began

let rafId       = null;
let earlyStop   = false;
let lastSession = null;

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const stored = loadLocal();
  tickVol = stored.tickVol;
  endVol  = stored.endVol;

  workingPlan  = clonePlan(stored.plan ?? DEFAULT_PLAN);
  originalPlan = clonePlan(workingPlan);

  applyPlanToLaunchUI();
  document.getElementById('sldTickVolume').value = tickVol;
  document.getElementById('sldEndVolume').value  = endVol;
  showSaveLocalBtn(false);

  wireEvents();
  showView('launch');
});

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireEvents() {
  document.getElementById('btnOpen').addEventListener('click', onOpenPlan);
  document.getElementById('btnSavePlan').addEventListener('click', onSavePlanFile);
  document.getElementById('btnSaveLocal').addEventListener('click', onSaveLocal);
  document.getElementById('btnStart').addEventListener('click', onStartTraining);
  document.getElementById('btnAddExercise').addEventListener('click', onAddExercise);

  ['txtExerciseSeconds','txtRestSeconds','txtRounds','txtRoundRestSeconds','txtPrepareSeconds']
    .forEach(id => document.getElementById(id).addEventListener('input', onParamChanged));

  document.getElementById('tbodyExercises').addEventListener('click',  onTableClick);
  document.getElementById('tbodyExercises').addEventListener('change', onTableCheckbox);

  document.getElementById('sldTickVolume').addEventListener('input', e => { tickVol = +e.target.value; });
  document.getElementById('sldEndVolume').addEventListener('input', e => { endVol  = +e.target.value; });

  document.getElementById('btnPause').addEventListener('click',       handleSpace);
  document.getElementById('btnResume').addEventListener('click',      handleResume);
  document.getElementById('btnEndTraining').addEventListener('click', handleEscapeEnd);
  document.getElementById('btnFullscreen').addEventListener('click',  toggleFullscreen);

  document.getElementById('btnDownloadSummary').addEventListener('click', () => {
    if (lastSession) saveSummaryFile(lastSession);
  });
  document.getElementById('btnBackToLaunch').addEventListener('click', () => showView('launch'));

  document.addEventListener('keydown', onKeyDown);

  // iOS releases the wake lock whenever the page goes to background (e.g. screen-off
  // via the side button, app switch); re-acquire it once the page is visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.body.dataset.view === 'training') {
      requestWakeLock();
    }
  });
}

// ── Launch view handlers ──────────────────────────────────────────────────────

async function onOpenPlan() {
  try {
    const plan = await openPlanFile();
    workingPlan  = clonePlan(plan);
    originalPlan = clonePlan(plan);
    applyPlanToLaunchUI();
    showSaveLocalBtn(false);
  } catch (e) {
    alert('無法開啟檔案：' + e.message);
  }
}

function onSavePlanFile() {
  applyUIToPlan();
  savePlanFile(workingPlan);
}

function onSaveLocal() {
  applyUIToPlan();
  saveLocal(workingPlan, tickVol, endVol);
  originalPlan = clonePlan(workingPlan);
  showSaveLocalBtn(false);
}

function onParamChanged() {
  const exSecs = parseFloat(document.getElementById('txtExerciseSeconds').value) || 20;
  refreshRepsCells(workingPlan.exercises, exSecs);
  checkDirty();
}

async function onTableClick(e) {
  const editBtn   = e.target.closest('.btn-edit');
  const deleteBtn = e.target.closest('.btn-delete');

  if (editBtn) {
    const idx    = parseInt(editBtn.dataset.idx, 10);
    const ex     = workingPlan.exercises[idx];
    const exSecs = parseFloat(document.getElementById('txtExerciseSeconds').value) || 20;
    const result = await openEditModal(ex, exSecs);
    if (result) {
      Object.assign(ex, result);
      refreshExerciseTable();
      checkDirty();
    }
  }

  if (deleteBtn) {
    const idx  = parseInt(deleteBtn.dataset.idx, 10);
    const name = workingPlan.exercises[idx].name;
    if (confirm(`確定刪除「${name}」？`)) {
      workingPlan.exercises.splice(idx, 1);
      refreshExerciseTable();
      checkDirty();
    }
  }
}

function onTableCheckbox() {
  syncCheckboxesToPlan();
  checkDirty();
}

async function onAddExercise() {
  const newEx = { name: '(新項目)', description: '', aps: 1.0, met: 5.0, enable: true };
  workingPlan.exercises.push(newEx);
  refreshExerciseTable();

  const exSecs = parseFloat(document.getElementById('txtExerciseSeconds').value) || 20;
  const result = await openEditModal(newEx, exSecs);
  if (result) {
    Object.assign(newEx, result);
  } else {
    workingPlan.exercises.pop();
  }
  refreshExerciseTable();
  checkDirty();
}

function onStartTraining() {
  applyUIToPlan();
  const enabled = workingPlan.exercises.filter(e => e.enable);
  if (enabled.length === 0) { alert('請至少啟用一個動作'); return; }
  if (workingPlan.training.exercise_seconds <= 0) { alert('運動秒數必須大於 0'); return; }
  if (workingPlan.training.rounds < 1)            { alert('輪數必須至少為 1');    return; }

  saveLocal(workingPlan, tickVol, endVol);
  originalPlan = clonePlan(workingPlan);
  showSaveLocalBtn(false);

  startTraining(workingPlan.training, enabled);
}

// ── Plan ↔ UI sync ────────────────────────────────────────────────────────────

function applyPlanToLaunchUI() {
  setParamFields(workingPlan.training);
  refreshExerciseTable();
}

function refreshExerciseTable() {
  const exSecs = parseFloat(document.getElementById('txtExerciseSeconds').value) || 20;
  renderExerciseTable(workingPlan.exercises, exSecs);
}

function applyUIToPlan() {
  Object.assign(workingPlan.training, getParamValues());
  syncCheckboxesToPlan();
}

function syncCheckboxesToPlan() {
  getCheckboxStates().forEach((checked, i) => {
    if (workingPlan.exercises[i]) workingPlan.exercises[i].enable = checked;
  });
}

function checkDirty() {
  syncCheckboxesToPlan();
  const current = clonePlan(workingPlan);
  Object.assign(current.training, getParamValues());
  showSaveLocalBtn(JSON.stringify(current) !== JSON.stringify(originalPlan));
}

// ── Training session ──────────────────────────────────────────────────────────

function startTraining(training, exercises) {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  sound     = new SoundPlayer(audioCtx, tickVol, endVol);
  metro     = new MetronomeScheduler(audioCtx, sound);
  engine    = new IntervalTrainingEngine(training, exercises);
  earlyStop = false;
  lastSession = null;

  engine.onStateChanged      = onStateChanged;
  engine.onTrainingCompleted = onTrainingCompleted;

  showView('training');
  hidePauseOverlay();

  sessionStartDate  = new Date();
  trainingStartPerf = performance.now();
  phaseStartPerf    = performance.now();

  engine.start();        // → onStateChanged(Prepare) → metro reset
  requestNextFrame();
  requestWakeLock();
}

// Called on every state change (genuine phase transitions AND pause/resume)
function onStateChanged(state) {
  document.body.dataset.state = state;
  if (state === State.Paused || state === State.End) return;

  // New phase started — reset phase timer
  phaseStartPerf = performance.now();

  switch (state) {
    case State.Prepare:
    case State.Rest:
    case State.RoundRest:
      metro.reset(engine.currentExercise.aps);
      break;
    case State.Exercise:
      // No metro reset — beat continues from REST/PREPARE seamlessly
      metro.setAps(engine.currentExercise.aps);
      break;
  }
}

function onTrainingCompleted() {
  metro.stop();
  releaseWakeLock();
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  const totalMs = performance.now() - trainingStartPerf;
  sound.playRoundEnd(); // second play (first was in playTransitionSound for last set)

  lastSession = buildSession(totalMs, !earlyStop);

  setTimeout(() => {
    renderSummary(lastSession);
    showView('summary');
  }, 700);
}

// ── rAF training loop ─────────────────────────────────────────────────────────

function requestNextFrame() {
  rafId = requestAnimationFrame(loop);
}

function loop(now) {
  const st = engine.state;
  if (st === State.Paused || st === State.End) { rafId = null; return; }

  const totalMs      = now - trainingStartPerf;
  const phaseElapsed = now - phaseStartPerf;

  // APS easing during rest phases
  if (st === State.Rest || st === State.RoundRest) {
    const aps = calculateRestAps(
      phaseElapsed, engine.phaseDurationMs,
      engine.currentExercise.aps, engine.nextExercise.aps);
    metro.setAps(aps);
  }

  // Phase completion
  if (phaseElapsed >= engine.phaseDurationMs) {
    playTransitionSound(st);
    engine.onPhaseComplete(); // may fire onStateChanged (resets phaseStartPerf) or onTrainingCompleted
  }

  updateTrainingDisplay(engine, totalMs, phaseElapsed, metro.isLeft);

  if (engine.state !== State.End && engine.state !== State.Paused) {
    rafId = requestAnimationFrame(loop);
  } else {
    rafId = null;
  }
}

function playTransitionSound(completedState) {
  if (completedState === State.Exercise) {
    engine.isLastSet ? sound.playRoundEnd() : sound.playEnd();
  } else if (completedState === State.Rest || completedState === State.Prepare) {
    sound.playStart();
  }
}

// ── Pause / resume / end ──────────────────────────────────────────────────────

function handleSpace() {
  if (!engine || engine.state === State.End) return;
  engine.state === State.Paused ? handleResume() : handlePause();
}

function handlePause() {
  pauseStartPerf = performance.now();
  engine.togglePause();     // → onStateChanged('paused') — does NOT reset phaseStartPerf (returns early)
  metro.pause();
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  showPauseOverlay();
}

function handleResume() {
  if (!engine || engine.state !== State.Paused) return;

  // Absorb pause into total training timer (phase timer is reset by onStateChanged below)
  trainingStartPerf += performance.now() - pauseStartPerf;

  // For Rest/Prepare/RoundRest: onStateChanged calls metro.reset() → auto-restarts metro
  // For Exercise: onStateChanged only calls metro.setAps() → metro stays stopped
  engine.togglePause(); // → onStateChanged(prevState), phaseStartPerf = now (C# behavior: phase resets)
  if (engine.state === State.Exercise) {
    metro.start(engine.currentExercise.aps);
  }

  hidePauseOverlay();
  requestNextFrame();
}

function handleEscapeEnd() {
  if (!engine || engine.state === State.End) return;
  earlyStop = true;

  if (engine.state === State.Paused) {
    // Add current pause duration before ending
    trainingStartPerf += performance.now() - pauseStartPerf;
    hidePauseOverlay();
  }

  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  engine.forceEnd(); // → onTrainingCompleted
}

// ── Session builder ───────────────────────────────────────────────────────────

function buildSession(totalMs, completed) {
  const end = new Date();
  return {
    start_time:     fmtDate(sessionStartDate),
    end_time:       fmtDate(end),
    duration_ms:    Math.round(totalMs),
    rounds_done:    engine.roundsCompleted,
    rounds_planned: engine.totalRounds,
    sets_done:      engine.setsCompleted,
    sets_planned:   engine.totalSetsPerRound * engine.totalRounds,
    is_completed:   completed,
    exercises:      engine._exercises.map(ex => ({ name: ex.name, aps: ex.aps, met: ex.met })),
  };
}

function fmtDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

function onKeyDown(e) {
  if (document.body.dataset.view !== 'training') return;
  if (e.code === 'Space') {
    e.preventDefault();
    handleSpace();
  } else if (e.code === 'Escape' && engine?.state === State.Paused) {
    handleEscapeEnd();
  } else if (e.code === 'F11') {
    e.preventDefault();
    toggleFullscreen();
  }
}

// ── Fullscreen ────────────────────────────────────────────────────────────────

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ── View switching ────────────────────────────────────────────────────────────

function showView(name) {
  document.body.dataset.view  = name;
  if (name !== 'training') document.body.dataset.state = '';
}
