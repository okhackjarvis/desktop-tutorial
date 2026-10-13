import {
  MUSCLES, EQUIPMENT, DEFAULT_EXERCISES, GOALS, EXPERIENCE, REFS,
  today, addDays, round1, targetsFor, weakPoints, suggestExercises, exerciseHistory,
  stagnation, intensityCheck, weightAdvice, proteinTarget, cycleDay, setPlan, restFor, workSets,
  e1rm, LEGACY_EXERCISES, SPLITS, MENU_STYLES, buildMenu,
} from './science.js';
import { icon, hydrateIcons, LOGO_SRC } from './icons.js';
import { illustration } from './illustrations.js';
import { tipsFor } from './tips.js';
import * as cloud from './cloud.js';

const STORAGE_KEY = 'kintore-v1';

// ---------- データ ----------
// state = {
//   profile: { goal, experience, equipment, days, height, weight, sex, focus[], avoid[], cycle, onboarded },
//   exercises: [{ name, muscles: { muscle: 1 | 0.5 }, equip[] }],
//   workouts: { 'YYYY-MM-DD': [{ exercise, weight, reps, rir? }] },
//   bodyweights: { 'YYYY-MM-DD': kg },
//   measurements: { 'YYYY-MM-DD': { waist, chest, arm, thigh, hip } },
//   conditions: { 'YYYY-MM-DD': 1..5 },
//   periods: ['YYYY-MM-DD'],
//   settings: { rest: number | null },
// }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* 保存領域が使えないときは初期状態で動かす */ }
  return normalize({});
}

// 種目リストの版。標準の種目を入れ替えたときに上げる
const CATALOG = 3;

function normalize(s) {
  const defaults = new Map([...LEGACY_EXERCISES, ...DEFAULT_EXERCISES].map((e) => [e.name, e]));
  let exercises = Array.isArray(s.exercises) && s.exercises.length ? s.exercises : DEFAULT_EXERCISES;
  // 旧形式（種目名だけの配列）からの移行
  exercises = exercises.map((e) => (typeof e === 'string' ? (defaults.get(e) || { name: e, muscles: {} }) : e));
  if (s.catalog !== CATALOG) {
    // 標準の種目を新しいリストに入れ替える。自分で追加した種目と、記録がある種目は残す
    const used = new Set(Object.values(s.workouts || {}).flat().map((x) => x.exercise));
    const keep = exercises
      .filter((e) => !DEFAULT_EXERCISES.some((d) => d.name === e.name))
      .filter((e) => !defaults.has(e.name) || used.has(e.name))
      .map((e) => (defaults.has(e.name) ? e : { ...e, custom: true }));
    exercises = [...DEFAULT_EXERCISES, ...keep];
  }
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  // 旧形式は休憩 90秒が初期値として保存されていたので、90 は「目安を使う」とみなす
  const savedRest = s.settings && typeof s.settings.rest === 'number' ? s.settings.rest : null;
  const rest = s.profile ? savedRest : (savedRest === 90 ? null : savedRest);
  return {
    profile: {
      goal: 'hypertrophy', experience: 'beginner', equipment: 'gym', days: 3,
      height: null, weight: null, sex: '', focus: [], avoid: [], cycle: false, onboarded: false,
      ...obj(s.profile),
    },
    exercises: exercises.map((e) => ({ ...e })),
    workouts: obj(s.workouts),
    bodyweights: obj(s.bodyweights),
    measurements: obj(s.measurements),
    conditions: obj(s.conditions),
    periods: Array.isArray(s.periods) ? s.periods : [],
    settings: { sound: true, vibe: true, warn: true, warmup: true, ...obj(s.settings), rest },
    notes: obj(s.notes),
    exNotes: obj(s.exNotes),
    menu: { enabled: true, split: 'auto', style: 'auto', size: null, pins: {}, ...obj(s.menu) },
    catalog: CATALOG,
    // updatedAt：最後に変更した時刻 / syncedAt：最後にクラウドへ送った時刻 / ownerId：この端末の記録の持ち主
    sync: { updatedAt: 0, syncedAt: 0, ownerId: null, ...obj(s.sync) },
  };
}

function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('保存できませんでした。ブラウザの設定を確認してください。');
  }
}

// 端末に保存し、ログインしていればクラウドにも送る
function save() {
  state.sync.updatedAt = Date.now();
  writeLocal();
  schedulePush();
}

let state = loadState();

// ---------- ユーティリティ ----------
const $ = (sel) => document.querySelector(sel);

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}（${wd}）`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

const options = (map, selected) => Object.entries(map).map(([v, label]) => el('option', { value: v, selected: v === selected }, label));
const restSeconds = () => (state.settings.rest ?? targetsFor(state.profile).rest);

// 根拠の折りたたみ表示
function evidence(...keys) {
  return el('details', { class: 'evidence' },
    el('summary', {}, '根拠を見る'),
    ...keys.map((k) => el('div', {},
      el('strong', {}, REFS[k].title),
      el('p', {}, REFS[k].text),
      el('ul', {}, ...REFS[k].cites.map((c) => el('li', {}, c))),
    )),
  );
}

// 折れ線グラフ（SVG）
function lineChart(points, unit) {
  // PC の広い画面では横長に描いて、文字が大きくなりすぎないようにする
  const wide = window.matchMedia('(min-width: 960px)').matches;
  const W = wide ? 640 : 340, H = wide ? 260 : 200, padL = 44, padR = 12, padT = 14, padB = 26;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span * 0.1;
  hi += span * 0.1;
  const x = (i) => (points.length === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => padT + ((hi - v) * (H - padT - padB)) / (hi - lo);

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    svg.append(n);
    return n;
  };
  for (let k = 0; k <= 2; k++) {
    const v = lo + ((hi - lo) * k) / 2;
    add('line', { class: 'axis', x1: padL, x2: W - padR, y1: y(v), y2: y(v) });
    add('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(round1(v)));
  }
  const coords = points.map((p, i) => `${x(i)},${y(p.value)}`);
  if (points.length > 1) {
    const base = H - padB;
    add('polygon', { class: 'area', points: `${x(0)},${base} ${coords.join(' ')} ${x(points.length - 1)},${base}` });
  }
  add('polyline', { class: 'line', points: coords.join(' ') });
  points.forEach((p, i) => {
    const dot = add('circle', { class: 'dot', cx: x(i), cy: y(p.value), r: points.length > 30 ? 2.5 : 4 });
    const t = document.createElementNS(ns, 'title');
    t.textContent = `${formatDate(p.date)}  ${p.value} ${unit}`;
    dot.append(t);
  });
  const short = (iso) => iso.slice(5).replace('-', '/');
  add('text', { x: x(0), y: H - 6, 'text-anchor': points.length === 1 ? 'middle' : 'start' }, short(points[0].date));
  if (points.length > 1) add('text', { x: x(points.length - 1), y: H - 6, 'text-anchor': 'end' }, short(points.at(-1).date));
  return svg;
}

// ---------- タブ ----------
const renderers = {};

document.querySelectorAll('.tabbar button').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

function showTab(name) {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('#page-title').textContent = document.querySelector(`.tabbar button[data-tab="${name}"] span`)?.textContent || '';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
  renderers[name]?.();
  window.scrollTo(0, 0);
}

function renderGoalBadge() {
  $('#goal-badge').textContent = `目的：${GOALS[state.profile.goal].short}`;
}

// ---------- 初回設定 ----------
function setupOnboarding() {
  $('#ob-goal').replaceChildren(...Object.entries(GOALS).map(([k, g], i) =>
    el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'ob-goal', value: k, checked: i === 0 }),
      el('span', {}, g.label)),
  ));
  $('#ob-experience').replaceChildren(...options(EXPERIENCE, 'beginner'));
  $('#ob-equipment').replaceChildren(...options(EQUIPMENT, 'gym'));
  $('#onboarding').classList.remove('hidden');
}

$('#onboarding-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = state.profile;
  p.goal = document.querySelector('input[name="ob-goal"]:checked')?.value || 'hypertrophy';
  p.experience = $('#ob-experience').value;
  p.equipment = $('#ob-equipment').value;
  p.days = Number($('#ob-days').value) || 3;
  p.sex = $('#ob-sex').value;
  const w = parseFloat($('#ob-weight').value);
  const h = parseFloat($('#ob-height').value);
  if (w > 0) { p.weight = w; state.bodyweights[today()] = w; }
  if (h > 0) p.height = h;
  p.onboarded = true;
  save();
  $('#onboarding').classList.add('hidden');
  refreshAll();
});

// ---------- 記録 ----------
const dateInput = $('#log-date');
dateInput.value = today();
dateInput.addEventListener('change', renderLog);

function renderDateNav() {
  const d = dateInput.value || today();
  const diff = d === today() ? '今日' : d === addDays(today(), -1) ? '昨日' : null;
  $('#date-text').textContent = diff ? `${diff}・${formatDate(d).slice(5)}` : formatDate(d);
  $('#date-next').disabled = d >= today();
}

$('#date-prev').addEventListener('click', () => { dateInput.value = addDays(dateInput.value || today(), -1); renderLog(); });
$('#date-next').addEventListener('click', () => {
  const next = addDays(dateInput.value || today(), 1);
  if (next <= today()) { dateInput.value = next; renderLog(); }
});

// ---------- 種目の選択（入力で絞り込み＋候補表示） ----------
const TYPE_LABEL = { machine: 'マシン', cable: 'ケーブル', dumbbell: 'ダンベル', barbell: 'バーベル', bodyweight: '自重' };
const primaryOf = (ex) => Object.entries(ex.muscles || {}).sort((a, b) => b[1] - a[1])[0]?.[0];

// ひらがな→カタカナ、英字は小文字、空白を除いてから比べる
function norm(str) {
  return (str || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

function exerciseMatches(query) {
  const q = norm(query);
  const menuNames = new Set(currentMenu()?.items.map((i) => i.exercise) || []);
  return state.exercises
    .map((ex) => {
      const name = norm(ex.name);
      const muscle = norm(MUSCLES[primaryOf(ex)] || '');
      let rank;
      if (!q) rank = menuNames.has(ex.name) ? 0 : 2;
      else if (name.startsWith(q)) rank = 0;
      else if (name.includes(q)) rank = 1;
      else if (muscle.includes(q) || Object.keys(ex.muscles || {}).some((m) => norm(MUSCLES[m]).includes(q))) rank = 2;
      else return null;
      return { ex, rank };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.ex);
}

const combo = { input: $('#exercise-input'), list: $('#exercise-options'), active: -1, items: [] };

function openCombo() {
  const q = combo.input.value === $('#exercise-select').value ? '' : combo.input.value.trim();
  const found = exerciseMatches(q);
  combo.items = found.map((ex) => ({ type: 'ex', name: ex.name, ex }));
  if (q && !state.exercises.some((e) => norm(e.name) === norm(q))) combo.items.push({ type: 'new', name: q });
  combo.active = combo.items.length ? 0 : -1;
  renderCombo();
  combo.list.classList.remove('hidden');
  combo.input.setAttribute('aria-expanded', 'true');
}

function closeCombo() {
  combo.list.classList.add('hidden');
  combo.input.setAttribute('aria-expanded', 'false');
  combo.input.removeAttribute('aria-activedescendant');
}

function renderCombo() {
  combo.list.replaceChildren(...(combo.items.length ? combo.items.map((it, i) => {
    const li = el('li', { id: `exopt-${i}`, role: 'option', class: `combo-opt${i === combo.active ? ' active' : ''}${it.type === 'new' ? ' new' : ''}`, 'aria-selected': i === combo.active ? 'true' : 'false' });
    if (it.type === 'new') li.append(icon('plus'), el('span', {}, `「${it.name}」を新しい種目として追加`));
    else {
      li.append(el('span', { class: 'opt-name' }, it.name),
        el('span', { class: 'opt-meta' }, [MUSCLES[primaryOf(it.ex)], TYPE_LABEL[it.ex.type] || (it.ex.custom ? '自分で追加' : '')].filter(Boolean).join('・')));
    }
    li.addEventListener('mousedown', (e) => { e.preventDefault(); chooseCombo(i); });
    return li;
  }) : [el('li', { class: 'combo-empty' }, '見つかりません')]));
  if (combo.active >= 0) {
    combo.input.setAttribute('aria-activedescendant', `exopt-${combo.active}`);
    $(`#exopt-${combo.active}`)?.scrollIntoView({ block: 'nearest' });
  }
}

