/* 图表层（移植自 002 charts.js，纯 SVG/DOM，无第三方库）
 * 规范：单系列统一 slot-1 蓝；细标记（条厚≤24px、线宽 2px、数据端 4px 圆角）；
 * 悬浮/聚焦 tooltip（命中区大于标记本身，≥24px）；文案一律 textContent/esc，不拼 HTML。
 */
import { centsToYuanText } from '../lib/money';
import { WEEK_CN, pad, weekdayOf } from '../lib/date';
import type { CategorySumDTO, DailyPointDTO } from '../lib/types';

const esc = (s: string): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/* 金额 → 紧凑刻度文本：≥1万 用「x.x万」，其余原值（千元内不加 k，符合中文阅读） */
function compactYuan(yuan: number): string {
  if (yuan >= 10000) return (Math.round(yuan / 1000) / 10) + '万';
  if (yuan >= 1000) return Math.round(yuan).toLocaleString('zh-CN');
  return String(Math.round(yuan * 10) / 10);
}
/* 向上取整到「好看」的刻度 */
function niceCeil(v: number): number {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) { if (m * pow >= v) return m * pow; }
  return 10 * pow;
}

/* ---------- 共享 tooltip（值为主、标签为辅） ---------- */
const tip = (): HTMLElement => document.getElementById('chart-tip')!;
function showTip(x: number, y: number, label: string, valueHtml: string): void {
  const el = tip();
  el.innerHTML = `<div class="t-label">${esc(label)}</div><div class="t-val">${valueHtml}</div>`;
  el.hidden = false;
  const r = el.getBoundingClientRect();
  let left = x + 12, top = y - r.height - 10;
  if (left + r.width > innerWidth - 8) left = x - r.width - 12;
  if (top < 8) top = y + 16;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
export function hideTip(): void { tip().hidden = true; }

/* ---------- 1. 分类占比：HTML 条形列表（标签与数值可见，天然无障碍） ---------- */
export function renderCategoryBars(hostEl: HTMLElement, items: CategorySumDTO[], onPick?: (it: CategorySumDTO) => void): void {
  hostEl.textContent = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.style.padding = '20px 0';
    p.textContent = '本月暂无支出记录';
    hostEl.appendChild(p);
    return;
  }
  const max = Math.max(...items.map((i) => i.cents));
  for (const it of items) {
    const row = document.createElement(items.length && onPick ? 'button' : 'div');
    row.className = 'cat-row';
    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = `${it.icon} ${it.name}`;
    const track = document.createElement('span');
    track.className = 'track';
    const rail = document.createElement('span');
    rail.className = 'rail' + (max === 0 ? ' zero' : '');
    const fill = document.createElement('i');
    fill.className = 'fill';
    fill.style.width = max ? String(Math.max(2, (it.cents / max) * 100)) + '%' : '0%';
    rail.appendChild(fill);
    const v = document.createElement('span');
    v.className = 'v';
    const yuan = document.createTextNode('¥' + centsToYuanText(it.cents));
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = Math.round(it.pct * 100) + '%';
    v.appendChild(yuan); v.appendChild(pct);
    track.appendChild(rail); track.appendChild(v);
    row.appendChild(name); row.appendChild(track);
    if (onPick) row.addEventListener('click', () => onPick(it));
    hostEl.appendChild(row);
  }
}

/* ---------- 2. 每日支出柱状图 ---------- */
const COL = { W: 320, H: 120, AXIS: 20, PAD_L: 6, PAD_R: 6 };

