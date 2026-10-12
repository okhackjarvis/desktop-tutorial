// 研究に基づく目安と、記録から自動で計算する分析ロジック。
// 画面には依存しない純粋な関数だけを置く。

export const MUSCLES = {
  chest: '胸', back: '背中', shoulders: '肩', biceps: '上腕二頭筋', triceps: '上腕三頭筋',
  quads: '太もも前', hamstrings: '太もも裏', glutes: 'お尻', calves: 'ふくらはぎ', abs: '腹筋',
};
// 弱点判定の対象にする大きな部位（腕・ふくらはぎ・腹筋は補助扱い）
export const MAJOR_MUSCLES = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'];

export const EQUIPMENT = { gym: 'ジム', dumbbell: '自宅（ダンベルあり）', bodyweight: '自重のみ' };

// muscles: 主に使う部位 = 1、補助的に使う部位 = 0.5（fractional sets の数え方）
// equip: その種目ができる環境 / type: 器具の種類 / level: 1 = 初心者向け（フォームが簡単）、2 = フリーウェイトの基本種目
// どこのジムにもある基礎的な種目だけに絞っている
export const DEFAULT_EXERCISES = [
  { name: 'チェストプレス', muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equip: ['gym'], type: 'machine', level: 1 },
  { name: '腕立て伏せ', muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equip: ['gym', 'dumbbell', 'bodyweight'], type: 'bodyweight', level: 1 },
  { name: 'ダンベルプレス', muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equip: ['gym', 'dumbbell'], type: 'dumbbell', level: 2 },
  { name: 'ベンチプレス', muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equip: ['gym'], type: 'barbell', level: 2 },
  { name: 'ラットプルダウン', muscles: { back: 1, biceps: 0.5 }, equip: ['gym'], type: 'machine', level: 1 },
  { name: 'シーテッドロウ', muscles: { back: 1, biceps: 0.5 }, equip: ['gym'], type: 'machine', level: 1 },
  { name: 'ダンベルロウ', muscles: { back: 1, biceps: 0.5 }, equip: ['gym', 'dumbbell'], type: 'dumbbell', level: 2 },
  { name: 'ショルダープレス（マシン）', muscles: { shoulders: 1, triceps: 0.5 }, equip: ['gym'], type: 'machine', level: 1 },
  { name: 'ダンベルショルダープレス', muscles: { shoulders: 1, triceps: 0.5 }, equip: ['gym', 'dumbbell'], type: 'dumbbell', level: 2 },
  { name: 'サイドレイズ', muscles: { shoulders: 1 }, equip: ['gym', 'dumbbell'], type: 'dumbbell', level: 1 },
  { name: 'レッグプレス', muscles: { quads: 1, glutes: 0.5 }, equip: ['gym'], type: 'machine', level: 1 },
  { name: 'スクワット', muscles: { quads: 1, glutes: 0.5 }, equip: ['gym', 'dumbbell', 'bodyweight'], type: 'barbell', level: 2 },
  { name: 'レッグエクステンション', muscles: { quads: 1 }, equip: ['gym'], type: 'machine', level: 1 },
  { name: 'レッグカール', muscles: { hamstrings: 1 }, equip: ['gym'], type: 'machine', level: 1 },
  { name: 'ルーマニアンデッドリフト', muscles: { hamstrings: 1, glutes: 0.5 }, equip: ['gym', 'dumbbell'], type: 'barbell', level: 2 },
  { name: 'アームカール', muscles: { biceps: 1 }, equip: ['gym', 'dumbbell'], type: 'dumbbell', level: 1 },
  { name: 'トライセプスプッシュダウン', muscles: { triceps: 1 }, equip: ['gym'], type: 'cable', level: 1 },
  { name: 'クランチ', muscles: { abs: 1 }, equip: ['gym', 'dumbbell', 'bodyweight'], type: 'bodyweight', level: 1 },
];