function chooseCombo(i) {
  const it = combo.items[i];
  if (!it) return;
  closeCombo();
  if (it.type === 'new') {
    $('#new-ex-name').textContent = it.name;
    $('#new-ex-muscle').replaceChildren(...options(MUSCLES));
    $('#new-exercise-inline').classList.remove('hidden');
    return;
  }
  setExercise(it.name);
}

function setExercise(name) {
  $('#exercise-select').value = name;
  combo.input.value = name;
  $('#new-exercise-inline').classList.add('hidden');
  renderSuggestion();
  renderMenu();
}

combo.input.addEventListener('focus', () => { combo.input.select(); openCombo(); });
combo.input.addEventListener('input', openCombo);
combo.input.addEventListener('blur', () => {
  closeCombo();
  // 確定しなかったときは、選んでいた種目に戻す
  if ($('#new-exercise-inline').classList.contains('hidden')) combo.input.value = $('#exercise-select').value;
});
combo.input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (combo.list.classList.contains('hidden')) openCombo();
    const n = combo.items.length;
    if (n) combo.active = (combo.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    renderCombo();
  } else if (e.key === 'Enter') {
    if (!combo.list.classList.contains('hidden') && combo.active >= 0) { e.preventDefault(); chooseCombo(combo.active); combo.input.blur(); }
  } else if (e.key === 'Escape') {
    closeCombo();
    combo.input.value = $('#exercise-select').value;
  }
});
$('#exercise-toggle').addEventListener('click', () => {
  if (combo.list.classList.contains('hidden')) { combo.input.focus(); } else { combo.input.blur(); }
});

$('#new-ex-add').addEventListener('click', () => {
  const name = $('#new-ex-name').textContent.trim();
  if (!name) return;
  if (!state.exercises.some((e) => e.name === name)) {
    state.exercises.push({ name, muscles: { [$('#new-ex-muscle').value]: 1 }, custom: true });
    save();
    renderExerciseOptions();
  }
  setExercise(name);
});
$('#new-ex-cancel').addEventListener('click', () => {
  $('#new-exercise-inline').classList.add('hidden');
  combo.input.value = $('#exercise-select').value;
});

// 進捗グラフ用の一覧（部位ごと）と、記録の種目の初期値
function renderExerciseOptions() {
  const names = state.exercises.map((e) => e.name);
  const select = $('#graph-exercise');
  const current = select.value;
  const groups = new Map();
  for (const ex of state.exercises) {
    const label = MUSCLES[primaryOf(ex)] || 'その他';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(el('option', { value: ex.name }, ex.name));
  }
  select.replaceChildren(...[...groups].map(([label, opts]) => el('optgroup', { label }, ...opts)));
  if (names.includes(current)) select.value = current;
  if (!names.includes($('#exercise-select').value)) {
    const first = currentMenu()?.items[0]?.exercise || names[0];
    $('#exercise-select').value = first;
    combo.input.value = first;
  }
}

// ---------- 今日のメニュー ----------
function currentMenu() {
  if (!state.menu.enabled) return null;
  const m = buildMenu(state, dateInput.value || today());
  return m.items.length ? m : null;
}