export function renderDailyColumns(hostEl: HTMLElement, series: DailyPointDTO[], monthKey: string, weekendNote: boolean): void {
  hostEl.textContent = '';
  const { W, H, AXIS, PAD_L, PAD_R } = COL;
  const n = series.length;
  const slot = (W - PAD_L - PAD_R) / n;
  const barW = Math.min(24, Math.max(2, slot - 2));      // 相邻列间 ≥2px 表面留白
  const maxC = niceCeil(Math.max(...series.map((s) => s.cents), 1) / 100);
  const y = (v: number) => H - (v / maxC) * (H - 12);
  const mid = maxC / 2;
  const labelDays = new Set([1, 5, 10, 15, 20, 25, n]);

  let marks = '', hits = '', ticks = '';
  ticks += `<line class="grid-line" x1="${PAD_L}" y1="${y(mid)}" x2="${W - PAD_R}" y2="${y(mid)}"/>`;
  ticks += `<text class="tick-text" x="${W - PAD_R}" y="${y(mid) - 3}" text-anchor="end">${compactYuan(mid)}</text>`;
  ticks += `<text class="tick-text" x="${W - PAD_R}" y="${y(maxC) - 3}" text-anchor="end">${compactYuan(maxC)}</text>`;

  series.forEach((s, i) => {
    const cx = PAD_L + slot * i + slot / 2;
    const x = cx - barW / 2;
    const h = s.cents > 0 ? Math.max(2, H - y(s.cents / 100)) : 0;
    const yTop = H - h;
    if (s.cents > 0) {
      marks += `<rect class="mark" data-i="${i}" x="${x}" y="${yTop}" width="${barW}" height="${h}" rx="4" ry="4" fill="${s.weekend ? 'var(--accent-deep)' : 'var(--accent)'}"/>
                <rect x="${x}" y="${H}" width="${barW}" height="1.6" fill="var(--surface)"/>`;
    }
    if (s.weekend) marks += `<circle cx="${cx}" cy="${H + 6}" r="1.5" fill="var(--baseline)"/>`; // 周末的非颜色线索
    if (s.isToday) marks += `<text class="tick-text" x="${cx}" y="${H + AXIS - 2}" text-anchor="middle" fill="var(--accent)" font-weight="700">今</text>`;
    else if (labelDays.has(s.day)) marks += `<text class="tick-text" x="${cx}" y="${H + AXIS - 2}" text-anchor="middle">${s.day}</text>`;

    const yuan = centsToYuanText(s.cents);
    const wd = WEEK_CN[weekdayOf(`${monthKey}-${pad(s.day)}`)] || '';
    hits += `<rect class="hit" data-i="${i}" x="${PAD_L + slot * i}" y="0" width="${slot}" height="${H + AXIS}" tabindex="0" role="img"
              aria-label="${s.day}日${wd}支出${yuan}元"/>`;
  });

  const svg = `<svg viewBox="0 0 ${W} ${H + AXIS}" aria-label="每日支出柱状图">
    ${ticks}<line class="axis-line" x1="${PAD_L}" y1="${H}" x2="${W - PAD_R}" y2="${H}"/>${marks}${hits}</svg>`;
  hostEl.insertAdjacentHTML('beforeend', svg);
  if (weekendNote) {
    const note = document.createElement('p');
    note.className = 'chart-note';
    note.textContent = '深色列为周末（列下圆点同示），悬停或聚焦查看金额';
    hostEl.appendChild(note);
  }
  bindBarTips(hostEl, series, monthKey);
}

function bindBarTips(hostEl: HTMLElement, series: DailyPointDTO[], monthKey: string): void {
  hostEl.querySelectorAll('.hit').forEach((hitEl) => {
    const i = Number((hitEl as SVGElement).dataset.i);
    const s = series[i];
    if (!s) return;
    const wd = WEEK_CN[weekdayOf(`${monthKey}-${pad(s.day)}`)];
    const html = `<span class="t-key" style="background:${s.weekend ? '#1c5cab' : '#2a78d6'}"></span>¥${centsToYuanText(s.cents)}${s.cents === 0 ? '<br>（未记支出）' : ''}`;
    const show = () => {
      const r = hitEl.getBoundingClientRect();
      showTip(r.left + r.width / 2, r.top + 20, `${s.day}日 · ${wd}`, html);
      hostEl.querySelectorAll('.mark').forEach((m) => m.classList.toggle('dim', Number((m as SVGElement).dataset.i) !== i));
    };
    const hide = () => { hideTip(); hostEl.querySelectorAll('.mark').forEach((m) => m.classList.remove('dim')); };
    hitEl.addEventListener('pointermove', show);
    hitEl.addEventListener('pointerleave', hide);
    hitEl.addEventListener('focus', () => {
      const r = hitEl.getBoundingClientRect();
      showTip(r.left + r.width / 2, r.top + 20, `${s.day}日 · ${wd}`, html);
    });
    hitEl.addEventListener('blur', hide);
  });
}

/* 每日趋势的表格视图（无障碍兜底） */
export function dailyTable(series: DailyPointDTO[], monthKey: string): string {
  const rows = series.filter((s) => s.cents > 0)
    .map((s) => `<tr><td>${s.day}日${WEEK_CN[weekdayOf(`${monthKey}-${pad(s.day)}`)]}${s.weekend ? '（周末）' : ''}</td><td>¥${centsToYuanText(s.cents)}</td></tr>`)
    .join('');
  return `<table class="chart-table"><thead><tr><th>日期</th><th>支出</th></tr></thead><tbody>${rows || '<tr><td colspan="2">本月暂无支出</td></tr>'}</tbody></table>`;
}

/* ---------- 3. 近 6 个月支出折线图（crosshair + tooltip） ---------- */
const LINE = { W: 320, H: 118, AXIS: 20, PAD_L: 10, PAD_R: 44 };