// 以前の版の標準種目。リストからは外したが、過去の記録の部位集計に使う
export const LEGACY_EXERCISES = [
  { name: 'インクラインダンベルプレス', muscles: { chest: 1, shoulders: 0.5, triceps: 0.5 }, equip: ['gym', 'dumbbell'] },
  { name: 'ダンベルフライ', muscles: { chest: 1 }, equip: ['gym', 'dumbbell'] },
  { name: '懸垂', muscles: { back: 1, biceps: 0.5 }, equip: ['gym', 'bodyweight'] },
  { name: 'ベントオーバーロウ', muscles: { back: 1, biceps: 0.5 }, equip: ['gym', 'dumbbell'] },
  { name: 'ショルダープレス', muscles: { shoulders: 1, triceps: 0.5 }, equip: ['gym', 'dumbbell'] },
  { name: 'ブルガリアンスクワット', muscles: { quads: 1, glutes: 1 }, equip: ['gym', 'dumbbell', 'bodyweight'] },
  { name: 'デッドリフト', muscles: { glutes: 1, hamstrings: 0.5, back: 0.5 }, equip: ['gym'] },
  { name: 'ヒップスラスト', muscles: { glutes: 1, hamstrings: 0.5 }, equip: ['gym', 'dumbbell', 'bodyweight'] },
  { name: 'カーフレイズ', muscles: { calves: 1 }, equip: ['gym', 'dumbbell', 'bodyweight'] },
];

// 目的ごとの目安。sets は 1部位あたりの週のセット数。
export const GOALS = {
  hypertrophy: { label: '筋肉を大きくしたい', short: '筋肥大', sets: [10, 20], reps: [6, 15], rir: [0, 2], rest: 120 },
  strength: { label: '重いものを挙げたい', short: '筋力', sets: [4, 10], reps: [1, 6], rir: [1, 3], rest: 180 },
  fatloss: { label: '体脂肪を落としたい', short: '減量', sets: [6, 12], reps: [6, 12], rir: [1, 3], rest: 90 },
  health: { label: '健康維持・習慣づくり', short: '健康', sets: [4, 8], reps: [8, 15], rir: [2, 4], rest: 90 },
};

export const EXPERIENCE = { beginner: '初心者（1年未満）', intermediate: '中級者（1〜3年）', advanced: '上級者（3年以上）' };

// 週の体重変化（%）の目安
const WEIGHT_RATE = {
  fatloss: { lo: -1.0, hi: -0.5 },
  hypertrophy: { lo: 0, hi: 0.5 },
  strength: { lo: -0.25, hi: 0.5 },
  health: { lo: -0.5, hi: 0.5 },
};

// たんぱく質（g / 体重kg / 日）
const PROTEIN = { fatloss: [1.8, 2.2], hypertrophy: [1.6, 2.2], strength: [1.6, 2.2], health: [1.2, 1.6] };