function renderMenu() {
  const card = $('#menu-card');
  const m = currentMenu();
  card.classList.toggle('hidden', !m);
  if (!m) return;
  const date = dateInput.value || today();
  const beginner = state.profile.experience === 'beginner' && (state.menu.style || 'auto') === 'auto';
  card.replaceChildren(
    el('div', { class: 'menu-head' },
      el('h2', {}, icon('target'), '今日のメニュー'),
      el('span', { class: 'badge' }, m.title)),
    el('ul', { class: 'menu-list' }, ...m.items.map((it) => {
      const done = doneSets(date, it.exercise);
      const complete = done >= it.sets;
      const alts = it.alternatives;
      return el('li', { class: `menu-item${complete ? ' done' : ''}${$('#exercise-select').value === it.exercise ? ' current' : ''}` },
        el('button', { type: 'button', class: 'menu-pick', onclick: () => { setExercise(it.exercise); $('#add-set-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
          el('span', { class: 'menu-check' }, complete ? icon('check') : String(m.items.indexOf(it) + 1)),
          el('span', { class: 'menu-text' },
            el('span', { class: 'menu-name' }, it.exercise, it.pinned ? el('span', { class: 'pin' }, '固定') : null),
            el('span', { class: 'menu-sub' }, `${it.label}・${it.sets}セット × ${it.reps[0]}〜${it.reps[1]}回・${done}/${it.sets}`)),
        ),
        alts.length > 1 ? el('button', {
          type: 'button', class: 'menu-swap', 'aria-label': `${it.label}の種目を入れ替える`,
          onclick: () => {
            const next = alts[(alts.indexOf(it.exercise) + 1) % alts.length];
            state.menu.pins[it.slot] = next;
            save();
            renderMenu();
          },
        }, icon('repeat')) : null,
      );
    })),
    ...(beginner ? [el('p', { class: 'hint' }, '初心者のうちは、動きが決まっていてフォームを覚えやすいマシン中心のメニューにしています。')] : []),
    evidence('machines', 'split'),
  );
}



// −／＋ボタン（重量は 20kg 未満なら 1kg 刻み）
document.querySelectorAll('.step').forEach((b) => b.addEventListener('click', () => {
  const input = $(`#${b.dataset.target}`);
  const cur = parseFloat(input.value) || 0;
  let delta = Number(b.dataset.delta);
  if (b.dataset.target === 'weight' && (cur < 20 || (cur === 20 && delta < 0))) delta = Math.sign(delta);
  const min = b.dataset.target === 'reps' ? 1 : 0;
  input.value = Math.max(min, round1(cur + delta));
}));

// 余力のボタン
document.querySelectorAll('#rir-chips button').forEach((b) => b.addEventListener('click', () => {
  const v = $('#rir').value === b.dataset.v ? '' : b.dataset.v;
  $('#rir').value = v;
  document.querySelectorAll('#rir-chips button').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
}));

// ---------- 今日のセットの計画・アップ・左右 ----------
let side = '右';

// その日に終えた本番のセット数（アップは数えず、左右別の種目は左まで終えて1セット）
function doneSets(date, name) {
  return workSets(state.workouts[date]).filter((x) => x.exercise === name && x.side !== '右').length;
}

function currentExercise() {
  return state.exercises.find((e) => e.name === $('#exercise-select').value) || { name: $('#exercise-select').value, muscles: {} };
}

function plannedSetsFor(name) {
  return currentMenu()?.items.find((i) => i.exercise === name)?.sets || null;
}

function setSide(v) {
  side = v;
  document.querySelectorAll('#sides button').forEach((b) => b.classList.toggle('on', b.dataset.side === v));
}
document.querySelectorAll('#sides button').forEach((b) => b.addEventListener('click', () => setSide(b.dataset.side)));

// 前回の記録から今日の各セットの重量・回数を決め、今やるセットを入力欄に入れる
function renderSuggestion({ keepInputs = false } = {}) {
  const name = $('#exercise-select').value;
  const date = dateInput.value || today();
  const ex = currentExercise();
  const box = $('#suggestion');
  const planned = plannedSetsFor(name);
  const plan = setPlan(state, name, date, planned);
  const done = doneSets(date, name);

  // 左右別の種目
  $('#sides').classList.toggle('hidden', !ex.sides);
  if (!ex.sides) setSide('右');

  if (plan) {
    const cur = plan.sets[Math.min(done, plan.sets.length - 1)];
    if (!keepInputs || done < plan.sets.length) {
      $('#weight').value = cur.weight;
      $('#reps').value = cur.reps;
    }
    const lastTxt = plan.last.map((x) => `${x.weight}×${x.reps}${Number.isFinite(x.rir) ? `(余力${x.rir})` : ''}`).join('、');
    box.replaceChildren(
      el('div', { class: 'label' }, icon('sparkles'), '今日の目標（漸進性過負荷）'),
      el('ol', { class: 'plan-sets' }, ...plan.sets.map((p, i) =>
        el('li', { class: i < done ? 'done' : i === done ? 'now' : '' },
          el('span', { class: 'ps-no' }, `${i + 1}`),
          el('span', { class: 'ps-main' }, `${p.weight}kg × ${p.reps}回`)))),
      el('div', { class: 'prev' }, `前回 ${plan.date.slice(5).replace('-', '/')}：${lastTxt}`),
      el('p', { class: 'hint' }, plan.reason),
    );
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
    if (!keepInputs) { $('#weight').value = ''; $('#reps').value = ''; }
  }

  // 最後のセットかどうか（予定のセット数に届くとき）
  const total = plan?.sets.length || planned;
  $('#last-set').checked = !!total && done + 1 >= total;

  // アップ：その日まだ本番をしていない種目で、本番の重さがわかるとき（本番の約60%）
  const work = parseFloat($('#weight').value);
  const warmedUp = (state.workouts[date] || []).some((x) => x.exercise === name);
  const showWarm = state.settings.warmup !== false && !warmedUp && work >= 20;
  $('#warmup').classList.toggle('hidden', !showWarm);
  if (showWarm) {
    const w = Math.round((work * 0.6) / 2.5) * 2.5;
    $('#warmup-text').textContent = `${w}kg × 10回`;
    $('#warmup').dataset.weight = w;
  }

  // 気をつけること・種目のメモ
  const tips = tipsFor(name);
  $('#tips').classList.toggle('hidden', !tips);
  if (tips) {
    $('#tips-list').replaceChildren(...tips.map((t) => el('li', {}, t)));
    $('#tips').open = state.profile.experience === 'beginner' && done === 0;
  }
  $('#ex-note').value = state.exNotes[name] || '';
}

$('#warmup-done').addEventListener('click', () => {
  const name = $('#exercise-select').value;
  const date = dateInput.value || today();
  const weight = Number($('#warmup').dataset.weight) || 0;
  (state.workouts[date] ||= []).push({ exercise: name, weight, reps: 10, warmup: true });
  save();
  renderLog({ keepInputs: true });
  startTimer(60, `${name}（アップ後）`);
});

let exNoteTimer = null;
$('#ex-note').addEventListener('input', (e) => {
  const name = $('#exercise-select').value;
  clearTimeout(exNoteTimer);
  exNoteTimer = setTimeout(() => {
    const v = e.target.value.trim();
    if (v) state.exNotes[name] = v; else delete state.exNotes[name];
    save();
  }, 400);
});

$('#add-set-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const weight = parseFloat($('#weight').value);
  const reps = parseInt($('#reps').value, 10);
  if (!(weight >= 0) || !(reps >= 1)) return;
  const rirRaw = $('#rir').value;
  const ex = currentExercise();
  const set = { exercise: ex.name, weight, reps };
  if (rirRaw !== '') set.rir = Number(rirRaw);
  const firstSide = !!ex.sides && side === '右';
  if (ex.sides) set.side = side;
  const last = $('#last-set').checked;
  const date = dateInput.value || today();
  // 追加する前の、この種目のベスト（推定1RM。アップは除く）
  const before = Object.values(state.workouts).flatMap(workSets).filter((s) => s.exercise === set.exercise);
  const prevBest = before.length ? Math.max(...before.map((s) => e1rm(s.weight, s.reps))) : null;
  (state.workouts[date] ||= []).push(set);
  save();
  if (ex.sides) setSide(firstSide ? '左' : '右');
  renderLog();
  animateAddedSet(set.exercise);
  const now = e1rm(weight, reps);
  if (prevBest != null && weight > 0 && now > prevBest + 0.05) {
    celebrate(set.exercise, round1(now), round1(now - prevBest));
  }
  // 片側目のあとは1分、最後のセットのあとは種目間の1分30秒、それ以外は種目ごとの休憩
  if (firstSide) startTimer(60, `${ex.name}（反対側へ）`);
  else if (last) startTimer(90, '種目間の休憩');
  else startTimer(restFor(state, ex.name), ex.name);
});

// 追加したセットを光らせ、ボタンとセット数を少し動かす
function animateAddedSet(name) {
  const block = [...document.querySelectorAll('#day-log .exercise-block')].find((b) => b.dataset.name === name);
  block?.querySelector('.sets li:last-child')?.classList.add('just-added');
  block?.querySelector('.count')?.classList.add('bump');
  const btn = $('#add-set-form button[type=submit]');
  btn.classList.remove('flash');
  void btn.offsetWidth; // アニメーションをやり直す
  btn.classList.add('flash');
}

// 自己ベスト更新の知らせ（画面上部に控えめに出す）
let celebrateTimer = null;
function celebrate(name, value, diff) {
  const box = $('#celebrate');
  const close = () => { box.classList.add('hidden'); clearTimeout(celebrateTimer); };
  box.replaceChildren(
    el('span', { class: 'pb-icon' }, icon('trophy')),
    el('div', { class: 'pb-text' },
      el('strong', {}, '自己ベスト更新'),
      el('span', {}, `${name}　推定1RM ${value}kg（+${diff}kg）`),
    ),
  );
  box.classList.remove('hidden');
  box.onclick = close;
  if (navigator.vibrate) navigator.vibrate(80);
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(close, 4000);
}

function deleteSet(date, index) {
  state.workouts[date].splice(index, 1);
  if (!state.workouts[date].length) delete state.workouts[date];
  save();
  renderLog({ keepInputs: true });
}

function groupByExercise(sets) {
  const groups = new Map();
  sets.forEach((s, i) => {
    if (!groups.has(s.exercise)) groups.set(s.exercise, []);
    groups.get(s.exercise).push({ ...s, index: i });
  });
  return groups;
}

function renderLog({ keepInputs = false } = {}) {
  const date = dateInput.value || today();
  renderDateNav();
  const t = targetsFor(state.profile);
  $('#rir-target').textContent = `目安（${GOALS[state.profile.goal].short}）：${t.reps[0]}〜${t.reps[1]}回やって、あと${t.rir[0]}〜${t.rir[1]}回できるくらいの重さ`;

  const sets = state.workouts[date] || [];
  const container = $('#day-log');
  if (!sets.length) {
    container.replaceChildren(el('div', { class: 'card' }, illustration('barbell', 'この日の記録はまだありません', '種目を選んで「セットを追加」を押しましょう')));
  } else {
    container.replaceChildren(...[...groupByExercise(sets)].map(([name, list]) =>
      el('div', { class: 'card exercise-block', 'data-name': name },
        el('h3', {}, name, el('span', { class: 'count' }, `${list.filter((x) => !x.warmup && x.side !== '右').length}セット`)),
        el('ul', { class: 'sets' }, ...list.map((s, n) =>
          el('li', { class: s.warmup ? 'warm' : '' },
            el('span', { class: 'no' }, s.warmup ? 'W' : String(list.filter((x, i) => i <= n && !x.warmup && x.side !== '右').length || 1)),
            el('span', { class: 'main' }, `${s.weight}`, el('small', {}, ' kg'), ` × ${s.reps}`, el('small', {}, ' 回'),
              s.warmup ? el('small', { class: 'tag' }, 'アップ') : null, s.side ? el('small', { class: 'tag' }, s.side) : null),
            Number.isFinite(s.rir) ? el('span', { class: 'rir' }, `余力${s.rir}`) : el('span'),
            el('button', { class: 'del', type: 'button', 'aria-label': `${n + 1}セット目を削除`, onclick: () => deleteSet(date, s.index) }, '×'),
          ),
        )),
      ),
    ));
  }

  const cond = state.conditions[date];
  document.querySelectorAll('#condition button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === cond));

  const info = $('#cycle-info');
  const day = state.profile.cycle ? cycleDay(state.periods, date) : null;
  info.classList.toggle('hidden', !day);
  if (day) info.textContent = `生理周期 ${day}日目`;

  // セットを追加した直後は、入力した重量・回数をそのまま残す（次のセットも同じことが多いため）
  renderSuggestion({ keepInputs });
  renderStreak();
  $('#day-note').value = state.notes[date] || '';
  renderMenu();
}

document.querySelectorAll('#condition button').forEach((b) => b.addEventListener('click', () => {
  const date = dateInput.value || today();
  const v = Number(b.dataset.v);
  if (state.conditions[date] === v) delete state.conditions[date];
  else state.conditions[date] = v;
  save();
  renderLog({ keepInputs: true });
}));

// ---------- 休憩タイマー ----------
const DIAL_C = 2 * Math.PI * 90;
const T = { running: false, endAt: 0, total: 0, remaining: 0, warned: false, tick: null, label: '休憩' };
let audio = null, wakeLock = null;
$('#dial-ring').style.strokeDasharray = DIAL_C;

const fmtSec = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// 音：一度タップすると使えるようになる（iPhone は無音を一度鳴らす）
function ensureAudio() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { audio = new AC(); } catch { audio = null; } }
  }
  if (audio && audio.state !== 'running') audio.resume().then(updateSoundState, updateSoundState);
  if (audio) {
    try {
      const b = audio.createBuffer(1, 1, 22050), src = audio.createBufferSource();
      src.buffer = b; src.connect(audio.destination); src.start(0);
    } catch { /* 無視 */ }
  }
  updateSoundState();
}
function soundReady() { return !!audio && audio.state === 'running'; }
function updateSoundState() {
  $('#sound-off').classList.toggle('hidden', !(T.running && state.settings.sound && !soundReady()));
}
['pointerdown', 'touchend', 'keydown'].forEach((t) => document.addEventListener(t, () => { if (state.settings.sound) ensureAudio(); }, { passive: true }));

