import { State } from './engine.js';

// ── Format helpers ────────────────────────────────────────────────────────────

function pad2(n) { return String(Math.floor(n)).padStart(2, '0'); }
function pad3(n) { return String(Math.floor(n)).padStart(3, '0'); }

export function fmtTotal(ms) {
  ms = Math.max(0, ms);
  const h   = Math.floor(ms / 3_600_000);
  const m   = Math.floor((ms % 3_600_000) / 60_000);
  const s   = Math.floor((ms % 60_000) / 1_000);
  const ms3 = Math.floor(ms % 1_000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms3)}`;
}

export function fmtCountdown(ms) {
  ms = Math.max(0, ms);
  const m   = Math.floor(ms / 60_000);
  const s   = Math.floor((ms % 60_000) / 1_000);
  const ms3 = Math.floor(ms % 1_000);
  return `${pad2(m)}:${pad2(s)}.${pad3(ms3)}`;
}

// ── State meta ────────────────────────────────────────────────────────────────

const STATE_NAMES = {
  [State.Prepare]:   '準備',
  [State.Exercise]:  '訓練期',
  [State.Rest]:      '恢復期',
  [State.RoundRest]: '輪間休息',
  [State.Paused]:    '暫停',
  [State.End]:       '結束',
};

// ── Launch view ───────────────────────────────────────────────────────────────

export function renderExerciseTable(exercises, exerciseSeconds) {
  const tbody = document.getElementById('tbodyExercises');
  tbody.innerHTML = '';
  exercises.forEach((ex, i) => {
    const reps = (ex.aps * exerciseSeconds).toFixed(2);
    const tr   = document.createElement('tr');
    tr.dataset.index = i;
    tr.innerHTML = `
      <td><input type="checkbox" ${ex.enable ? 'checked' : ''}></td>
      <td class="col-name">${esc(ex.name)}</td>
      <td class="col-num">${ex.aps.toFixed(2)}</td>
      <td class="col-num col-reps">${reps}</td>
      <td class="col-num">${ex.met.toFixed(2)}</td>
      <td class="col-desc">${esc(ex.description || '')}</td>
      <td class="col-ops">
        <button class="btn-edit" data-idx="${i}">✏</button>
        <button class="btn-delete" data-idx="${i}">🗑</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

export function refreshRepsCells(exercises, exerciseSeconds) {
  document.querySelectorAll('#tbodyExercises .col-reps').forEach((cell, i) => {
    const aps = exercises[i]?.aps ?? 0;
    cell.textContent = (aps * exerciseSeconds).toFixed(2);
  });
}

export function setParamFields(training) {
  _val('txtExerciseSeconds',   training.exercise_seconds);
  _val('txtRestSeconds',       training.rest_seconds);
  _val('txtRounds',            training.rounds);
  _val('txtRoundRestSeconds',  training.round_rest_seconds);
  _val('txtPrepareSeconds',    training.prepare_seconds);
}

export function getParamValues() {
  return {
    exercise_seconds:   _num('txtExerciseSeconds'),
    rest_seconds:       _num('txtRestSeconds'),
    rounds:             Math.round(_num('txtRounds')),
    round_rest_seconds: _num('txtRoundRestSeconds'),
    prepare_seconds:    _num('txtPrepareSeconds'),
  };
}

export function getCheckboxStates() {
  return [...document.querySelectorAll('#tbodyExercises input[type=checkbox]')]
    .map(cb => cb.checked);
}

export function showSaveLocalBtn(visible) {
  document.getElementById('btnSaveLocal').classList.toggle('hidden', !visible);
}

export function populateCourseSelect(names, selected) {
  const sel = document.getElementById('selCourse');
  sel.innerHTML = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (selected) sel.value = selected;
}

// ── Training view ─────────────────────────────────────────────────────────────