// ---------- 根拠 ----------
export const REFS = {
  volume: {
    title: '練習量（週のセット数）',
    text: '1部位あたりの週のセット数が多いほど筋肥大は大きくなるが、増やすほど伸びは小さくなる。筋力は少ないセット数で頭打ちになりやすい。補助的に使った部位は 0.5 セットとして数える（fractional sets）。',
    cites: ['Pelland ら「The resistance training dose-response」メタ回帰（SportRxiv, 67研究）', 'Schoenfeld ら 2017, J Sports Sci（週のセット数と筋肥大）'],
  },
  rir: {
    title: '追い込み度（余力）',
    text: '限界に近いセットほど筋肥大の効果は大きい。筋力は限界までの近さとの関係が弱く、扱う重さ（%1RM）の影響が大きい。',
    cites: ['Robinson ら 2024, Sports Medicine（限界までの近さと筋肥大・筋力）'],
  },
  reps: {
    title: '重さと回数',
    text: '筋肥大は、軽めの重さでも限界近くまで行えば重い重量と同程度に起こる。筋力の向上には重い重量が有利。',
    cites: ['Schoenfeld ら 2017, J Strength Cond Res（低負荷と高負荷のメタ分析）', 'Lopez ら 2021, Med Sci Sports Exerc'],
  },
  frequency: {
    title: '頻度',
    text: '週の総セット数が同じなら、頻度そのものの筋肥大への影響は小さい。週2回以上に分けると、質を保ったまま量をこなしやすい。',
    cites: ['Schoenfeld ら 2019, J Sports Sci（頻度と筋肥大）', 'Pelland ら（頻度のメタ回帰）'],
  },
  machines: {
    title: 'マシンとフリーウェイト',
    text: 'マシンとフリーウェイトで、筋肥大の効果に大きな差は見られない。筋力は、練習した方法で測ると伸びやすい。マシンは動きが決まっていてフォームを覚えやすいので、初心者はマシン中心で始め、慣れてきたらフリーウェイトの基本種目を加えるのが無理のない進め方。',
    cites: ['Haugen ら 2023, BMC Sports Sci Med Rehabil（フリーウェイトとマシンのメタ分析、13研究）', 'Heidel ら 2021（フリーウェイトとマシンのメタ分析）'],
  },
  split: {
    title: 'メニューの分け方',
    text: '週の総セット数が同じなら、全身・上下・部位別のどの分け方でも筋肥大の効果は大きく変わらない。続けやすい日数に合わせて選べばよい。',
    cites: ['Schoenfeld ら 2019, J Sports Sci（頻度と筋肥大）', 'Ramos-Campo ら 2024, J Strength Cond Res（全身と分割法の比較）'],
  },
  progression: {
    title: '漸進性過負荷',
    text: '目標回数の上限に届いたら重量を少し上げ、回数を下限に戻す（ダブルプログレッション）。重さか回数を少しずつ増やすことが、筋力・筋肥大を伸ばし続ける基本。',
    cites: ['ACSM Position Stand 2009（レジスタンストレーニングの漸進モデル）'],
  },
  weightRate: {
    title: '減量・増量のペース',
    text: '減量は体重の週 0.5〜1% 程度のゆっくりしたペースの方が筋肉を残しやすい。急激なカロリー不足は除脂肪量の維持に不利。増量も速すぎると脂肪が増えやすい。',
    cites: ['Garthe ら 2011, IJSNEM（減量ペースと除脂肪量）', 'Murphy & Koehler 2022, Scand J Med Sci Sports（エネルギー不足と筋トレ効果）'],
  },
  protein: {
    title: 'たんぱく質',
    text: '筋トレをしている人では、体重1kgあたり 1.6g 前後で筋量の増加効果がほぼ頭打ちになる。減量中は筋肉を守るため、やや多め（〜2.2g）が勧められる。',
    cites: ['Morton ら 2018, Br J Sports Med（たんぱく質摂取のメタ分析）', 'Helms ら 2014, IJSNEM（減量中のたんぱく質）'],
  },
  sex: {
    title: '性別による違い',
    text: '筋肥大の割合と下半身の筋力の伸びは男女で大きな差がない。女性は疲れにくく、セット間の回復が速い傾向がある。生理周期に合わせてトレーニングを変える根拠は、現時点では弱い。',
    cites: ['Roberts ら 2020, J Strength Cond Res（男女差のメタ分析）', 'Colenso-Semple ら 2023, Front Sports Act Living（生理周期のアンブレラレビュー）'],
  },
};

// ---------- 日付 ----------
export function isoDate(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}
export const today = () => isoDate(new Date());
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// ---------- 基本の計算 ----------
export const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30)); // Epley 式
export const round1 = (n) => Math.round(n * 10) / 10;

// 目的・経験・性別から、その人向けの目安を作る
export function targetsFor(profile) {
  const g = GOALS[profile.goal] || GOALS.hypertrophy;
  let [lo, hi] = g.sets;
  // 初心者は少ない量でも十分伸びるので、範囲の下半分を目安にする
  if (profile.experience === 'beginner') hi = Math.round((lo + hi) / 2);
  // 女性は疲れにくく回復が速い傾向があるので、休憩を少し短めにする
  let rest = g.rest;
  if (profile.sex === 'female') rest = Math.max(60, Math.round((rest * 0.8) / 15) * 15);
  return { ...g, sets: [lo, hi], rest };
}

// 部位ごとの目安（伸ばしたい部位は上限寄り、避けたい部位は対象外）
export function muscleTarget(profile, muscle) {
  const t = targetsFor(profile);
  if ((profile.avoid || []).includes(muscle)) return null;
  const minor = !MAJOR_MUSCLES.includes(muscle);
  let [lo, hi] = t.sets;
  if ((profile.focus || []).includes(muscle)) lo = Math.round((lo + hi) / 2);
  else if (minor) { lo = Math.round(lo / 2); hi = Math.round(hi / 2); } // 腕などは大きな種目で間接的に鍛えられる
  return { lo, hi, minor: minor && !(profile.focus || []).includes(muscle) };
}