function beep(freq, dur, when = 0) {
  if (!audio || !state.settings.sound) return;
  const t = audio.currentTime + when;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function vibrate(pattern) {
  if (state.settings.vibe && navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* 無視 */ } }
}
function requestWake() {
  navigator.wakeLock?.request?.('screen').then((l) => { wakeLock = l; }).catch(() => {});
}
function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function renderTimer() {
  const box = $('#timer');
  const finished = !T.running && T.remaining <= 0;
  $('#timer-display').textContent = fmtSec(T.remaining);
  $('#timer-label').textContent = T.label;
  const frac = T.total > 0 ? Math.max(0, T.remaining) / T.total : 0;
  $('#dial-ring').style.strokeDashoffset = DIAL_C * (1 - frac);
  $('#dial').classList.toggle('finished', finished);
  $('#timer-banner').classList.toggle('hidden', !finished);
  $('#timer-toggle').textContent = T.running ? '一時停止' : finished ? 'もう一度' : '再開';
  document.title = T.running ? `${fmtSec(T.remaining)} WILL` : 'WILL | 科学で鍛える筋トレ記録';
  box.classList.remove('hidden');
  updateSoundState();
}

function timerLoop() {
  T.remaining = (T.endAt - Date.now()) / 1000;
  if (state.settings.warn && !T.warned && T.remaining <= 20 && T.remaining > 0) {
    T.warned = true; beep(660, 0.12); vibrate(80);
  }
  if (T.remaining <= 0) { finishTimer(); return; }
  renderTimer();
}

function startTimer(sec, label = '休憩') {
  if (typeof sec === 'number') { T.total = sec; T.remaining = sec; T.label = label; }
  if (!(T.total > 0)) return;
  if (T.remaining <= 0) T.remaining = T.total;
  if (state.settings.sound) ensureAudio();
  T.endAt = Date.now() + T.remaining * 1000;
  T.warned = T.remaining <= 20;
  T.running = true;
  clearInterval(T.tick);
  T.tick = setInterval(timerLoop, 200);
  requestWake();
  renderTimer();
  $('#timer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pauseTimer() {
  T.running = false;
  clearInterval(T.tick);
  T.remaining = Math.max(0, (T.endAt - Date.now()) / 1000);
  releaseWake();
  renderTimer();
}

function finishTimer() {
  T.running = false;
  clearInterval(T.tick);
  T.remaining = 0;
  beep(880, 0.18, 0); beep(880, 0.18, 0.28); beep(1175, 0.45, 0.56);
  vibrate([300, 150, 300, 150, 500]);
  releaseWake();
  renderTimer();
}

function adjustTimer(delta) {
  if (T.running) {
    T.endAt += delta * 1000;
    T.total = Math.max(T.total + delta, 1);
    T.remaining = (T.endAt - Date.now()) / 1000;
    T.warned = T.remaining <= 20;
    if (T.remaining <= 0) { finishTimer(); return; }
  } else {
    T.remaining = Math.max(0, T.remaining + delta);
    T.total = Math.max(T.total + delta, 15);
    if (T.remaining > T.total) T.total = T.remaining;
  }
  renderTimer();
}

function stopTimer() {
  T.running = false;
  clearInterval(T.tick);
  releaseWake();
  $('#timer').classList.add('hidden');
  $('#sound-off').classList.add('hidden');
  document.title = 'WILL | 科学で鍛える筋トレ記録';
}

$('#timer-toggle').addEventListener('click', () => (T.running ? pauseTimer() : startTimer()));
$('#timer-plus').addEventListener('click', () => adjustTimer(15));
$('#timer-minus').addEventListener('click', () => adjustTimer(-15));
$('#timer-stop').addEventListener('click', stopTimer);
$('#dial').addEventListener('click', () => { if (!T.running && T.remaining <= 0) stopTimer(); });
$('#sound-off').addEventListener('click', ensureAudio);
$('#sound-gate').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ensureAudio(); $('#sound-gate').classList.add('hidden'); });

// アプリに戻ってきたとき：時間を合わせ直し、音がオフなら「タップして音をオン」を出す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (T.running) { requestWake(); timerLoop(); }
    setTimeout(() => {
      if (T.running && state.settings.sound && !soundReady()) $('#sound-gate').classList.remove('hidden');
    }, 300);
  }
});

// ---------- 続けている日数・メモ ----------
function renderStreak() {
  const days = Object.keys(state.workouts).filter((d) => workSets(state.workouts[d]).length);
  const monday = (iso) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d); return addDays(iso, -((x.getDay() + 6) % 7)); };
  const weeks = new Set(days.map(monday));
  const thisMon = monday(today());
  let streak = 0;
  let w = weeks.has(thisMon) ? thisMon : addDays(thisMon, -7);
  while (weeks.has(w)) { streak++; w = addDays(w, -7); }
  const thisWeek = days.filter((d) => monday(d) === thisMon).length;
  $('#streak').replaceChildren(
    el('span', {}, '今週 ', el('b', {}, String(thisWeek)), '日'),
    el('span', {}, '連続 ', el('b', {}, String(streak)), '週'),
    el('span', {}, '通算 ', el('b', {}, String(days.length)), '日'),
  );
}

let dayNoteTimer = null;
$('#day-note').addEventListener('input', (e) => {
  const date = dateInput.value || today();
  clearTimeout(dayNoteTimer);
  dayNoteTimer = setTimeout(() => {
    const v = e.target.value.trim();
    if (v) state.notes[date] = e.target.value; else delete state.notes[date];
    save();
    $('#day-note-saved').textContent = '保存しました';
    setTimeout(() => { $('#day-note-saved').textContent = ''; }, 1500);
  }, 500);
});


// ---------- 分析 ----------
function tile(label, value, sub, cls = '') {
  return el('div', { class: `tile ${cls}` },
    el('div', { class: 't-label' }, label),
    el('div', { class: 't-value' }, ...(Array.isArray(value) ? value : [value])),
    sub ? el('div', { class: 't-sub' }, sub) : null,
  );
}