export function updateTrainingDisplay(engine, totalMs, phaseElapsedMs, isLeft) {
  const st = engine.state;

  // Background state
  document.body.dataset.state = st;

  // Top bar
  document.getElementById('lblTotalTime').textContent = '總計時  ' + fmtTotal(totalMs);
  document.getElementById('lblStateName').textContent  = STATE_NAMES[st] ?? st;

  // Countdown
  const remaining = Math.max(0, engine.phaseDurationMs - phaseElapsedMs);
  document.getElementById('lblCountdown').textContent = fmtCountdown(remaining);

  // Action name & description
  const isRestPhase = st === State.Rest || st === State.RoundRest;
  const lblName  = document.getElementById('lblActionName');
  const lblDesc  = document.getElementById('lblDescription');

  if (isRestPhase) {
    lblName.textContent = '▶ ' + engine.nextExercise.name;
    lblName.className   = 'action-name big';
    lblDesc.className   = 'action-desc hidden';
  } else if (st === State.Prepare) {
    lblName.textContent = '▶ ' + engine.currentExercise.name;
    lblName.className   = 'action-name big';
    const desc = engine.currentExercise.description;
    if (desc) {
      lblDesc.textContent = desc;
      lblDesc.className   = 'action-desc';
    } else {
      lblDesc.className = 'action-desc hidden';
    }
  } else {
    lblName.textContent = engine.currentExercise.name;
    lblName.className   = 'action-name small';
    lblDesc.className   = 'action-desc hidden';
  }

  // Round & set counters
  const lblRound = document.getElementById('lblRound');
  const lblSet   = document.getElementById('lblSet');
  const bigRound = st === State.RoundRest;

  lblRound.textContent  = `(${engine.displayRound}/${engine.totalRounds})`;
  lblRound.className    = bigRound ? 'round-count big' : 'round-count';
  lblSet.textContent    = `(${engine.displaySet}/${engine.totalSetsPerRound})`;
  lblSet.className      = bigRound ? 'set-count small' : 'set-count';

  // APS
  const apsText = isRestPhase
    ? `${engine.currentExercise.aps.toFixed(2)}/s  →  ${engine.nextExercise.aps.toFixed(2)}/s`
    : `${engine.currentExercise.aps.toFixed(2)}/s`;
  document.getElementById('lblAps').textContent = apsText;

  // Metronome dots
  const active = st !== State.Paused && st !== State.End;
  document.getElementById('dotLeft') .classList.toggle('lit', active &&  isLeft);
  document.getElementById('dotRight').classList.toggle('lit', active && !isLeft);
}

export function showPauseOverlay()  { document.getElementById('pauseOverlay').classList.remove('hidden'); }
export function hidePauseOverlay()  { document.getElementById('pauseOverlay').classList.add('hidden'); }

// ── Summary view ──────────────────────────────────────────────────────────────

export function renderSummary(session) {
  const done = session.is_completed;
  const statusText  = done ? '✓ 完整完成' : '⚠ 提前結束';
  const statusColor = done ? '#2a7a2a' : '#c0392b';

  const dur = _formatDur(session.duration_ms);

  let exHtml = '';
  for (const ex of (session.exercises ?? [])) {
    exHtml += `<div class="sum-ex">${esc(ex.name)}  ${ex.aps.toFixed(2)}/s  MET:${ex.met.toFixed(1)}</div>`;
  }

  document.getElementById('summaryContent').innerHTML = `
    <div class="sum-row">開始：${esc(session.start_time)}</div>
    <div class="sum-row">結束：${esc(session.end_time)}</div>
    <div class="sum-row">時長：${dur}</div>
    <hr>
    <div class="sum-row">輪數：${session.rounds_done} / ${session.rounds_planned}</div>
    <div class="sum-row" style="color:${statusColor};font-weight:bold;">
      組數：${session.sets_done} / ${session.sets_planned} &nbsp; ${statusText}
    </div>
    <hr>
    <div class="sum-label">執行動作：</div>
    ${exHtml}
    <div class="sum-note">※ MET 值僅供強度參考</div>`;
}

// ── Edit modal ────────────────────────────────────────────────────────────────

