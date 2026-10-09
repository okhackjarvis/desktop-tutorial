'use strict';

const STORAGE_KEY = 'kintore-v1';
const DEFAULT_EXERCISES = [
  'ベンチプレス', 'スクワット', 'デッドリフト', 'ショルダープレス',
  'ラットプルダウン', 'ベントオーバーロウ', 'アームカール', 'レッグプレス',
];

// ---------- データ ----------
// state = { exercises: string[], workouts: { 'YYYY-MM-DD': [{ exercise, weight, reps }] }, settings: { rest } }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* 保存領域が使えないときは初期状態で動かす */ }
  return normalize({});
}

function normalize(s) {
  return {
    exercises: Array.isArray(s.exercises) && s.exercises.length ? s.exercises : [...DEFAULT_EXERCISES],
    workouts: s.workouts && typeof s.workouts === 'object' ? s.workouts : {},
    settings: { rest: 90, ...(s.settings || {}) },
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('保存できませんでした。ブラウザの設定を確認してください。');
  }
}

let state = loadState();

// ---------- ユーティリティ ----------
const $ = (sel) => document.querySelector(sel);

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}（${wd}）`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

// Epley 式による推定1RM
const e1rm = (w, r) => (r === 1 ? w : w * (1 + r / 30));
const round1 = (n) => Math.round(n * 10) / 10;

// 種目ごとにセットをまとめる（入力順を保つ）
function groupByExercise(sets) {
  const groups = new Map();
  sets.forEach((s, i) => {
    if (!groups.has(s.exercise)) groups.set(s.exercise, []);
    groups.get(s.exercise).push({ ...s, index: i });
  });
  return groups;
}

// ---------- タブ ----------
document.querySelectorAll('.tabbar button').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

function showTab(name) {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  if (name === 'history') renderHistory();
  if (name === 'graph') renderGraph();
  if (name === 'settings') renderSettings();
}

// ---------- 記録 ----------
const dateInput = $('#log-date');
dateInput.value = today();
dateInput.addEventListener('change', renderLog);

function renderExerciseOptions() {
  for (const select of [$('#exercise-select'), $('#graph-exercise')]) {
    const current = select.value;
    select.replaceChildren(...state.exercises.map((name) => el('option', { value: name }, name)));
    if (state.exercises.includes(current)) select.value = current;
  }
}

// 種目を選んだら、前回の重量と回数を入れておく
$('#exercise-select').addEventListener('change', prefillFromLast);

function prefillFromLast() {
  const name = $('#exercise-select').value;
  const dates = Object.keys(state.workouts).sort().reverse();
  for (const d of dates) {
    const sets = state.workouts[d].filter((s) => s.exercise === name);
    if (sets.length) {
      const last = sets[sets.length - 1];
      $('#weight').value = last.weight;
      $('#reps').value = last.reps;
      return;
    }
  }
  $('#weight').value = '';
  $('#reps').value = '';
}

$('#add-set-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const weight = parseFloat($('#weight').value);
  const reps = parseInt($('#reps').value, 10);
  if (!(weight >= 0) || !(reps >= 1)) return;
  const date = dateInput.value || today();
  (state.workouts[date] ||= []).push({ exercise: $('#exercise-select').value, weight, reps });
  save();
  renderLog();
  startTimer();
});

function deleteSet(date, index) {
  state.workouts[date].splice(index, 1);
  if (!state.workouts[date].length) delete state.workouts[date];
  save();
  renderLog();
}

function renderLog() {
  const date = dateInput.value || today();
  const sets = state.workouts[date] || [];
  const container = $('#day-log');
  if (!sets.length) {
    container.replaceChildren(el('p', { class: 'empty' }, 'この日の記録はまだありません'));
    return;
  }
  const blocks = [];
  for (const [name, list] of groupByExercise(sets)) {
    blocks.push(el('div', { class: 'card exercise-block' },
      el('h3', {}, name),
      el('ul', { class: 'sets' }, ...list.map((s, n) =>
        el('li', {},
          el('span', {}, `${n + 1}セット目　${s.weight} kg × ${s.reps} 回`),
          el('button', { class: 'small danger', type: 'button', 'aria-label': '削除', onclick: () => deleteSet(date, s.index) }, '削除'),
        ),
      )),
    ));
  }
  container.replaceChildren(...blocks);
}

// ---------- 休憩タイマー ----------
let timerId = null;

function startTimer() {
  stopTimer();
  const total = Number(state.settings.rest) || 0;
  if (total <= 0) return;
  const endAt = Date.now() + total * 1000;
  const box = $('#timer');
  box.classList.remove('hidden', 'done');
  const tick = () => {
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    $('#timer-display').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left === 0) {
      clearInterval(timerId);
      timerId = null;
      box.classList.add('done');
      $('#timer-display').textContent = '次のセットへ';
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  };
  tick();
  timerId = setInterval(tick, 250);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  $('#timer').classList.add('hidden');
}

$('#timer-stop').addEventListener('click', stopTimer);

// ---------- 履歴 ----------
function renderHistory() {
  const dates = Object.keys(state.workouts).sort().reverse();
  const container = $('#history-list');
  if (!dates.length) {
    container.replaceChildren(el('p', { class: 'empty' }, 'まだ記録がありません'));
    return;
  }
  container.replaceChildren(...dates.map((d) => {
    const groups = groupByExercise(state.workouts[d]);
    const summary = [...groups].map(([name, list]) => `${name} ${list.length}セット`).join('・');
    return el('div', {
      class: 'card history-day',
      onclick: () => { dateInput.value = d; renderLog(); showTab('log'); },
    },
      el('div', { class: 'date' }, formatDate(d)),
      el('div', { class: 'summary' }, summary),
    );
  }));
}

// ---------- グラフ ----------
let metric = 'max';
const METRIC_LABEL = { max: '最大重量 (kg)', e1rm: '推定1RM (kg)', volume: '総挙上量 (kg)' };

document.querySelectorAll('.segmented button').forEach((btn) => {
  btn.addEventListener('click', () => {
    metric = btn.dataset.metric;
    document.querySelectorAll('.segmented button').forEach((b) => b.classList.toggle('on', b === btn));
    renderGraph();
  });
});
$('#graph-exercise').addEventListener('change', renderGraph);

function graphPoints(name) {
  return Object.keys(state.workouts).sort().flatMap((d) => {
    const sets = state.workouts[d].filter((s) => s.exercise === name);
    if (!sets.length) return [];
    let value;
    if (metric === 'max') value = Math.max(...sets.map((s) => s.weight));
    else if (metric === 'e1rm') value = Math.max(...sets.map((s) => e1rm(s.weight, s.reps)));
    else value = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return [{ date: d, value: round1(value) }];
  });
}

function renderGraph() {
  const container = $('#graph');
  const points = graphPoints($('#graph-exercise').value);
  if (!points.length) {
    container.replaceChildren(el('p', { class: 'empty' }, 'この種目の記録はまだありません'));
    return;
  }

  const W = 340, H = 220, padL = 44, padR = 12, padT = 16, padB = 28;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { lo -= 5; hi += 5; }
  const span = hi - lo;
  lo = Math.max(0, lo - span * 0.1);
  hi += span * 0.1;

  const x = (i) => points.length === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1);
  const y = (v) => padT + ((hi - v) * (H - padT - padB)) / (hi - lo);

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', METRIC_LABEL[metric]);
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    svg.append(n);
    return n;
  };

  // 目盛り（3本）
  for (let k = 0; k <= 2; k++) {
    const v = lo + ((hi - lo) * k) / 2;
    add('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(v), y2: y(v) });
    add('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(Math.round(v)));
  }

  add('polyline', { class: 'line', points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ') });
  points.forEach((p, i) => {
    const dot = add('circle', { class: 'dot', cx: x(i), cy: y(p.value), r: 4 });
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${formatDate(p.date)}  ${p.value} kg`;
    dot.append(title);
  });

  // 最初と最後の日付
  const short = (iso) => iso.slice(5).replace('-', '/');
  add('text', { x: x(0), y: H - 8, 'text-anchor': points.length === 1 ? 'middle' : 'start' }, short(points[0].date));
  if (points.length > 1) {
    add('text', { x: x(points.length - 1), y: H - 8, 'text-anchor': 'end' }, short(points[points.length - 1].date));
  }

  const first = points[0].value, last = points[points.length - 1].value;
  const diff = round1(last - first);
  const caption = el('p', { class: 'hint' },
    `${METRIC_LABEL[metric]}：最新 ${last}（最初から ${diff >= 0 ? '+' : ''}${diff}）`);
  container.replaceChildren(caption, svg);
}