// 利用者の種目リストに、標準の種目を補ったもの（リストから外した種目の過去の記録も集計できるように）
function allExercises(state) {
  const names = new Set(state.exercises.map((e) => e.name));
  return [...state.exercises, ...[...DEFAULT_EXERCISES, ...LEGACY_EXERCISES].filter((e) => !names.has(e.name))];
}

function exerciseMap(state) {
  return new Map(allExercises(state).map((e) => [e.name, e]));
}

// 期間内のセットを列挙する
export function setsInRange(workouts, from, to) {
  const out = [];
  for (const [date, sets] of Object.entries(workouts)) {
    if (date >= from && date <= to) for (const s of sets) out.push({ ...s, date });
  }
  return out;
}

// 部位ごとの週のセット数と頻度（直近7日）
export function weeklyMuscleVolume(state, endDate = today()) {
  const from = addDays(endDate, -6);
  const map = exerciseMap(state);
  const volume = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, 0]));
  const days = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, new Set()]));
  for (const s of setsInRange(state.workouts, from, endDate)) {
    const ex = map.get(s.exercise);
    if (!ex) continue;
    for (const [m, f] of Object.entries(ex.muscles)) {
      volume[m] += f;
      if (f >= 1) days[m].add(s.date);
    }
  }
  return Object.keys(MUSCLES).map((m) => ({
    muscle: m, sets: round1(volume[m]), frequency: days[m].size, target: muscleTarget(state.profile, m),
  }));
}

// 弱点（目安より少ない部位）と、やりすぎの部位
export function weakPoints(state, endDate = today()) {
  const rows = weeklyMuscleVolume(state, endDate);
  const weak = rows.filter((r) => r.target && r.sets < r.target.lo && !r.target.minor)
    .sort((a, b) => (a.sets / a.target.lo) - (b.sets / b.target.lo));
  const over = rows.filter((r) => r.target && r.sets > r.target.hi * 1.3);
  const lowFreq = rows.filter((r) => r.target && !r.target.minor && r.sets >= r.target.lo && r.frequency === 1);
  return { rows, weak, over, lowFreq };
}

// 弱い部位を鍛えられる種目を、器具の条件に合わせて提案する
export function suggestExercises(state, muscle, n = 3) {
  const equip = state.profile.equipment || 'gym';
  return allExercises(state)
    .filter((e) => (e.muscles[muscle] || 0) >= 1 && (!e.equip || e.equip.includes(equip)))
    .slice(0, n).map((e) => e.name);
}

// 種目ごとの日別ベスト（推定1RM）
export function exerciseHistory(workouts, name) {
  return Object.keys(workouts).sort().flatMap((d) => {
    const sets = workouts[d].filter((s) => s.exercise === name);
    if (!sets.length) return [];
    return [{
      date: d,
      max: Math.max(...sets.map((s) => s.weight)),
      e1rm: round1(Math.max(...sets.map((s) => e1rm(s.weight, s.reps)))),
      volume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
      sets,
    }];
  });
}

// 伸び悩み：直近3週間のベストが、それより前のベストを超えていない
export function stagnation(state, endDate = today()) {
  const cutoff = addDays(endDate, -20);
  const out = [];
  const names = new Set(Object.values(state.workouts).flat().map((s) => s.exercise));
  for (const name of names) {
    const h = exerciseHistory(state.workouts, name);
    const recent = h.filter((x) => x.date >= cutoff);
    const before = h.filter((x) => x.date < cutoff);
    if (recent.length < 2 || before.length < 2) continue;
    const bestBefore = Math.max(...before.map((x) => x.e1rm));
    const bestRecent = Math.max(...recent.map((x) => x.e1rm));
    if (bestRecent <= bestBefore) out.push({ name, bestBefore, bestRecent });
  }
  return out;
}