export function renderSixMonthLine(hostEl: HTMLElement, points: { month: string; cents: number }[]): void {
  hostEl.textContent = '';
  const { W, H, AXIS, PAD_L, PAD_R } = LINE;
  const maxC = niceCeil(Math.max(...points.map((p) => p.cents), 1) / 100);
  const y = (v: number) => H - (v / maxC) * (H - 14);
  const xs = (i: number) => PAD_L + (W - PAD_L - PAD_R) * (points.length === 1 ? 0 : i / (points.length - 1));
  const mid = maxC / 2;
  const last = points[points.length - 1]!;
  const maxIdx = points.reduce((mi, p, i) => (p.cents > points[mi]!.cents ? i : mi), 0);

  let grid = `<line class="grid-line" x1="${PAD_L}" y1="${y(mid)}" x2="${W - PAD_R + 30}" y2="${y(mid)}"/>
    <text class="tick-text" x="${W - 2}" y="${y(mid) - 3}" text-anchor="end">${compactYuan(mid)}</text>
    <text class="tick-text" x="${W - 2}" y="${y(maxC) - 3}" text-anchor="end">${compactYuan(maxC)}</text>`;
  let pts = '', labels = '';
  points.forEach((p, i) => {
    const cx = xs(i), cy = y(p.cents / 100);
    pts += `<circle class="mark" data-i="${i}" cx="${cx}" cy="${cy}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
    labels += `<text class="tick-text" x="${cx}" y="${H + AXIS - 4}" text-anchor="middle">${Number(p.month.slice(5))}月</text>`;
  });
  /* 选择性直接标注：最近一个月（终点）与峰值 */
  const endLabel = `<text x="${xs(points.length - 1) + 8}" y="${y(last.cents / 100) + 4}" font-size="11" font-weight="600" fill="var(--ink-2)">¥${compactYuan(last.cents / 100)}</text>`;
  const maxLabel = maxIdx !== points.length - 1 && points[maxIdx]!.cents > 0
    ? `<text x="${xs(maxIdx)}" y="${y(points[maxIdx]!.cents / 100) - 10}" font-size="11" fill="var(--ink-2)" text-anchor="middle">¥${compactYuan(points[maxIdx]!.cents / 100)}</text>` : '';

  const svg = `<svg viewBox="0 0 ${W} ${H + AXIS}" aria-label="近6个月支出趋势折线图">
    ${grid}<line class="axis-line" x1="${PAD_L}" y1="${H}" x2="${W - PAD_R + 30}" y2="${H}"/>
    <line id="xhair" x1="0" y1="6" x2="0" y2="${H}" stroke="var(--baseline)" stroke-width="1" visibility="hidden"/>
    <polyline points="${points.map((p, i) => `${xs(i)},${y(p.cents / 100)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts}${labels}${maxLabel}${endLabel}
    <rect class="hit" x="${PAD_L - 8}" y="0" width="${W - PAD_L + 8}" height="${H + AXIS}" fill="transparent"/>
  </svg>`;
  hostEl.insertAdjacentHTML('beforeend', svg);

  /* crosshair 吸附最近月份；键盘访问走表格视图 */
  const svgEl = hostEl.querySelector('svg');
  const hit = svgEl?.querySelector('.hit');
  const xhair = svgEl?.querySelector('#xhair');
  const marks = [...(svgEl?.querySelectorAll('.mark') || [])];
  if (!svgEl || !hit || !xhair) return;
  const activate = (clientX: number, clientY: number) => {
    const box = svgEl.getBoundingClientRect();
    const vx = (clientX - box.left) / box.width * W;
    let best = 0, bd = Infinity;
    points.forEach((_p, i) => { const d = Math.abs(xs(i) - vx); if (d < bd) { bd = d; best = i; } });
    xhair.setAttribute('x1', String(xs(best))); xhair.setAttribute('x2', String(xs(best)));
    xhair.setAttribute('visibility', 'visible');
    marks.forEach((m) => m.classList.toggle('dim', Number((m as SVGElement).dataset.i) !== best));
    const p = points[best]!;
    showTip(clientX, clientY, `${p.month} 支出`, `¥${centsToYuanText(p.cents)}`);
  };
  const deactivate = () => {
    xhair.setAttribute('visibility', 'hidden');
    marks.forEach((m) => m.classList.remove('dim'));
    hideTip();
  };
  hit.addEventListener('pointermove', (ev) => activate((ev as PointerEvent).clientX, (ev as PointerEvent).clientY));
  hit.addEventListener('pointerleave', deactivate);
}

/* 月度对比的表格视图 */
export function sixMonthTable(points: { month: string; cents: number }[]): string {
  const rows = points.map((p) => `<tr><td>${p.month}</td><td>¥${centsToYuanText(p.cents)}</td></tr>`).join('');
  return `<table class="chart-table"><thead><tr><th>月份</th><th>支出</th></tr></thead><tbody>${rows}</tbody></table>`;
}
