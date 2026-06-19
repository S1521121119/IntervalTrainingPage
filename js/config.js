const KEY_PLAN     = 'itt_plan';
const KEY_TICK_VOL = 'itt_tick_volume';
const KEY_END_VOL  = 'itt_end_volume';

// ── localStorage ─────────────────────────────────────────────────────────────

export function saveLocal(plan, tickVol, endVol) {
  localStorage.setItem(KEY_PLAN,     JSON.stringify(plan));
  localStorage.setItem(KEY_TICK_VOL, String(tickVol));
  localStorage.setItem(KEY_END_VOL,  String(endVol));
}

export function loadLocal() {
  const raw = localStorage.getItem(KEY_PLAN);
  return {
    plan:    raw ? JSON.parse(raw) : null,
    tickVol: parseInt(localStorage.getItem(KEY_TICK_VOL) ?? '80',  10),
    endVol:  parseInt(localStorage.getItem(KEY_END_VOL)  ?? '100', 10),
  };
}

// ── File I/O ─────────────────────────────────────────────────────────────────

export function openPlanFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      if (!input.files.length) return;
      try {
        const text = await input.files[0].text();
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export function savePlanFile(plan, filename = 'my_plan.json') {
  _download(JSON.stringify(plan, null, 2), filename, 'application/json');
}

export function saveSummaryFile(session) {
  const ts   = session.start_time.replace(/[: ]/g, '-');
  const name = `training_${ts}.json`;
  _download(JSON.stringify(session, null, 2), name, 'application/json');
}

function _download(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Deep clone ────────────────────────────────────────────────────────────────

export function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}