// 余力（RIR）と回数が目的に合っているか（直近14日）
export function intensityCheck(state, endDate = today()) {
  const t = targetsFor(state.profile);
  const sets = setsInRange(state.workouts, addDays(endDate, -13), endDate);
  const withRir = sets.filter((s) => Number.isFinite(s.rir));
  const avgRir = withRir.length ? round1(withRir.reduce((a, s) => a + s.rir, 0) / withRir.length) : null;
  const inRange = sets.length ? Math.round((sets.filter((s) => s.reps >= t.reps[0] && s.reps <= t.reps[1]).length / sets.length) * 100) : null;
  return { total: sets.length, rirCount: withRir.length, avgRir, inRange, targets: t };
}

// 次回の提案（ダブルプログレッション）
export function nextSuggestion(state, name, beforeDate = addDays(today(), 1)) {
  const t = targetsFor(state.profile);
  const h = exerciseHistory(state.workouts, name).filter((x) => x.date < beforeDate);
  const last = h.at(-1);
  if (!last) return null;
  const top = last.sets.reduce((a, s) => (s.weight > a.weight || (s.weight === a.weight && s.reps > a.reps) ? s : a));
  const [lo, hi] = t.reps;
  const ex = exerciseMap(state).get(name);
  const small = ex && Object.keys(ex.muscles).every((m) => !MAJOR_MUSCLES.includes(m));
  const step = top.weight === 0 ? 0 : (small || top.weight < 20 ? 1 : 2.5);
  const tooEasy = Number.isFinite(top.rir) && top.rir > t.rir[1];
  const tooHard = Number.isFinite(top.rir) && top.rir < t.rir[0];

  let weight = top.weight, reps, reason;
  if (top.reps >= hi || (tooEasy && top.reps >= lo)) {
    if (step) { weight = round1(top.weight + step); reps = lo; reason = '目標回数の上限に届いた（または余力が多い）ので、重量を上げて回数を戻しましょう'; }
    else { reps = top.reps + 1; reason = '自重種目なので、回数を1回増やしましょう'; }
  } else if (top.reps < lo) {
    reps = lo;
    reason = '目標回数に届かなかったので、同じ重量で回数を目指しましょう';
  } else if (tooHard) {
    reps = top.reps;
    reason = '余力が目安より少ないので、同じ重量・回数でフォームを固めましょう';
  } else {
    reps = top.reps + 1;
    reason = '同じ重量で回数を1回増やしましょう';
  }
  return { last: top, lastDate: last.date, weight, reps, reason };
}