export function openEditModal(exercise, exerciseSeconds) {
  return new Promise((resolve) => {
    const dialog  = document.getElementById('editModal');
    const txtName = document.getElementById('editName');
    const txtDesc = document.getElementById('editDesc');
    const txtAps  = document.getElementById('editAps');
    const txtReps = document.getElementById('editReps');
    const txtMet  = document.getElementById('editMet');
    const lblInfo = document.getElementById('editRepsInfo');

    txtName.value = exercise.name        ?? '';
    txtDesc.value = exercise.description ?? '';
    txtAps.value  = exercise.aps.toFixed(4);
    txtReps.value = (exercise.aps * exerciseSeconds).toFixed(2);
    txtMet.value  = exercise.met.toFixed(4);
    _updateRepsInfo(lblInfo, txtReps.value, exerciseSeconds);

    let inApsMode = true;
    _setApsMode(txtAps, txtReps, inApsMode);

    function onApsChange() {
      if (!inApsMode) return;
      const aps = parseFloat(txtAps.value);
      if (!isNaN(aps) && aps >= 0)
        txtReps.value = (aps * exerciseSeconds).toFixed(2);
      _updateRepsInfo(lblInfo, txtReps.value, exerciseSeconds);
    }

    function onRepsChange() {
      if (inApsMode) return;
      const reps = parseFloat(txtReps.value);
      if (!isNaN(reps) && reps >= 0 && exerciseSeconds > 0)
        txtAps.value = (reps / exerciseSeconds).toFixed(4);
      _updateRepsInfo(lblInfo, txtReps.value, exerciseSeconds);
    }

    function switchToAps()  { if (!inApsMode) { inApsMode = true;  _setApsMode(txtAps, txtReps, true);  } }
    function switchToReps() { if (inApsMode)  { inApsMode = false; _setApsMode(txtAps, txtReps, false); } }

    txtAps.addEventListener('input',  onApsChange);
    txtReps.addEventListener('input', onRepsChange);
    txtAps.addEventListener('focus',  switchToAps);
    txtReps.addEventListener('focus', switchToReps);

    function cleanup() {
      txtAps.removeEventListener('input',  onApsChange);
      txtReps.removeEventListener('input', onRepsChange);
      txtAps.removeEventListener('focus',  switchToAps);
      txtReps.removeEventListener('focus', switchToReps);
      document.getElementById('editOk').removeEventListener('click', onOk);
      document.getElementById('editCancel').removeEventListener('click', onCancel);
    }

    function onOk() {
      const name = txtName.value.trim();
      const aps  = parseFloat(txtAps.value);
      const met  = parseFloat(txtMet.value);
      if (!name) { alert('名稱不能為空'); return; }
      if (isNaN(aps) || aps < 0) { alert('APS 請輸入有效數值（≥ 0）'); return; }
      if (isNaN(met) || met < 0) { alert('MET 請輸入有效數值（≥ 0）'); return; }
      cleanup();
      dialog.close();
      resolve({ name, description: txtDesc.value, aps, met });
    }

    function onCancel() {
      cleanup();
      dialog.close();
      resolve(null);
    }

    document.getElementById('editOk').addEventListener('click', onOk);
    document.getElementById('editCancel').addEventListener('click', onCancel);

    dialog.showModal();
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _val(id, v) { document.getElementById(id).value = v; }
function _num(id)    { return parseFloat(document.getElementById(id).value) || 0; }

function _formatDur(ms) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function _updateRepsInfo(lbl, repsVal, secs) {
  const c = parseFloat(repsVal);
  lbl.textContent = isNaN(c) ? '' : `在 ${secs}s 之間，運動 ${c.toFixed(2)} 次`;
}

function _setApsMode(txtAps, txtReps, apsMode) {
  txtAps.readOnly  = !apsMode;
  txtReps.readOnly = apsMode;
  txtAps.style.background  = apsMode  ? '' : '#eee';
  txtReps.style.background = !apsMode ? '' : '#eee';
}