renderers.analysis = function renderAnalysis() {
  const p = state.profile;
  const t = targetsFor(p);
  const { rows, weak, over, lowFreq } = weakPoints(state);
  const ic = intensityCheck(state);
  const st = stagnation(state);
  const end = today();
  const from = addDays(end, -6);
  const days = Object.keys(state.workouts).filter((d) => d >= from && d <= end);
  const totalSets = days.reduce((n, d) => n + workSets(state.workouts[d]).length, 0);
  const hasData = totalSets > 0;
  const cards = [];

  // ひとことまとめ
  let headline, sub;
  if (!hasData) {
    headline = 'まずは今週のトレーニングを記録しましょう';
    sub = '記録すると、部位ごとの量や弱点をここで分析します。';
  } else if (weak.length) {
    headline = `${weak.slice(0, 2).map((r) => MUSCLES[r.muscle]).join('と')}が少なめです`;
    sub = `ほかの部位とのバランスを取ると、見た目も力も伸びやすくなります。`;
  } else {
    headline = '主な部位をバランスよく鍛えられています';
    sub = 'この調子で、重さか回数を少しずつ増やしていきましょう。';
  }
  cards.push(el('div', { class: 'card hero' },
    el('h2', {}, `今週の分析・${GOALS[p.goal].short}`),
    el('p', { class: 'headline' }, headline),
    el('p', {}, sub),
  ));

  // 数字のタイル
  const rirCls = ic.avgRir == null ? '' : ic.avgRir > t.rir[1] || ic.avgRir < t.rir[0] ? 'warn' : 'ok';
  cards.push(el('div', { class: 'tiles' },
    tile('トレーニング', [String(days.length), el('small', {}, ' 日')], '直近7日'),
    tile('合計', [String(totalSets), el('small', {}, ' セット')], '直近7日'),
    tile('平均の余力', ic.avgRir == null ? '—' : [String(ic.avgRir), el('small', {}, ' 回')], `目安 ${t.rir[0]}〜${t.rir[1]}回`, rirCls),
  ));

  // 改善ポイント
  const items = [];
  for (const r of weak) {
    const ex = suggestExercises(state, r.muscle);
    items.push(el('li', { class: 'bad' },
      el('strong', {}, `${MUSCLES[r.muscle]}：週 ${r.sets} セット`),
      el('p', { class: 'hint' }, `目安は ${r.target.lo}〜${r.target.hi} セット。あと ${round1(r.target.lo - r.sets)} セット以上を目指しましょう。`),
      ex.length ? el('div', { class: 'try' }, ...ex.map((n) => el('span', {}, n))) : null,
    ));
  }
  for (const r of lowFreq) {
    items.push(el('li', { class: 'warn' }, el('strong', {}, `${MUSCLES[r.muscle]}：週1回だけ`), el('p', { class: 'hint' }, '量は足りています。週2回に分けると、1回の質を保ちやすくなります。')));
  }
  for (const r of over) {
    items.push(el('li', { class: 'warn' }, el('strong', {}, `${MUSCLES[r.muscle]}：週 ${r.sets} セット`), el('p', { class: 'hint' }, `目安（〜${r.target.hi}）を大きく超えています。疲れが抜けないときは減らしましょう。`)));
  }
  for (const s of st) {
    items.push(el('li', { class: 'warn' }, el('strong', {}, `${s.name}が伸び悩み中`), el('p', { class: 'hint' }, `直近3週間のベスト（推定1RM ${s.bestRecent}kg）が、それ以前（${s.bestBefore}kg）を超えていません。睡眠とたんぱく質を見直す、回数の範囲を変える、1週間だけ量を半分にする、などを試しましょう。`)));
  }
  cards.push(el('div', { class: 'card' },
    el('h2', {}, '改善ポイント'),
    !hasData ? illustration('chart', '直近7日の記録がありません', '記録すると、ここに改善ポイントが出ます')
      : items.length ? el('ul', { class: 'advice' }, ...items)
        : el('ul', { class: 'advice' }, el('li', { class: 'good' }, el('strong', {}, '気になるところはありません'), el('p', { class: 'hint' }, '主な部位はすべて目安の範囲です。'))),
    evidence('volume', 'frequency', 'progression'),
  ));

  // 部位ごとの週のセット数
  const maxSets = Math.max(...rows.map((r) => Math.max(r.sets, r.target?.hi || 0)), 1);
  cards.push(el('div', { class: 'card' },
    el('h2', {}, '部位ごとのセット数'),
    el('div', { class: 'bars' }, ...rows.map((r) => {
      const status = !r.target ? 'skip' : r.sets < r.target.lo ? (r.target.minor ? 'minor' : 'low') : r.sets > r.target.hi ? 'high' : 'ok';
      return el('div', { class: `bar-row ${status}` },
        el('span', { class: 'bar-label' }, MUSCLES[r.muscle]),
        el('span', { class: 'bar-track' },
          r.target && el('span', { class: 'bar-target', style: `left:${(r.target.lo / maxSets) * 100}%;width:${((r.target.hi - r.target.lo) / maxSets) * 100}%` }),
          el('span', { class: 'bar-fill', style: `width:${(r.sets / maxSets) * 100}%` }),
        ),
        el('span', { class: 'bar-value' }, r.target ? `${r.sets}` : '—'),
      );
    })),
    el('div', { class: 'legend' },
      el('span', {}, el('i', { style: 'background:color-mix(in srgb, var(--accent) 25%, transparent)' }), '目安の範囲'),
      el('span', {}, el('i', { style: 'background:var(--accent)' }), '十分'),
      el('span', {}, el('i', { style: 'background:var(--low)' }), '不足'),
      el('span', {}, el('i', { style: 'background:var(--high)' }), '多すぎ'),
      el('span', {}, el('i', { style: 'background:var(--muted)' }), '補助の部位'),
    ),
    el('p', { class: 'hint' }, '直近7日。補助的に使った部位は 0.5 セットとして数えています。'),
  ));

  // 追い込み度と回数
  if (ic.total) {
    const list = [];
    if (ic.avgRir == null) list.push(el('li', {}, el('strong', {}, '余力を記録してみましょう'), el('p', { class: 'hint' }, '追い込み度が目的に合っているかを判定できます。')));
    else if (ic.avgRir > t.rir[1]) list.push(el('li', { class: 'warn' }, el('strong', {}, `余力 ${ic.avgRir}回：まだ余裕があります`), el('p', { class: 'hint' }, '重さか回数を増やしましょう。')));
    else if (ic.avgRir < t.rir[0]) list.push(el('li', { class: 'warn' }, el('strong', {}, `余力 ${ic.avgRir}回：追い込みすぎかも`), el('p', { class: 'hint' }, '毎回限界を超えると疲れがたまります。少し余裕を残しましょう。')));
    else list.push(el('li', { class: 'good' }, el('strong', {}, `余力 ${ic.avgRir}回：ちょうどいい追い込み度です`)));
    if (ic.inRange != null) {
      list.push(el('li', { class: ic.inRange >= 60 ? 'good' : 'warn' },
        el('strong', {}, `目安の回数に入ったセット：${ic.inRange}%`),
        el('p', { class: 'hint' }, ic.inRange >= 60 ? `目安は ${t.reps[0]}〜${t.reps[1]}回。いい範囲で行えています。`
          : p.goal === 'strength' ? '筋力を伸ばすには、重めの重量で少ない回数のセットを増やしましょう。' : `重さを調整して、${t.reps[0]}〜${t.reps[1]}回で限界近くになるようにしましょう。`)));
    }
    cards.push(el('div', { class: 'card' },
      el('h2', {}, '追い込み度と回数'),
      el('ul', { class: 'advice' }, ...list),
      el('p', { class: 'hint' }, '直近14日の記録から判定しています。'),
      evidence('rir', 'reps'),
    ));
  }

  // 調子と生理周期
  if (p.cycle) {
    const phases = [['生理中（1〜5日目）', 1, 5], ['6〜14日目', 6, 14], ['15日目以降', 15, 60]];
    const stats = phases.map(([label, a, b]) => {
      const v = Object.entries(state.conditions).filter(([d]) => { const c = cycleDay(state.periods, d); return c && c >= a && c <= b; }).map(([, x]) => x);
      return { label, n: v.length, avg: v.length ? round1(v.reduce((s, x) => s + x, 0) / v.length) : null };
    });
    cards.push(el('div', { class: 'card' },
      el('h2', {}, '調子と生理周期'),
      el('table', { class: 'targets' }, ...stats.map((s) => el('tr', {}, el('th', {}, s.label), el('td', {}, s.avg == null ? '記録なし' : `調子 ${s.avg} / 5（${s.n}日）`)))),
      el('p', { class: 'hint' }, '周期によって調子が変わるかは個人差が大きいので、自分のパターンを知る参考にしてください。'),
      evidence('sex'),
    ));
  }

  // あなたの目安
  const perSession = p.days > 0 ? `週${p.days}日なら、同じ部位を週2〜3回に分けて、1回あたり ${Math.ceil(t.sets[0] / Math.min(p.days, 3))}〜${Math.ceil(t.sets[1] / Math.min(p.days, 3))} セットほど。` : '';
  cards.push(el('div', { class: 'card' },
    el('h2', {}, `あなたの目安（${EXPERIENCE[p.experience].split('（')[0]}）`),
    el('table', { class: 'targets' },
      el('tr', {}, el('th', {}, '週のセット数'), el('td', {}, `1部位 ${t.sets[0]}〜${t.sets[1]}`)),
      el('tr', {}, el('th', {}, '回数'), el('td', {}, `${t.reps[0]}〜${t.reps[1]} 回`)),
      el('tr', {}, el('th', {}, '余力'), el('td', {}, `あと ${t.rir[0]}〜${t.rir[1]} 回`)),
      el('tr', {}, el('th', {}, '休憩'), el('td', {}, `${restSeconds()} 秒`)),
    ),
    perSession && el('p', { class: 'hint' }, perSession),
    evidence('volume', 'rir', 'reps', ...(p.sex ? ['sex'] : [])),
  ));

  $('#analysis').replaceChildren(...cards);
};

// ---------- 進捗 ----------
let metric = 'max';
const METRIC_LABEL = { max: '最大重量', e1rm: '推定1RM', volume: '総挙上量' };

document.querySelectorAll('#metric-select button').forEach((btn) => btn.addEventListener('click', () => {
  metric = btn.dataset.metric;
  document.querySelectorAll('#metric-select button').forEach((b) => b.classList.toggle('on', b === btn));
  renderGraph();
}));
$('#graph-exercise').addEventListener('change', renderGraph);

function renderGraph() {
  const points = exerciseHistory(state.workouts, $('#graph-exercise').value).map((h) => ({ date: h.date, value: round1(h[metric]) }));
  const container = $('#graph');
  if (!points.length) {
    container.replaceChildren(illustration('line', 'この種目の記録はまだありません', '記録が増えると、伸びがグラフでわかります'));
    return;
  }
  const first = points[0].value, last = points.at(-1).value;
  const diff = round1(last - first);
  container.replaceChildren(
    el('div', { class: 't-label hint' }, `${METRIC_LABEL[metric]}（最新）`),
    el('div', { class: 'graph-head' },
      el('p', { class: 'big' }, `${last}`, el('small', {}, ' kg')),
      points.length > 1 ? el('span', { class: `delta${diff < 0 ? ' neg' : ''}` }, `最初から ${diff >= 0 ? '+' : ''}${diff}kg`) : null,
    ),
    lineChart(points, 'kg'),
  );
}