// 体重の週あたりの変化率（直近7日平均 vs その前の7日平均）
export function weightTrend(bodyweights, endDate = today()) {
  const avg = (from, to) => {
    const v = Object.entries(bodyweights).filter(([d]) => d >= from && d <= to).map(([, w]) => w);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const cur = avg(addDays(endDate, -6), endDate);
  const prev = avg(addDays(endDate, -13), addDays(endDate, -7));
  if (cur == null || prev == null) return { cur: cur && round1(cur), prev: null, rate: null };
  return { cur: round1(cur), prev: round1(prev), rate: round1(((cur - prev) / prev) * 100) };
}

export function latestWeight(state) {
  const dates = Object.keys(state.bodyweights).sort();
  return dates.length ? state.bodyweights[dates.at(-1)] : state.profile.weight || null;
}

export function weightAdvice(state, endDate = today()) {
  const p = state.profile;
  const trend = weightTrend(state.bodyweights, endDate);
  const range = WEIGHT_RATE[p.goal] || WEIGHT_RATE.health;
  const out = { trend, range, level: 'info', messages: [] };
  const w = latestWeight(state);
  const bmi = w && p.height ? round1(w / (p.height / 100) ** 2) : null;
  out.bmi = bmi;

  if (bmi != null && bmi < 18.5 && p.goal === 'fatloss') {
    out.level = 'warn';
    out.messages.push(`BMI が ${bmi} で「やせ」の範囲です。これ以上の減量はおすすめしません。体調に不安があれば医師に相談してください。`);
  }
  if (trend.rate == null) {
    out.messages.push('週の変化を出すには、2週間分の体重の記録が必要です（毎朝はかるのがおすすめ）。');
    return out;
  }
  if (trend.rate < range.lo) {
    out.level = 'warn';
    if (p.goal === 'fatloss') {
      out.messages.push(`週 ${trend.rate}% は速すぎるペースです。筋肉が落ちやすくなります。食事量を少し増やして、週 0.5〜1% を目安にしましょう。`);
      if (p.sex === 'female') out.messages.push('急な減量は生理不順や骨密度の低下につながることがあります。生理が止まった場合は医師に相談してください。');
    } else {
      out.messages.push(`週 ${trend.rate}% 減っています。目的（${GOALS[p.goal].short}）のためには、食事量を増やした方がよさそうです。`);
    }
  } else if (trend.rate > range.hi) {
    out.level = p.goal === 'fatloss' ? 'warn' : 'info';
    out.messages.push(p.goal === 'fatloss'
      ? `週 +${trend.rate}% と増えています。減量の目的なら、食事量を少し見直しましょう。`
      : `週 +${trend.rate}% は速いペースです。脂肪も増えやすいので、週 +0.5% 以内が目安です。`);
  } else {
    out.level = 'good';
    out.messages.push(`週 ${trend.rate > 0 ? '+' : ''}${trend.rate}% は、目的（${GOALS[p.goal].short}）に合ったペースです。`);
  }
  return out;
}

export function proteinTarget(state) {
  const w = latestWeight(state);
  if (!w) return null;
  const [a, b] = PROTEIN[state.profile.goal] || PROTEIN.health;
  return { weight: w, perKg: [a, b], grams: [Math.round(w * a), Math.round(w * b)] };
}

// 生理周期の何日目か（任意機能）
export function cycleDay(periods, date = today()) {
  const starts = (periods || []).filter((d) => d <= date).sort();
  if (!starts.length) return null;
  const day = daysBetween(starts.at(-1), date) + 1;
  return day <= 60 ? day : null;
}

// ---------- 今日のメニュー ----------
// 枠（slot）ごとに候補の種目を持ち、レベルや好みに合わせて1つ選ぶ
export const SLOTS = {
  chest: { label: '胸', muscle: 'chest', options: ['チェストプレス', '腕立て伏せ', 'ダンベルプレス', 'ベンチプレス'] },
  pulldown: { label: '背中（上から引く）', muscle: 'back', options: ['ラットプルダウン'] },
  row: { label: '背中（手前に引く）', muscle: 'back', options: ['シーテッドロウ', 'ダンベルロウ'] },
  press: { label: '肩', muscle: 'shoulders', options: ['ショルダープレス（マシン）', 'ダンベルショルダープレス'] },
  lateral: { label: '肩（横）', muscle: 'shoulders', options: ['サイドレイズ'] },
  legs: { label: '脚', muscle: 'quads', options: ['レッグプレス', 'スクワット'] },
  quadiso: { label: '太もも前', muscle: 'quads', options: ['レッグエクステンション'] },
  hinge: { label: '太もも裏・お尻', muscle: 'hamstrings', options: ['レッグカール', 'ルーマニアンデッドリフト'] },
  biceps: { label: '腕（力こぶ）', muscle: 'biceps', options: ['アームカール'] },
  triceps: { label: '腕（裏側）', muscle: 'triceps', options: ['トライセプスプッシュダウン'] },
  core: { label: '腹筋', muscle: 'abs', options: ['クランチ'] },
};
// 重さを扱える主要な種目の枠（中級者はここでフリーウェイトを優先する）
const COMPOUND_SLOTS = ['chest', 'row', 'press', 'legs', 'hinge'];

export const SPLITS = {
  full: { label: '全身', days: [['全身 A', ['chest', 'pulldown', 'legs', 'hinge', 'press', 'core']], ['全身 B', ['legs', 'row', 'chest', 'hinge', 'lateral', 'biceps']]] },
  upperlower: { label: '上半身・下半身', days: [['上半身', ['chest', 'pulldown', 'row', 'press', 'biceps', 'triceps']], ['下半身', ['legs', 'hinge', 'quadiso', 'core']]] },
  ppl: { label: '押す・引く・脚', days: [['押す日（胸・肩・腕の裏）', ['chest', 'press', 'lateral', 'triceps']], ['引く日（背中・力こぶ）', ['pulldown', 'row', 'biceps', 'core']], ['脚の日', ['legs', 'hinge', 'quadiso', 'core']]] },
};
export const MENU_STYLES = { auto: 'おまかせ（レベルに合わせる）', machine: 'マシン中心', free: 'フリーウェイト中心' };

export function splitFor(state) {
  const m = state.menu || {};
  if (m.split && m.split !== 'auto' && SPLITS[m.split]) return m.split;
  const days = state.profile.days || 3;
  return days >= 5 ? 'ppl' : days === 4 ? 'upperlower' : 'full';
}

const primaryMuscle = (ex) => Object.entries(ex.muscles || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
const isFree = (ex) => ex.type === 'dumbbell' || ex.type === 'barbell';

// 枠に入れられる種目の候補（標準の候補＋同じ部位を主に鍛える、自分で追加した種目）
export function slotCandidates(state, slotKey) {
  const slot = SLOTS[slotKey];
  const map = new Map(allExercises(state).map((e) => [e.name, e]));
  const equip = state.profile.equipment || 'gym';
  const listed = new Set(state.exercises.map((e) => e.name));
  const names = [...slot.options, ...state.exercises.filter((e) => e.custom && primaryMuscle(e) === slot.muscle).map((e) => e.name)];
  return [...new Set(names)]
    .map((n) => map.get(n))
    .filter((e) => e && listed.has(e.name) && (e.custom || !e.equip || e.equip.includes(equip)));
}

function rankCandidates(state, slotKey, list) {
  const exp = state.profile.experience;
  const style = state.menu?.style || 'auto';
  const score = (e) => {
    if (style === 'machine') return (e.type === 'machine' || e.type === 'cable' ? 0 : 10) + (e.level || 1);
    if (style === 'free') return (isFree(e) ? 0 : 10) + (e.custom ? -1 : 0);
    // おまかせ：初心者はマシンなど簡単な種目、中級者は主要な種目でフリーウェイト、上級者はフリーウェイト優先。
    // 中級者以上は、自分で追加した種目を優先する
    if (exp === 'beginner') return (e.custom ? 5 : 0) + (e.level || 1) * 2 + (e.type === 'machine' ? 0 : 1);
    const wantFree = exp === 'advanced' || COMPOUND_SLOTS.includes(slotKey);
    return (e.custom ? -5 : 0) + (wantFree ? (isFree(e) ? 0 : 3) : (e.level || 1));
  };
  return [...list].sort((a, b) => score(a) - score(b));
}

export function chooseForSlot(state, slotKey) {
  const list = rankCandidates(state, slotKey, slotCandidates(state, slotKey));
  if (!list.length) return null;
  const pinned = state.menu?.pins?.[slotKey];
  const pick = list.find((e) => e.name === pinned) || list[0];
  return { exercise: pick.name, alternatives: list.map((e) => e.name), pinned: pick.name === pinned };
}

export function buildMenu(state, date = today()) {
  const splitKey = splitFor(state);
  const split = SPLITS[splitKey];
  // これまでにトレーニングした日数で、今日がどの日かを決める
  const done = Object.keys(state.workouts).filter((d) => d < date && state.workouts[d].length).length;
  const [title, slots] = split.days[done % split.days.length];
  const p = state.profile;
  const avoid = new Set(p.avoid || []);
  let keys = slots.filter((k) => !avoid.has(SLOTS[k].muscle));

  const size = state.menu?.size || (p.experience === 'beginner' ? 5 : 6);
  keys = keys.slice(0, size);
  // 足りていない主要な部位が、分け方のどの日にも入っていないときだけ、1つ足す
  // （押す日・引く日のように別の日に回る部位は、その日に任せる）
  const inSplit = new Set(split.days.flatMap(([, ks]) => ks.map((k) => SLOTS[k].muscle)));
  const missing = weakPoints(state, addDays(date, -1)).weak.find((r) => !inSplit.has(r.muscle) && !avoid.has(r.muscle));
  const extra = missing && Object.keys(SLOTS).find((k) => SLOTS[k].muscle === missing.muscle);
  if (extra && !keys.includes(extra)) keys.push(extra);

  const t = targetsFor(p);
  const sets = p.experience === 'beginner' ? 2 : 3;
  const items = keys.map((k) => {
    const c = chooseForSlot(state, k);
    return c && { slot: k, label: SLOTS[k].label, ...c, sets, reps: t.reps };
  }).filter(Boolean);
  return { title, split: splitKey, items };
}