// ---------- 設定 ----------
function renderSettings() {
  $('#rest-seconds').value = state.settings.rest;
  $('#exercise-list').replaceChildren(...state.exercises.map((name) =>
    el('li', {},
      el('span', {}, name),
      el('button', { class: 'small danger', type: 'button', onclick: () => removeExercise(name) }, '削除'),
    ),
  ));
}

function removeExercise(name) {
  if (state.exercises.length <= 1) return;
  if (!confirm(`「${name}」を種目リストから外しますか？（これまでの記録は残ります）`)) return;
  state.exercises = state.exercises.filter((n) => n !== name);
  save();
  renderExerciseOptions();
  renderSettings();
}

$('#add-exercise-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#new-exercise').value.trim();
  if (!name || state.exercises.includes(name)) return;
  state.exercises.push(name);
  $('#new-exercise').value = '';
  save();
  renderExerciseOptions();
  renderSettings();
});

$('#rest-seconds').addEventListener('change', (e) => {
  state.settings.rest = Math.max(0, parseInt(e.target.value, 10) || 0);
  save();
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `kintore-${today()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.workouts !== 'object') throw new Error('invalid');
    if (!confirm('今のデータを読み込んだデータで置き換えます。よろしいですか？')) return;
    state = normalize(data);
    save();
    renderExerciseOptions();
    renderSettings();
    renderLog();
    alert('読み込みました');
  } catch {
    alert('ファイルを読み込めませんでした');
  } finally {
    e.target.value = '';
  }
});

// ---------- 起動 ----------
renderExerciseOptions();
prefillFromLast();
renderLog();