function renderHistory() {
  const dates = Object.keys(state.workouts).sort().reverse();
  const container = $('#history-list');
  if (!dates.length) {
    container.replaceChildren(el('div', { class: 'card' }, illustration('calendar', 'まだ記録がありません', '記録した日が、ここに並びます')));
    return;
  }
  container.replaceChildren(...dates.map((d) => {
    const summary = [...groupByExercise(workSets(state.workouts[d]))].map(([name, list]) => `${name} ${list.length}セット`).join('・');
    return el('button', { type: 'button', class: 'card history-day', onclick: () => { dateInput.value = d; showTab('log'); } },
      el('span', { style: 'text-align:left' },
        el('span', { class: 'date', style: 'display:block' }, formatDate(d)),
        el('span', { class: 'summary', style: 'display:block' }, summary),
      ),
    );
  }));
}

renderers.progress = () => { renderGraph(); renderHistory(); };

// 今週のまとめ画像
$('#share-week').addEventListener('click', async () => {
  const end = today();
  const from = addDays(end, -6);
  const { rows } = weakPoints(state, end);
  const days = Object.keys(state.workouts).filter((d) => d >= from && d <= end);
  const totalSets = days.reduce((n, d) => n + workSets(state.workouts[d]).length, 0);
  // 今週、自己ベスト（推定1RM）を更新した種目
  const prs = [];
  for (const ex of state.exercises) {
    const h = exerciseHistory(state.workouts, ex.name);
    const before = h.filter((x) => x.date < from);
    const week = h.filter((x) => x.date >= from && x.date <= end);
    if (!week.length || !before.length) continue;
    const best = Math.max(...week.map((x) => x.e1rm));
    const prev = Math.max(...before.map((x) => x.e1rm));
    if (best > prev) prs.push(`${ex.name} +${round1(best - prev)}kg`);
  }

  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const font = (size, weight = 400) => `${weight} ${size}px "M PLUS 1", system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  g.fillStyle = '#0E0E10'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#EF3340'; g.font = font(44, 700); g.fillText('今週の筋トレ', 80, 130);
  g.fillStyle = '#9ca3af'; g.font = font(32); g.fillText(`${formatDate(from)} 〜 ${formatDate(end)}`, 80, 185);
  g.fillStyle = '#f3f4f6'; g.font = font(120, 700); g.fillText(`${days.length}日`, 80, 350);
  g.font = font(40); g.fillStyle = '#9ca3af'; g.fillText(`合計 ${totalSets} セット`, 420, 350);

  g.font = font(36, 700); g.fillStyle = '#f3f4f6'; g.fillText('部位ごとのセット数', 80, 460);
  const shown = rows.filter((r) => r.sets > 0).sort((a, b) => b.sets - a.sets).slice(0, 6);
  const maxV = Math.max(...shown.map((r) => r.sets), 1);
  shown.forEach((r, i) => {
    const y = 510 + i * 70;
    g.font = font(32); g.fillStyle = '#d1d5db'; g.fillText(MUSCLES[r.muscle], 80, y + 34);
    g.fillStyle = '#1f2937'; g.fillRect(320, y + 8, 560, 32);
    g.fillStyle = '#EF3340'; g.fillRect(320, y + 8, (560 * r.sets) / maxV, 32);
    g.fillStyle = '#f3f4f6'; g.fillText(String(r.sets), 900, y + 34);
  });

  const prY = 510 + Math.max(shown.length, 1) * 70 + 60;
  g.font = font(36, 700); g.fillStyle = '#f3f4f6'; g.fillText('自己ベスト更新', 80, prY);
  g.font = font(32); g.fillStyle = prs.length ? '#EF3340' : '#9ca3af';
  (prs.length ? prs.slice(0, 4) : ['今週はなし。次は更新しよう！']).forEach((t, i) => g.fillText(t, 80, prY + 55 + i * 50));

  // ロゴ
  const logo = new Image();
  logo.src = LOGO_SRC;
  try {
    await logo.decode();
    g.save();
    g.beginPath(); g.roundRect(80, 1210, 96, 96, 22); g.clip();
    g.drawImage(logo, 80, 1210, 96, 96);
    g.restore();
  } catch { /* ロゴが読めなくても画像は作る */ }
  g.font = font(34, 800); g.fillStyle = '#F4F4F5'; g.fillText('WILL', 196, 1252);
  g.font = font(24, 500); g.fillStyle = '#9A9AA6'; g.fillText('科学で鍛える筋トレ記録', 196, 1290);

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], `kintore-${end}.png`, { type: 'image/png' });
  const preview = $('#share-preview');
  preview.src = URL.createObjectURL(blob);
  preview.classList.remove('hidden');
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: '今週の筋トレ' });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const a = el('a', { href: preview.src, download: file.name });
  a.click();
});

// ---------- 体 ----------
$('#bw-date').value = today();
$('#ms-date').value = today();

$('#bodyweight-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = parseFloat($('#bw-value').value);
  if (!(v > 0)) return;
  state.bodyweights[$('#bw-date').value || today()] = v;
  $('#bw-value').value = '';
  save();
  renderBody();
});

$('#measure-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const entry = {};
  document.querySelectorAll('#measure-form input[data-key]').forEach((i) => {
    const v = parseFloat(i.value);
    if (v > 0) entry[i.dataset.key] = v;
  });
  if (!Object.keys(entry).length) return;
  const d = $('#ms-date').value || today();
  state.measurements[d] = { ...(state.measurements[d] || {}), ...entry };
  document.querySelectorAll('#measure-form input[data-key]').forEach((i) => { i.value = ''; });
  save();
  renderBody();
});

const MEASURE_LABEL = { waist: 'ウエスト', chest: '胸囲', arm: '腕', thigh: '太もも', hip: 'お尻' };

function renderBody() {
  // 体重
  const adv = weightAdvice(state);
  const pt0 = proteinTarget(state);
  const rate = adv.trend.rate;
  $('#body-tiles').replaceChildren(
    tile('体重', adv.trend.cur != null ? [String(adv.trend.cur), el('small', {}, ' kg')] : (latestWeightText() || '—'), adv.bmi ? `BMI ${adv.bmi}` : '7日平均'),
    tile('週の変化', rate == null ? '—' : [`${rate > 0 ? '+' : ''}${rate}`, el('small', {}, ' %')], `目安 ${adv.range.lo}〜${adv.range.hi}%`, rate == null ? '' : adv.level === 'warn' ? 'warn' : adv.level === 'good' ? 'ok' : ''),
    tile('たんぱく質', pt0 ? [String(pt0.grams[0]), el('small', {}, 'g〜')] : '—', '1日の目安'),
  );
  const bwDates = Object.keys(state.bodyweights).sort();
  $('#bw-summary').replaceChildren(
    el('div', { class: `notice ${adv.level}` }, ...adv.messages.map((m) => el('p', {}, m))),
    evidence('weightRate', ...(state.profile.sex === 'female' ? ['sex'] : [])),
  );
  const recent = bwDates.slice(-60).map((d) => ({ date: d, value: state.bodyweights[d] }));
  $('#bw-graph').replaceChildren(recent.length >= 2 ? lineChart(recent, 'kg') : illustration('scale', '体重を2日分記録すると、グラフが出ます', '毎朝、同じ条件ではかるのがおすすめです'));

  // たんぱく質
  const pt = proteinTarget(state);
  $('#protein-card').replaceChildren(
    el('h2', {}, 'たんぱく質の目安'),
    pt ? el('p', { class: 'big' }, `1日 ${pt.grams[0]}〜${pt.grams[1]} g`) : el('p', { class: 'empty' }, '体重を記録すると計算します'),
    pt ? el('p', { class: 'hint' }, `体重 ${pt.weight}kg × ${pt.perKg[0]}〜${pt.perKg[1]}g。目安：鶏むね肉100g ≈ 23g、卵1個 ≈ 6g、納豆1パック ≈ 7g、プロテイン1杯 ≈ 20g`) : null,
    el('p', { class: 'hint' }, '腎臓の病気がある方は、たんぱく質の量を医師に相談してください。'),
    evidence('protein'),
  );

  // サイズ
  const msDates = Object.keys(state.measurements).sort();
  const latest = {}, first = {};
  for (const d of msDates) for (const [k, v] of Object.entries(state.measurements[d])) { first[k] ??= v; latest[k] = v; }
  $('#measure-summary').replaceChildren(...(Object.keys(latest).length ? [el('table', { class: 'targets' },
    ...Object.keys(MEASURE_LABEL).filter((k) => k in latest).map((k) => {
      const diff = round1(latest[k] - first[k]);
      return el('tr', {}, el('th', {}, MEASURE_LABEL[k]), el('td', {}, `${latest[k]} cm${diff ? `（最初から ${diff > 0 ? '+' : ''}${diff}）` : ''}`));
    }))] : []));

  // 生理周期
  const cc = $('#cycle-card');
  cc.classList.toggle('hidden', !state.profile.cycle);
  if (state.profile.cycle) {
    const day = cycleDay(state.periods);
    const recentStarts = [...state.periods].sort().reverse().slice(0, 3);
    cc.replaceChildren(
      el('h2', {}, '生理周期'),
      el('p', {}, day ? `今日は ${day}日目` : '開始日が記録されていません'),
      el('button', { type: 'button', onclick: () => {
        const d = today();
        if (!state.periods.includes(d)) state.periods.push(d);
        save();
        renderBody();
      } }, '今日を開始日として記録'),
      recentStarts.length ? el('p', { class: 'hint' }, `最近の開始日：${recentStarts.map((d) => d.slice(5).replace('-', '/')).join('、')}`) : null,
      el('p', { class: 'hint' }, '記録は「調子」との関係を見るためのものです。周期に合わせてトレーニングを変える根拠は、今のところ弱いとされています。'),
    );
  }
}

function latestWeightText() {
  const dates = Object.keys(state.bodyweights).sort();
  return dates.length ? `${state.bodyweights[dates.at(-1)]}kg` : null;
}

renderers.body = renderBody;

// ---------- 設定 ----------
function chips(container, selected) {
  container.replaceChildren(...Object.entries(MUSCLES).map(([k, label]) =>
    el('label', { class: 'chip' }, el('input', { type: 'checkbox', value: k, checked: selected.includes(k) }), el('span', {}, label))));
}

function renderSettings() {
  const p = state.profile;
  $('#pf-goal').replaceChildren(...options(Object.fromEntries(Object.entries(GOALS).map(([k, g]) => [k, g.label])), p.goal));
  $('#pf-experience').replaceChildren(...options(EXPERIENCE, p.experience));
  $('#pf-equipment').replaceChildren(...options(EQUIPMENT, p.equipment));
  $('#pf-days').value = p.days || '';
  $('#pf-height').value = p.height || '';
  $('#pf-sex').value = p.sex || '';
  $('#pf-cycle').checked = !!p.cycle;
  chips($('#pf-focus'), p.focus || []);
  chips($('#pf-avoid'), p.avoid || []);
  $('#rest-seconds').value = state.settings.rest ?? '';
  $('#rest-default').textContent = targetsFor(p).rest;

  $('#new-primary').replaceChildren(...options(MUSCLES));
  $('#new-secondary').replaceChildren(el('option', { value: '' }, 'なし'), ...options(MUSCLES));

  $('#exercise-list').replaceChildren(...state.exercises.map((ex) => {
    const parts = Object.entries(ex.muscles).sort((a, b) => b[1] - a[1]).map(([m, f]) => (f >= 1 ? MUSCLES[m] : `(${MUSCLES[m]})`));
    return el('li', {},
      el('span', {}, ex.name, el('span', { class: 'muscles' }, parts.join(' ') || '部位未設定')),
      el('button', { class: 'small danger', type: 'button', onclick: () => removeExercise(ex.name) }, '削除'),
    );
  }));
}

function renderTimerSettings() {
  for (const [id, key] of [['#opt-sound', 'sound'], ['#opt-vibe', 'vibe'], ['#opt-warn', 'warn'], ['#opt-warmup', 'warmup']]) {
    $(id).checked = state.settings[key] !== false;
  }
}
for (const [id, key] of [['#opt-sound', 'sound'], ['#opt-vibe', 'vibe'], ['#opt-warn', 'warn'], ['#opt-warmup', 'warmup']]) {
  $(id).addEventListener('change', (e) => { state.settings[key] = e.target.checked; save(); if (key === 'sound' && e.target.checked) ensureAudio(); });
}

function renderMenuSettings() {
  const m = state.menu;
  $('#mn-enabled').checked = !!m.enabled;
  $('#mn-split').replaceChildren(el('option', { value: 'auto' }, `自動（週${state.profile.days || 3}日 → ${SPLITS[splitAuto()].label}）`),
    ...Object.entries(SPLITS).map(([k, v]) => el('option', { value: k, selected: m.split === k }, v.label)));
  $('#mn-split').value = m.split || 'auto';
  $('#mn-style').replaceChildren(...options(MENU_STYLES, m.style || 'auto'));
  $('#mn-size').value = m.size ? String(m.size) : '';
  const pins = Object.entries(m.pins || {});
  $('#mn-pins-info').textContent = pins.length ? `固定中：${pins.map(([, n]) => n).join('、')}` : '固定している種目はありません。';
  $('#mn-reset-pins').disabled = !pins.length;
}

function splitAuto() {
  const d = state.profile.days || 3;
  return d >= 5 ? 'ppl' : d === 4 ? 'upperlower' : 'full';
}

$('#mn-enabled').addEventListener('change', (e) => { state.menu.enabled = e.target.checked; save(); renderMenu(); });
$('#mn-split').addEventListener('change', (e) => { state.menu.split = e.target.value; save(); renderMenu(); });
$('#mn-style').addEventListener('change', (e) => { state.menu.style = e.target.value; save(); renderMenu(); });
$('#mn-size').addEventListener('change', (e) => { state.menu.size = Number(e.target.value) || null; save(); renderMenu(); });
$('#mn-reset-pins').addEventListener('click', () => { state.menu.pins = {}; save(); renderMenuSettings(); renderMenu(); });

renderers.settings = () => { renderSettings(); renderMenuSettings(); renderTimerSettings(); renderAccount(); };

$('#profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = state.profile;
  p.goal = $('#pf-goal').value;
  p.experience = $('#pf-experience').value;
  p.equipment = $('#pf-equipment').value;
  p.days = parseInt($('#pf-days').value, 10) || null;
  p.height = parseFloat($('#pf-height').value) || null;
  p.sex = $('#pf-sex').value;
  p.cycle = $('#pf-cycle').checked;
  p.focus = [...document.querySelectorAll('#pf-focus input:checked')].map((i) => i.value);
  p.avoid = [...document.querySelectorAll('#pf-avoid input:checked')].map((i) => i.value);
  save();
  refreshAll();
  $('#profile-saved').textContent = '保存しました';
  setTimeout(() => { $('#profile-saved').textContent = ''; }, 2000);
});

function removeExercise(name) {
  if (state.exercises.length <= 1) return;
  if (!confirm(`「${name}」を種目リストから外しますか？（これまでの記録は残ります）`)) return;
  state.exercises = state.exercises.filter((e) => e.name !== name);
  save();
  renderExerciseOptions();
  renderSettings();
}

$('#add-exercise-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#new-exercise').value.trim();
  if (!name || state.exercises.some((x) => x.name === name)) return;
  const muscles = { [$('#new-primary').value]: 1 };
  const secondary = $('#new-secondary').value;
  if (secondary && !(secondary in muscles)) muscles[secondary] = 0.5;
  state.exercises.push({ name, muscles, custom: true });
  $('#new-exercise').value = '';
  save();
  renderExerciseOptions();
  renderSettings();
});

$('#rest-seconds').addEventListener('change', (e) => {
  const v = e.target.value.trim();
  state.settings.rest = v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
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
    state.profile.onboarded = true;
    save();
    refreshAll();
    alert('読み込みました');
  } catch {
    alert('ファイルを読み込めませんでした');
  } finally {
    e.target.value = '';
  }
});

// ---------- ログインとクラウド同期 ----------
const SKIP_KEY = 'will-skip-login';
let user = null;
let pushTimer = null;
let syncStatus = '';

const hasLocalData = () => state.profile.onboarded || Object.keys(state.workouts).length > 0;
const skipLogin = () => { try { return localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } };
const setSkip = (v) => { try { v ? localStorage.setItem(SKIP_KEY, '1') : localStorage.removeItem(SKIP_KEY); } catch { /* 無視 */ } };

function syncedText() {
  if (!state.sync.syncedAt) return '';
  const d = new Date(state.sync.syncedAt);
  return `最終同期 ${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 保存のたびに、少し待ってからクラウドへ送る（連続した操作は1回にまとめる）
function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 1500);
}

async function pushNow() {
  if (!user) return;
  clearTimeout(pushTimer);
  try {
    await cloud.push(user.id, state, state.sync.updatedAt || Date.now());
    state.sync.syncedAt = Date.now();
    syncStatus = '';
    writeLocal();
  } catch (e) {
    syncStatus = 'クラウドに保存できませんでした。通信できるときに、もう一度保存します。';
  }
  renderAccount();
}

function replaceWithCloud(remote) {
  const keepSync = { ownerId: user.id, updatedAt: remote.updatedAt, syncedAt: Date.now() };
  state = normalize(remote.data);
  state.sync = keepSync;
  writeLocal();
  refreshAll();
}

// 端末とクラウドのどちらを使うかを聞く
function chooseData(remote) {
  return new Promise((resolve) => {
    const n = (s) => Object.keys(s?.workouts || {}).length;
    $('#choose-detail').textContent = `この端末：${n(state)}日分の記録　／　クラウド：${n(remote.data)}日分の記録`;
    $('#choose-data').classList.remove('hidden');
    const done = (v) => { $('#choose-data').classList.add('hidden'); resolve(v); };
    $('#choose-cloud').onclick = () => done('cloud');
    $('#choose-local').onclick = () => done('local');
  });
}

let recovering = false; // パスワード再設定のメールから開いたとき
let signingIn = null;
// ログインの通知とフォームの両方から呼ばれても、同期は1回だけにする
function onSignedIn(u) {
  if (user && user.id === u.id && signingIn) return signingIn;
  signingIn = syncAfterSignIn(u).finally(() => { signingIn = null; });
  return signingIn;
}

async function syncAfterSignIn(u) {
  user = u;
  setSkip(false);
  if (!recovering) $('#login').classList.add('hidden');
  syncStatus = '同期しています…';
  renderAccount();
  try {
    const remote = await cloud.pull(user.id);
    if (!remote) {
      // クラウドが空：この端末の記録を初めて保存する
      state.sync.ownerId = user.id;
      if (!state.sync.updatedAt) state.sync.updatedAt = Date.now();
      await pushNow();
    } else if (state.sync.ownerId === user.id) {
      // 同じアカウント：新しい方を使う
      if (remote.updatedAt > (state.sync.updatedAt || 0)) replaceWithCloud(remote);
      else if ((state.sync.updatedAt || 0) > remote.updatedAt) await pushNow();
    } else if (hasLocalData()) {
      // ログイン前の記録とクラウドの記録が両方ある
      const pick = await chooseData(remote);
      if (pick === 'cloud') replaceWithCloud(remote);
      else { state.sync.ownerId = user.id; state.sync.updatedAt = Date.now(); await pushNow(); }
    } else {
      replaceWithCloud(remote);
    }
    syncStatus = '';
  } catch (e) {
    syncStatus = 'クラウドと同期できませんでした。この端末の記録で続けます。';
  }
  renderAccount();
  refreshAll();
  if (!state.profile.onboarded && !recovering) setupOnboarding();
}

// 別の端末で更新されていたら取り込む（アプリに戻ってきたとき）
async function pullIfNewer() {
  if (!user) return;
  try {
    const remote = await cloud.pull(user.id);
    if (remote && remote.updatedAt > (state.sync.updatedAt || 0)) replaceWithCloud(remote);
  } catch { /* 通信できないときはそのまま */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullIfNewer(); });
window.addEventListener('online', () => { if (user && (state.sync.updatedAt || 0) > (state.sync.syncedAt || 0)) pushNow(); });

// ログイン画面
let loginMode = 'login'; // login / signup / forgot
function setLoginMode(mode) {
  loginMode = mode;
  const titles = { login: 'ログイン', signup: '新規登録', forgot: 'パスワードの再設定' };
  $('#login-title').textContent = titles[mode];
  $('#login-submit').textContent = { login: 'ログイン', signup: '登録する', forgot: '再設定のメールを送る' }[mode];
  $('#login-pass-wrap').classList.toggle('hidden', mode === 'forgot');
  $('#login-pass').required = mode !== 'forgot';
  $('#login-pass').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#login-mode').textContent = mode === 'login' ? 'はじめての方（新規登録）' : 'ログインに戻る';
  $('#login-forgot').classList.toggle('hidden', mode !== 'login');
  $('#login-msg').textContent = '';
  $('#login-sub').textContent = {
    login: 'ログインすると記録がクラウドに保存され、スマホと PC で同じ記録を使えます。',
    signup: 'パスワードは10文字以上で、英字と数字を両方入れてください。ほかのサービスと同じパスワードは使わないでください。',
    forgot: '登録したメールアドレスに、パスワードを決め直すためのメールを送ります。',
  }[mode];
}
function showLogin(mode = 'login') {
  setLoginMode(mode);
  $('#onboarding').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
$('#login-mode').addEventListener('click', () => setLoginMode(loginMode === 'login' ? 'signup' : 'login'));
$('#login-forgot').addEventListener('click', () => setLoginMode('forgot'));
$('#login-skip').addEventListener('click', () => {
  setSkip(true);
  $('#login').classList.add('hidden');
  if (!state.profile.onboarded) setupOnboarding();
  renderAccount();
});

// パスワードの条件（Supabase 側の設定と同じ）：10文字以上、英字と数字を両方ふくむ
function passwordProblem(pw) {
  if (pw.length < 10) return 'パスワードは10文字以上にしてください。';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'パスワードには英字と数字を両方入れてください。';
  return '';
}

const AUTH_ERRORS = [
  [/should contain|weak|pwned|leaked/i, 'このパスワードは使えません。英字と数字をまぜた、ほかで使っていない10文字以上のパスワードにしてください。'],
  [/invalid login credentials/i, 'メールアドレスかパスワードが違います。'],
  [/email not confirmed/i, 'メールアドレスの確認がまだです。届いたメールのリンクを開いてください。'],
  [/already registered/i, 'このメールアドレスは登録済みです。ログインしてください。'],
  [/password should be at least/i, 'パスワードは10文字以上にしてください。'],
  [/rate limit|too many/i, '回数が多すぎます。少し時間をおいてから試してください。'],
];
const authMessage = (error) => AUTH_ERRORS.find(([re]) => re.test(error?.message || ''))?.[1] || '通信できませんでした。電波のよい場所で、もう一度試してください。';

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-pass').value;
  const msg = $('#login-msg');
  const btn = $('#login-submit');
  btn.disabled = true;
  msg.textContent = '';
  msg.classList.remove('ok');
  try {
    if (loginMode === 'forgot') {
      const error = await cloud.sendPasswordReset(email);
      msg.textContent = error ? authMessage(error) : '再設定のメールを送りました。メールのリンクから新しいパスワードを決めてください。';
      msg.classList.toggle('ok', !error);
    } else if (loginMode === 'signup') {
      const weak = passwordProblem(password);
      if (weak) { msg.textContent = weak; return; }
      const { user: u, needsConfirm, error } = await cloud.signUp(email, password);
      if (error) msg.textContent = authMessage(error);
      else if (needsConfirm) {
        msg.textContent = `${email} に確認のメールを送りました。メールのリンクを開くと登録が完了します。`;
        msg.classList.add('ok');
      }
      else await onSignedIn(u);
    } else {
      const { user: u, error } = await cloud.signIn(email, password);
      if (error) msg.textContent = authMessage(error);
      else await onSignedIn(u);
    }
  } catch (err) {
    msg.textContent = authMessage(err);
  } finally {
    btn.disabled = false;
  }
});

