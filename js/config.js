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

// ── Default plan ──────────────────────────────────────────────────────────────

export const DEFAULT_PLAN = {
  training: {
    exercise_seconds:   20,
    rest_seconds:       10,
    rounds:              1,
    round_rest_seconds: 60,
    prepare_seconds:     5,
  },
  exercises: [
    { name: '開合跳',           description: '雙腳左右開合跳，手臂同步上舉',          aps: 1.50, met:  8.0, enable: true },
    { name: '深蹲',             description: '標準深蹲，膝蓋不超過腳尖',              aps: 0.55, met:  5.0, enable: true },
    { name: '分腿蹲(左右)',     description: '左右交替分腿蹲',                        aps: 0.50, met:  5.5, enable: true },
    { name: '前後開合跳',       description: '前後方向開合跳',                        aps: 1.45, met:  8.0, enable: true },
    { name: '站姿手肘碰膝(左)', description: '站姿，右手肘碰左膝',                    aps: 0.65, met:  4.0, enable: true },
    { name: '站姿手肘碰膝(右)', description: '站姿，左手肘碰右膝',                    aps: 0.65, met:  4.0, enable: true },
    { name: '開合胯(左)',       description: '站姿左側抬腿外展',                      aps: 0.45, met:  3.5, enable: true },
    { name: '開合胯(右)',       description: '站姿右側抬腿外展',                      aps: 0.45, met:  3.5, enable: true },
    { name: '小碎步',           description: '原地高頻率小步跑',                      aps: 5.75, met:  9.0, enable: true },
    { name: '波比跳',           description: '全身爆發性跳躍，約2.5秒一下',           aps: 0.40, met: 11.0, enable: true },
    { name: '前跨步弓步蹲(左)', description: '左腳前跨步弓步蹲',                      aps: 0.55, met:  5.0, enable: true },
    { name: '前跨步弓步蹲(右)', description: '右腳前跨步弓步蹲',                      aps: 0.55, met:  5.0, enable: true },
    { name: '青蛙蹲',           description: '寬站距深蹲變化式',                      aps: 0.50, met:  5.5, enable: true },
    { name: '屈膝禮弓步(左)',   description: '左腳屈膝禮弓步 (Curtsy Lunge)',         aps: 0.50, met:  5.0, enable: true },
    { name: '屈膝禮弓步(右)',   description: '右腳屈膝禮弓步 (Curtsy Lunge)',         aps: 0.50, met:  5.0, enable: true },
  ],
};

// ── Deep clone ────────────────────────────────────────────────────────────────

export function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}
