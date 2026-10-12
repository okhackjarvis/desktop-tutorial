// 記録がまだない画面のイラスト（線画＋ブランドの赤をひとつだけ）
const NS = 'http://www.w3.org/2000/svg';

const ART = {
  // 床に置かれたバーベル：今日の記録がまだないとき
  barbell: `
    <path class="ill-soft" d="M18 98h124"/>
    <path d="M30 70h100"/>
    <rect x="22" y="52" width="10" height="36" rx="3"/>
    <rect x="34" y="44" width="12" height="52" rx="3" class="ill-accent-fill"/>
    <rect x="114" y="44" width="12" height="52" rx="3" class="ill-accent-fill"/>
    <rect x="128" y="52" width="10" height="36" rx="3"/>
    <path d="M60 70h40" stroke-width="5"/>
    <path class="ill-soft" d="M70 30v-8M80 26v-12M90 30v-8"/>`,

  // 右上がりの棒グラフ：分析するデータがないとき
  chart: `
    <path class="ill-soft" d="M24 98h112"/>
    <rect x="34" y="72" width="16" height="26" rx="3"/>
    <rect x="58" y="60" width="16" height="38" rx="3"/>
    <rect x="82" y="46" width="16" height="52" rx="3"/>
    <rect x="106" y="30" width="16" height="68" rx="3" class="ill-accent-fill"/>
    <path class="ill-accent" d="M30 52l26-14 22 8 34-24"/>
    <path class="ill-accent" d="M104 22h10v10"/>`,

  // チェックの付いたカレンダー：履歴がないとき
  calendar: `
    <rect x="34" y="24" width="92" height="76" rx="10"/>
    <path d="M34 44h92M58 16v14M102 16v14"/>
    <g class="ill-soft">
      <path d="M50 60h8M70 60h8M90 60h8M110 60h0M50 76h8M70 76h8M50 90h8"/>
    </g>
    <circle cx="106" cy="82" r="13" class="ill-accent-fill"/>
    <path d="M100 82l4 4 8-8" stroke="#fff" stroke-width="3"/>`,

  // 点線の折れ線：グラフにする記録がないとき
  line: `
    <path class="ill-soft" d="M24 96h112M24 96V24"/>
    <path d="M30 84l24-14 20 6 24-22 30-16" stroke-dasharray="2 7"/>
    <circle cx="128" cy="38" r="7" class="ill-accent-fill"/>
    <circle cx="128" cy="38" r="14" class="ill-accent" stroke-width="2"/>`,

  // 体重計：体重の記録がないとき
  scale: `
    <rect x="36" y="30" width="88" height="70" rx="16"/>
    <path d="M58 54a22 22 0 0 1 44 0"/>
    <path class="ill-accent" d="M80 54l10-12" stroke-width="4"/>
    <circle cx="80" cy="54" r="3" class="ill-accent-fill"/>
    <path class="ill-soft" d="M52 86h56"/>`,
};

export function illustration(name, text, sub) {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 160 120');
  svg.setAttribute('class', 'ill');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ART[name] || '';
  const p = document.createElement('p');
  p.className = 'empty-title';
  p.textContent = text;
  wrap.append(svg, p);
  if (sub) {
    const s = document.createElement('p');
    s.className = 'empty-sub';
    s.textContent = sub;
    wrap.append(s);
  }
  return wrap;
}