$('#newpass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const weak = passwordProblem($('#newpass').value);
  if (weak) { $('#newpass-msg').textContent = weak; return; }
  const error = await cloud.updatePassword($('#newpass').value);
  if (error) { $('#newpass-msg').textContent = authMessage(error); return; }
  $('#newpass-form').classList.add('hidden');
  $('#login-form').classList.remove('hidden');
  $('#login').classList.add('hidden');
  recovering = false;
  history.replaceState(null, '', location.pathname);
  if (!state.profile.onboarded) setupOnboarding();
  alert('パスワードを変更しました');
});

// 設定のアカウント欄
function renderAccount() {
  const card = $('#account-card');
  if (!card) return;
  if (!cloud.cloudConfigured()) {
    card.replaceChildren(el('h2', {}, 'アカウント'),
      el('p', { class: 'hint' }, 'クラウド同期はまだ準備中です。今は記録をこの端末の中だけに保存しています。'));
    return;
  }
  if (!user) {
    card.replaceChildren(el('h2', {}, 'アカウント'),
      el('p', { class: 'hint' }, 'ログインすると、記録がクラウドに保存され、スマホと PC で同じ記録を使えます。機種変更しても消えません。'),
      el('button', { type: 'button', class: 'primary', onclick: () => showLogin('login') }, 'ログイン・新規登録'));
    return;
  }
  card.replaceChildren(
    el('h2', {}, 'アカウント'),
    el('p', { class: 'account-email' }, user.email || ''),
    el('p', { class: 'hint' }, syncStatus || syncedText() || '同期待ち'),
    el('div', { class: 'row' },
      el('button', { type: 'button', onclick: () => pushNow() }, '今すぐ同期'),
      el('button', { type: 'button', onclick: logout }, 'ログアウト')),
    el('button', { type: 'button', class: 'small danger ghost', style: 'margin-top:12px', onclick: removeAccount }, 'アカウントを削除'),
  );
}

async function logout() {
  if (!confirm('ログアウトしますか？\nこの端末の記録は消え、次にログインしたときにクラウドから読み込みます。')) return;
  if ((state.sync.updatedAt || 0) > (state.sync.syncedAt || 0)) await pushNow();
  await cloud.signOut();
  user = null;
  // 別の人がこの端末を使ってもいいように、端末の記録を消す
  state = normalize({});
  writeLocal();
  refreshAll();
  showLogin('login');
}

async function removeAccount() {
  if (!confirm('アカウントとクラウドの記録をすべて削除します。元に戻せません。よろしいですか？')) return;
  try {
    await cloud.deleteAccount();
    user = null;
    state = normalize({});
    writeLocal();
    refreshAll();
    showLogin('login');
    alert('アカウントを削除しました');
  } catch {
    alert('削除できませんでした。通信できる場所で、もう一度試してください。');
  }
}

async function initAuth() {
  if (!cloud.cloudConfigured()) {
    renderAccount();
    if (!state.profile.onboarded) setupOnboarding();
    return;
  }
  if (location.hash.includes('type=recovery') || new URLSearchParams(location.search).has('reset')) recovering = true;
  try {
    await cloud.onAuthChange((event, u) => {
      // この通知の中で Supabase を直接呼ぶと止まることがあるので、少しずらす
      setTimeout(() => handleAuthEvent(event, u), 0);
    });
    const u = await cloud.currentUser();
    if (u) { await onSignedIn(u); return; }
  } catch { /* オフラインなどで読み込めないときは、端末の中だけで使う */
    renderAccount();
    if (!state.profile.onboarded) setupOnboarding();
    return;
  }
  renderAccount();
  if (!skipLogin()) showLogin('login');
  else if (!state.profile.onboarded) setupOnboarding();
}

function handleAuthEvent(event, u) {
  if (event === 'PASSWORD_RECOVERY') {
    recovering = true;
    $('#onboarding').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#login-form').classList.add('hidden');
    $('#newpass-form').classList.remove('hidden');
  } else if (event === 'SIGNED_IN' && u && !user) {
    onSignedIn(u); // メールのリンクから戻ってきたとき
  }
}

// ---------- 起動 ----------
function refreshAll() {
  renderGoalBadge();
  renderExerciseOptions();
  renderLog();
  const active = document.querySelector('.tabbar button.on')?.dataset.tab;
  renderers[active]?.();
}

hydrateIcons();
refreshAll();
initAuth();

// オフラインで使えるようにし、データが消されにくいようにする
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});
