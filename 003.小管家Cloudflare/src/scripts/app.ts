/* UI 层（移植自 002 app.js）：四个 Tab + 弹层交互
 * 数据全部来自云端 API（见 store.ts）；口径与 V1.0.2 一致。
 */
import * as S from './store';
import { ApiFail } from './store';
import * as C from './charts';
import { compressImage, showLightbox } from './photos';
import { centsToYuanText, parseAmountToCents } from '../lib/money';
import { WEEK_CN, monthShift, weekdayOf, currentMonth } from '../lib/date';
import type { CategoryDTO, RecycleItemDTO, TxDTO, TxType, TxQuery } from '../lib/types';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

/* ---------- 通用工具 ---------- */
type Child = Node | string | null | undefined;
function el(tag: string, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v as EventListener);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  const fragment = document.createDocumentFragment();
  for (const c of children.flat() as (Node | string | null | undefined)[]) {
    if (c instanceof Node) {
      fragment.appendChild(c);
    } else if (typeof c === 'string') {
      fragment.appendChild(document.createTextNode(c));
    } else if (c != null) {
      fragment.appendChild(document.createTextNode(String(c)));
    }
  }
  node.appendChild(fragment);
  return node;
}
const yuan = centsToYuanText;
const monthLabel = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
const dateLabel = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8))}日 · ${WEEK_CN[weekdayOf(d)]}`;

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string, ms = 1500): void {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function errMsg(e: unknown): string {
  if (e instanceof ApiFail) {
    if (e.status === 401) { location.href = '/login'; return '登录已过期'; }
    return e.message;
  }
  console.error(e);
  return '网络异常，请稍后再试';
}

/* ---------- 弹层 ---------- */
function openSheet(contentEl: HTMLElement, opts: { center?: boolean } = {}): void {
  const sheet = $('sheet');
  sheet.className = 'sheet' + (opts.center ? ' confirm-wrap' : '');
  sheet.textContent = '';
  if (!opts.center) sheet.appendChild(el('div', { class: 'grab' }));
  sheet.appendChild(contentEl);
  $('overlay').hidden = false;
  sheet.hidden = false;
}
function closeSheet(): void {
  $('overlay').hidden = true;
  $('sheet').hidden = true;
  C.hideTip();
}
function confirmDialog({ title, text, okText = '确定', danger = false, onOk }: {
  title: string; text: string; okText?: string; danger?: boolean; onOk: () => void;
}): void {
  const box = el('div', { class: 'confirm' },
    el('h3', { class: 'sheet-title', text: title }),
    el('p', { text }),
    el('div', { class: 'sheet-actions' },
      el('button', { class: 'btn ghost plain', text: '取消', onclick: closeSheet }),
      el('button', {
        class: 'btn ' + (danger ? 'danger-btn' : 'primary'), text: okText,
        onclick: () => { closeSheet(); onOk(); },
      })));
  openSheet(box, { center: true });
}
function promptSheet({ title, label, value = '', placeholder = '', onOk }: {
  title: string; label: string; value?: string; placeholder?: string; onOk: (v: string) => void;
}): void {
  const input = el('input', { type: 'text', value, placeholder, maxlength: '12' }) as HTMLInputElement;
  const box = el('div', {},
    el('h3', { class: 'sheet-title', text: title }),
    el('div', { class: 'field' }, el('label', { text: label }), input),
    el('button', {
      class: 'btn primary wide', text: '保存',
      onclick: () => { const v = input.value.trim(); if (!v) return toast('请输入内容'); closeSheet(); onOk(v); },
    }));
  openSheet(box);
  input.focus();
}

/* ---------- 全局状态 ---------- */
const PAGE_SIZE = 40;
const state = {
  tab: 'detail',
  detailMonth: currentMonth(),
  statsMonth: currentMonth(),
  filter: { type: '', categoryId: '', accountId: '', supplierId: '', keyword: '', start: '', end: '' },
  page: 1,
  segDaily: 'chart',
  segTrend: 'chart',
};

function filterActive(): boolean {
  const f = state.filter;
  return !!(f.type || f.categoryId || f.accountId || f.supplierId || f.keyword || f.start || f.end);
}

/* ================= Tab1 明细 ================= */
async function renderDetail(): Promise<void> {
  const f = state.filter;
  const custom = !!(f.start || f.end);
  $('d-month').textContent = custom ? `${f.start || '…'} 至 ${f.end || '…'}` : monthLabel(state.detailMonth);
  ($('d-prev') as HTMLButtonElement).disabled = custom;
  ($('d-next') as HTMLButtonElement).disabled = custom || state.detailMonth >= S.todayStr().slice(0, 7);
  $('d-filter').classList.toggle('active', filterActive());
  ($('d-filter-dot') as HTMLElement).hidden = !filterActive();

  /* 汇总卡（当月/所选范围，不随筛选项变化，保持口径单一） */
  const args: TxQuery = {};
  if (!custom) args.month = state.detailMonth;
  else {
    if (f.start) args.start = f.start;
    if (f.end) args.end = f.end;
  }

  let result;
  try {
    result = await S.queryTransactions(args as TxQuery);
  } catch (e) { return toast(errMsg(e)); }

  $('d-summary').replaceChildren(
    el('div', {}, el('div', { class: 'lbl', text: '本月支出' }),
      el('div', { class: 'val' }, el('span', { class: 'sign', text: '¥' }), yuan(result.expense))),
    el('div', {}, el('div', { class: 'lbl', text: '本月收入' }),
      el('div', { class: 'val small' }, el('span', { class: 'sign', text: '¥' }), yuan(result.income))),
    el('div', {}, el('div', { class: 'lbl', text: '本月结余' }),
      el('div', { class: 'val small' }, el('span', { class: 'sign', text: '¥' }), yuan(result.income - result.expense))));

  renderList(result.items);
}

function renderList(all: TxDTO[]): void {
  const host = $('d-list');
  host.textContent = '';
  const show = all.slice(0, state.page * PAGE_SIZE);
  let lastDate: string | null = null;
  let group: HTMLElement | null = null;

  for (const t of show) {
    if (t.date !== lastDate) {
      lastDate = t.date;
      group = el('div', { class: 'day-group' });
      const dayList = all.filter((x) => x.date === t.date);
      let de = 0, di = 0;
      for (const x of dayList) x.type === 'expense' ? de += x.amount : di += x.amount;
      const sub = el('span', { class: 'sub' });
      if (de) sub.appendChild(el('span', { class: 'out', text: `支 ¥${yuan(de)}` }));
      if (di) sub.appendChild(el('span', { class: 'in', text: `收 ¥${yuan(di)}` }));
      group.appendChild(el('div', { class: 'day-head' },
        el('span', { text: dateLabel(t.date) }), sub));
      host.appendChild(group);
    }
    const c = S.findCategory(t.categoryId);
    const a = S.findAccount(t.accountId);
    const sup = S.findSupplier(t.supplierId);
    const item = el('button', { class: 'bill-item', onclick: () => void openEditSheet(t.id) },
      el('span', { class: 'ico', text: c ? c.icon : '❓' }),
      el('span', { class: 'mid' },
        el('div', { class: 'cat', text: c ? c.name : '未知分类' }),
        el('div', { class: 'meta', text: [t.note, sup ? sup.name : '', a ? a.name : ''].filter(Boolean).join(' · ') || ' ' })),
      t.photoCount ? el('span', { class: 'photo-flag', text: '📷', title: '有图片附件' }) : null,
      el('span', { class: `amt ${t.type === 'expense' ? 'out' : 'in'}`, text: `${t.type === 'expense' ? '−' : '+'}¥${yuan(t.amount)}` }));
    group!.appendChild(item);
  }
  $('d-empty').hidden = all.length > 0;
  ($('d-more') as HTMLElement).hidden = show.length >= all.length;
}

/* ---------- 筛选面板 ---------- */
function openFilterSheet(): void {
  const f = state.filter;
  const typeSel = el('select', {},
    el('option', { value: '', text: '全部类型' }),
    el('option', { value: 'expense', text: '仅支出', ...(f.type === 'expense' ? { selected: true } : {}) }),
    el('option', { value: 'income', text: '仅收入', ...(f.type === 'income' ? { selected: true } : {}) }));
  const catSel = el('select', {}, el('option', { value: '', text: '全部分类' }));
  for (const type of ['expense', 'income'] as const) {
    const og = el('optgroup', { label: type === 'expense' ? '支出' : '收入' });
    for (const c of S.allCategories(type)) {
      og.appendChild(el('option', { value: c.id, text: `${c.icon} ${c.name}${c.status === 'inactive' ? '（已停用）' : ''}`, ...(f.categoryId === c.id ? { selected: true } : {}) }));
    }
    catSel.appendChild(og);
  }
  const accSel = el('select', {}, el('option', { value: '', text: '全部账户' }));
  for (const a of S.allAccounts()) accSel.appendChild(el('option', { value: a.id, text: `${a.icon} ${a.name}`, ...(f.accountId === a.id ? { selected: true } : {}) }));
  const supSel = el('select', {}, el('option', { value: '', text: '全部供应商' }));
  for (const s of S.allSuppliers()) supSel.appendChild(el('option', { value: s.id, text: `${s.name}${s.status === 'inactive' ? '（已停用）' : ''}`, ...(f.supplierId === s.id ? { selected: true } : {}) }));
  const kw = el('input', { type: 'text', value: f.keyword, placeholder: '搜索备注关键词', maxlength: '20' });
  const start = el('input', { type: 'date', value: f.start, max: S.todayStr() });
  const end = el('input', { type: 'date', value: f.end, max: S.todayStr() });

  const apply = () => {
    if ((start as HTMLInputElement).value && (end as HTMLInputElement).value
      && (start as HTMLInputElement).value > (end as HTMLInputElement).value) return toast('开始日期不能晚于结束日期');
    state.filter = {
      type: (typeSel as unknown as HTMLSelectElement | null)?.value || '',
      categoryId: (catSel as unknown as HTMLSelectElement | null)?.value || '',
      accountId: (accSel as unknown as HTMLSelectElement | null)?.value || '',
      supplierId: (supSel as unknown as HTMLSelectElement | null)?.value || '',
      keyword: (kw as HTMLInputElement).value.trim(),
      start: (start as HTMLInputElement).value,
      end: (end as HTMLInputElement).value,
    };
    state.page = 1; closeSheet(); void renderDetail();
  };
  const reset = () => {
    state.filter = { type: '', categoryId: '', accountId: '', supplierId: '', keyword: '', start: '', end: '' };
    state.page = 1; closeSheet(); void renderDetail();
  };

  const box = el('div', {},
    el('h3', { class: 'sheet-title', text: '筛选账单' }),
    el('div', { class: 'field' }, el('label', { text: '类型' }), typeSel),
    el('div', { class: 'field' }, el('label', { text: '分类' }), catSel),
    el('div', { class: 'field' }, el('label', { text: '账户' }), accSel),
    el('div', { class: 'field' }, el('label', { text: '供应商' }), supSel),
    el('div', { class: 'field' }, el('label', { text: '备注关键词' }), kw),
    el('div', { class: 'field' }, el('label', { text: '自定义时间范围（可选，留空则按当前月份）' }), start, el('div', { style: 'height:6px' }), end),
    el('div', { class: 'sheet-actions' },
      el('button', { class: 'btn ghost plain', text: '重置', onclick: reset }),
      el('button', { class: 'btn primary', text: '应用', onclick: apply })));
  openSheet(box);
}

/* ================= 记账 / 编辑 ================= */

/** 待保存的图片：existing（已上传，存 id）或 new（本地 Blob，保存时上传） */
interface PhotoItem { id?: string; blob?: Blob; url: string }

async function openEditSheet(txId: string | null): Promise<void> {
  const tx = txId ? await S.getTransaction(txId).catch(() => null) : null;

  const cur = {
    type: tx ? tx.type : 'expense' as TxType,
    amount: tx ? (tx.amount / 100).toFixed(2) : '',
    categoryId: tx ? tx.categoryId : null,
    accountId: tx ? tx.accountId : S.findAccountFirstId(),
    date: tx ? tx.date : S.todayStr(),
    note: tx ? tx.note : '',
  };

  /* 图片附件（≤5 张）：已有图从服务端取，新图为本地 Blob */
  const photos: PhotoItem[] = [];
  if (txId) {
    try {
      for (const p of await S.photosOf(txId)) photos.push({ id: p.id, url: S.photoUrl(p.id) });
    } catch { /* 图片加载失败不阻塞编辑 */ }
  }
  if (!cur.categoryId) cur.categoryId = S.lastUsedCategory(cur.type) || S.activeCategories(cur.type)[0]?.id || null;

  const errEl = el('div', { class: 'amount-err' });
  const amountInput = el('input', {
    type: 'number', inputmode: 'decimal', step: '0.01', min: '0.01', placeholder: '0.00',
    value: cur.amount,
  }) as HTMLInputElement;
  const catGrid = el('div', { class: 'cat-grid' });
  const accRow = el('div', { class: 'chip-row' });
  const saveBtn = el('button', { class: 'btn primary', text: '保存', onclick: () => void saveOne() }) as HTMLButtonElement;

  function renderCats(): void {
    catGrid.replaceChildren();
    for (const c of S.activeCategories(cur.type)) {
      catGrid.appendChild(el('button', {
        class: 'cat-cell', 'aria-pressed': String(cur.categoryId === c.id),
        onclick: () => { cur.categoryId = c.id; renderCats(); },
      }, el('span', { class: 'c-ico', text: c.icon }), el('span', { text: c.name })));
    }
  }
  function renderAccounts(): void {
    accRow.replaceChildren();
    for (const a of S.allAccounts()) {
      accRow.appendChild(el('button', {
        class: 'chip', 'aria-pressed': String(cur.accountId === a.id),
        onclick: () => { cur.accountId = a.id; renderAccounts(); },
      }, `${a.icon} ${a.name}`));
    }
  }
  /* 供应商：自动补全，新名称保存时自动创建 */
  const supplierInput = el('input', {
    type: 'text', maxlength: '12', list: 'xgj-supplier-list',
    placeholder: '可选，如：全家 / 美团 / 京东',
    value: tx ? (S.findSupplier(tx.supplierId)?.name || '') : '',
  }) as HTMLInputElement;
  const supplierDl = el('datalist', { id: 'xgj-supplier-list' });
  for (const s of S.activeSuppliers()) supplierDl.appendChild(el('option', { value: s.name }));

  /* 图片附件：≤5 张，自动压缩 */
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' }) as HTMLInputElement;
  const photoLabel = el('label', { text: '' });
  const thumbs = el('div', { class: 'thumb-row' });
  function renderThumbs(): void {
    photoLabel.textContent = `图片附件 ${photos.length}/5（自动压缩，最长边 1280px）`;
    const cells = photos.map((p, i) => el('span', { class: 'thumb' },
      el('img', { src: p.url, alt: `附件 ${i + 1}`, onclick: () => showLightbox(p.url) }),
      el('button', { class: 'thumb-del', text: '×', 'aria-label': '删除这张图', onclick: () => { photos.splice(i, 1); renderThumbs(); } })));
    if (photos.length < 5) cells.push(el('button', { class: 'thumb add', text: '＋', 'aria-label': '添加图片', onclick: () => fileInput.click() }));
    thumbs.replaceChildren(...cells);
  }
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    for (const f of files) {
      if (photos.length >= 5) { toast('每笔最多 5 张图片'); break; }
      if (!f.type.startsWith('image/')) { toast('仅支持图片文件'); continue; }
      if (f.size > 20 * 1024 * 1024) { toast('单张原图不能超过 20MB'); continue; }
      try {
        const blob = await compressImage(f);
        photos.push({ blob, url: URL.createObjectURL(blob) });
        renderThumbs();
      } catch { toast('这张图处理失败，已跳过'); }
    }
  });
  renderThumbs();

  function validate(): number | null {
    const cents = parseAmountToCents(amountInput.value);
    if (amountInput.value && !cents) errEl.textContent = '金额需大于 0、最多两位小数，且不超过 99,999,999';
    else errEl.textContent = '';
    saveBtn.disabled = !cents;
    return cents;
  }
  amountInput.addEventListener('input', validate);

  async function persist(): Promise<string | null> {
    const cents = parseAmountToCents(amountInput.value);
    if (!cents) return null;
    const supplierName = supplierInput.value.trim().slice(0, 12);
    const supplierId = await S.ensureSupplier(supplierName);
    const input = {
      type: cur.type, amountYuan: (cents / 100).toFixed(2), categoryId: cur.categoryId!,
      accountId: cur.accountId!, date: cur.date, note: (noteInput as HTMLInputElement).value.trim(), supplierId,
    };
    const saved = tx ? await S.updateTransaction(tx.id, input) : await S.addTransaction(input);
    /* 图片差量同步：新图上传，已删图移除 */
    const keepIds = new Set(photos.map((p) => p.id).filter(Boolean) as string[]);
    if (txId) {
      for (const p of await S.photosOf(txId)) {
        if (!keepIds.has(p.id)) await S.deletePhoto(p.id);
      }
    }
    for (const p of photos) {
      if (p.blob) await S.uploadPhoto(saved.id, p.blob);
    }
    return saved.id;
  }
  async function saveOne(): Promise<void> {
    if (!cur.categoryId) return toast('请选择分类');
    saveBtn.disabled = true;
    try {
      const id = await persist();
      if (!id) return;
      closeSheet();
      toast('已记录');
      await checkBudgetAlert();
    } catch (e) { toast(errMsg(e)); }
    finally { saveBtn.disabled = false; }
  }

  const noteInput = el('input', { type: 'text', maxlength: '50', placeholder: '备注（可选）', value: cur.note });
  const noteCount = el('span', { class: 'card-sub', text: `${cur.note.length}/50` });
  noteInput.addEventListener('input', () => { noteCount.textContent = `${(noteInput as HTMLInputElement).value.length}/50`; });

  const actions = tx
    ? el('div', { class: 'sheet-actions' },
        el('button', { class: 'btn danger-btn', text: '删除', onclick: () => confirmDialog({ title: '删除这笔账单？', text: '删除后可在「我的 → 回收站」30 天内恢复。', okText: '删除', danger: true, onOk: async () => { try { await S.softDeleteTransaction(tx.id); closeSheet(); toast('已移入回收站'); } catch (e) { toast(errMsg(e)); } } }) }),
        saveBtn)
    : el('div', { class: 'sheet-actions' },
        el('button', {
          class: 'btn ghost plain', text: '再记一笔',
          onclick: async () => {
            if (!cur.categoryId) return toast('请选择分类');
            saveBtn.disabled = true;
            try {
              const id = await persist();
              if (!id) return;
              amountInput.value = ''; (noteInput as HTMLInputElement).value = '';
              for (const p of photos) if (!p.id) URL.revokeObjectURL(p.url);
              photos.length = 0; renderThumbs(); validate();
              toast('已记录，可继续记');
              await checkBudgetAlert();
            } catch (e) { toast(errMsg(e)); }
            finally { saveBtn.disabled = false; }
          },
        }), saveBtn);

  const box = el('div', {},
    el('h3', { class: 'sheet-title', text: tx ? '编辑账单' : '记一笔' }),
    el('div', { class: 'seg block', style: 'margin-bottom:14px' },
      el('button', { 'aria-pressed': 'true', text: '支出', onclick: () => switchType('expense') }),
      el('button', { 'aria-pressed': 'false', text: '收入', onclick: () => switchType('income') })),
    el('div', { class: 'amount-input' }, el('span', { class: 'yen', text: '¥' }), amountInput),
    errEl,
    el('div', { class: 'field', style: 'margin-top:12px' }, el('label', { text: '分类' }), catGrid),
    el('div', { class: 'field' }, el('label', { text: '支付方式' }), accRow),
    el('div', { class: 'field' }, el('label', { text: '供应商（可选）' }), supplierInput, supplierDl),
    el('div', { class: 'field' }, photoLabel, thumbs, fileInput),
    el('div', { class: 'field' }, el('label', { text: '日期（不可选未来）' }),
      el('input', { type: 'date', value: cur.date, max: S.todayStr(), onchange: (e: Event) => { const t = e.target as HTMLInputElement | null; if (t) cur.date = t.value; } })),
    el('div', { class: 'field' }, el('label', { text: '备注' }), noteInput, el('div', { style: 'text-align:right' }, noteCount)),
    actions);

  function switchType(type: TxType): void {
    cur.type = type;
    cur.categoryId = S.lastUsedCategory(type) || S.activeCategories(type)[0]?.id || null;
    box.querySelectorAll('.seg.block button').forEach((b, i) =>
      b.setAttribute('aria-pressed', String((i === 0) === (type === 'expense'))));
    renderCats();
  }
  renderCats(); renderAccounts(); validate();
  openSheet(box);
  setTimeout(() => amountInput.focus(), 60);
}

/* ================= Tab2 统计 ================= */
function deltaTile(lbl: string, cur: number, prev: number, upIsGood: boolean): HTMLElement {
  let deltaEl: HTMLElement;
  if (prev === 0 && cur === 0) deltaEl = el('div', { class: 'delta', text: '与上月持平' });
  else if (prev === 0) deltaEl = el('div', { class: 'delta', text: '上月无数据' });
  else {
    const pct = Math.round((cur - prev) / prev * 100);
    const up = pct >= 0;
    const good = upIsGood ? up : !up;
    deltaEl = el('div', { class: `delta ${pct === 0 ? '' : good ? 'good' : 'bad'}`, text: `${up ? '▲' : '▼'} ${Math.abs(pct)}% 比上月` });
  }
  return el('div', { class: 'stat-tile' },
    el('div', { class: 'lbl', text: lbl }),
    el('div', { class: 'val', text: `¥${yuan(cur)}` }),
    deltaEl);
}

const segBtn = (text: string, pressed: boolean, onClick: () => void): HTMLElement =>
  el('button', { 'aria-pressed': String(pressed), text, onclick: onClick });

async function renderStats(): Promise<void> {
  const m = state.statsMonth;
  $('s-month').textContent = monthLabel(m);
  ($('s-next') as HTMLButtonElement).disabled = m >= S.todayStr().slice(0, 7);

  let st;
  try { st = await S.monthStats(m); } catch (e) { return toast(errMsg(e)); }

  $('s-overview').replaceChildren(
    deltaTile('本月支出', st.summary.expense, st.prevSummary.expense, false),
    deltaTile('本月收入', st.summary.income, st.prevSummary.income, true),
    deltaTile('本月结余', st.summary.balance, st.prevSummary.balance, true));

  /* 分类占比（点击跳转明细） */
  C.renderCategoryBars($('s-cat'), st.categorySums, (it) => {
    state.detailMonth = m;
    state.filter = { type: 'expense', categoryId: it.id, accountId: '', supplierId: '', keyword: '', start: '', end: '' };
    state.page = 1;
    switchTab('detail');
    toast(`已筛选「${it.name}」`);
  });

  /* 供应商排行 */
  C.renderCategoryBars($('s-supplier'), st.supplierSums.slice(0, 5), (it) => {
    state.detailMonth = m;
    state.filter = { type: 'expense', categoryId: '', accountId: '', supplierId: it.id, keyword: '', start: '', end: '' };
    state.page = 1;
    switchTab('detail');
    toast(`已筛选「${it.name}」`);
  });

  /* 每日趋势 */
  const dailySeg = $('s-daily-seg');
  dailySeg.replaceChildren(segBtn('图表', state.segDaily === 'chart', () => { state.segDaily = 'chart'; void renderStats(); }),
    segBtn('表格', state.segDaily === 'table', () => { state.segDaily = 'table'; void renderStats(); }));
  const dailyHost = $('s-daily');
  if (state.segDaily === 'chart') C.renderDailyColumns(dailyHost, st.dailySeries, m, true);
  else dailyHost.innerHTML = C.dailyTable(st.dailySeries, m);

  /* 近 6 个月 */
  const trendSeg = $('s-trend-seg');
  trendSeg.replaceChildren(segBtn('图表', state.segTrend === 'chart', () => { state.segTrend = 'chart'; void renderStats(); }),
    segBtn('表格', state.segTrend === 'table', () => { state.segTrend = 'table'; void renderStats(); }));
  const trendHost = $('s-trend');
  if (state.segTrend === 'chart') C.renderSixMonthLine(trendHost, st.sixMonth);
  else trendHost.innerHTML = C.sixMonthTable(st.sixMonth);
}

/* ================= Tab3 预算 ================= */
async function renderBudget(): Promise<void> {
  const m = S.todayStr().slice(0, 7);
  let st;
  try { st = await S.budgetState(m); } catch (e) { return toast(errMsg(e)); }
  ($('budget-dot') as HTMLElement).hidden = !(st && st.pct >= 0.8);

  const banner = $('b-banner');
  banner.hidden = true;
  banner.className = 'alert-banner';
  if (st) {
    if (st.pct >= 1) {
      banner.classList.add('danger');
      banner.textContent = `⚠ 本月预算已超支 ¥${yuan(st.overspent)}，本月还剩 ${st.daysLeft} 天，能不花就不花啦。`;
      banner.hidden = false;
    } else if (st.pct >= 0.8) {
      banner.textContent = `⚠ 预算快用完啦：已使用 ${Math.round(st.pct * 100)}%，日均还能花 ¥${yuan(st.dailyAvailable)}。`;
      banner.hidden = false;
    }
  }

  const body = $('b-body');
  body.textContent = '';
  if (!st) {
    const input = el('input', { type: 'number', inputmode: 'decimal', min: '1', placeholder: '如 3000', style: 'width:100%' });
    body.appendChild(el('div', { class: 'card', style: 'text-align:center' },
      el('div', { style: 'font-size:40px', text: '🎯' }),
      el('p', { style: 'color:var(--ink-2);margin:8px 0 14px', text: '给本月设一个支出预算，小管家帮你盯着。' }),
      el('div', { class: 'field', style: 'text-align:left' }, el('label', { text: '本月预算（元）' }), input),
      el('button', {
        class: 'btn primary wide', text: '保存预算',
        onclick: async () => {
          const cents = parseAmountToCents((input as HTMLInputElement).value);
          if (!cents) return toast('请输入有效的预算金额');
          try { await S.setBudget(m, cents); toast('预算已设置'); } catch (e) { toast(errMsg(e)); }
        },
      })));
    return;
  }

  const pct = Math.min(1, st.pct);
  const meter = el('div', { class: `meter${st.pct >= 1 ? ' over' : st.pct >= 0.8 ? ' warn' : ''}` },
    el('i', { style: `width:${(pct * 100).toFixed(1)}%` }));
  body.appendChild(el('div', { class: 'card meter-card' },
    el('div', { class: 'pct-big', text: `${Math.round(st.pct * 100)}%` }),
    el('div', { class: 'pct-sub', text: `已使用 ¥${yuan(st.used)} / 预算 ¥${yuan(st.budget)}` }),
    meter,
    el('div', { class: 'pct-sub', text: st.pct >= 1 ? '已超支，加油控制～' : `按计划走，月底还能剩 ¥${yuan(st.remaining)}` })));

  body.appendChild(el('div', { class: 'b-rows' },
    el('div', { class: 'b-row' }, el('div', { class: 'lbl', text: '剩余预算' }),
      el('div', { class: `val${st.remaining < 0 ? ' danger' : ''}`, text: st.remaining < 0 ? `超支 ¥${yuan(-st.remaining)}` : `¥${yuan(st.remaining)}` })),
    el('div', { class: 'b-row' }, el('div', { class: 'lbl', text: '日均可用（剩余天数均摊）' }),
      el('div', { class: 'val accent', text: `¥${yuan(st.dailyAvailable)}` })),
    el('div', { class: 'b-row' }, el('div', { class: 'lbl', text: '本月已过' }),
      el('div', { class: 'val', text: `${st.daysInMonth - st.daysLeft + 1} / ${st.daysInMonth} 天` })),
    el('div', { class: 'b-row' }, el('div', { class: 'lbl', text: '剩余天数' }),
      el('div', { class: 'val', text: `${st.daysLeft} 天` }))));

  body.appendChild(el('button', {
    class: 'btn ghost plain wide', text: '修改 / 清除预算',
    onclick: () => {
      const input = el('input', { type: 'number', inputmode: 'decimal', value: (st!.budget / 100).toFixed(2) });
      const box = el('div', {},
        el('h3', { class: 'sheet-title', text: '修改本月预算' }),
        el('div', { class: 'field' }, el('label', { text: '本月预算（元）' }), input),
        el('button', {
          class: 'btn primary wide', text: '保存',
          onclick: async () => {
            const cents = parseAmountToCents((input as HTMLInputElement).value);
            if (!cents) return toast('请输入有效的预算金额');
            try { await S.setBudget(m, cents); closeSheet(); toast('预算已更新'); } catch (e) { toast(errMsg(e)); }
          },
        }),
        el('button', {
          class: 'link-danger', text: '清除本月预算',
          onclick: () => confirmDialog({
            title: '清除本月预算？', text: '清除后本月不再进行预算提醒。', okText: '清除', danger: true,
            onOk: async () => { try { await S.setBudget(m, null); toast('已清除'); } catch (e) { toast(errMsg(e)); } },
          }),
        }));
      openSheet(box);
    },
  }));
}

/* 80% / 100% 各提醒一次（每月每档一次，不重复骚扰；标记存服务端） */
async function checkBudgetAlert(): Promise<void> {
  const m = S.todayStr().slice(0, 7);
  try {
    if (await S.fireBudgetAlert(m, '100')) toast('⚠ 本月预算已超支！');
    else if (await S.fireBudgetAlert(m, '80')) toast('⚠ 预算快用完啦（已用 80%）');
  } catch { /* 提醒失败不阻塞主流程 */ }
}

/* ================= Tab4 我的 ================= */
async function renderMine(): Promise<void> {
  const body = $('m-body');
  body.textContent = '';
  body.appendChild(el('div', { class: 'card profile-card' },
    el('span', { class: 'profile-avatar', text: '👤' }),
    el('div', {},
      el('div', { class: 'profile-name', text: S.username() || '未登录' }),
      el('div', { class: 'card-sub', text: '云端账户 · 数据加密隔离存储' }))));

  let recycleCount = 0;
  try { recycleCount = (await S.recycleBin()).length; } catch { /* ignore */ }

  const menu = el('div', { class: 'menu' });
  // 菜单项生成器
  const createMenuItem = (icon: string, text: string, extra?: string, onClick?: () => void): HTMLElement => {
    const children: Array<Node | string> = [];
    children.push(
      el('span', { class: 'mi-ico', text: icon }),
      el('span', { class: 'mi-text', text })
    );
    if (extra) {
      children.push(el('span', { class: 'mi-extra', text: extra }));
    }
    const btn = el('button', { class: 'menu-item', onclick: onClick || undefined }, ...children);
    return btn;
  };

  const item1 = createMenuItem('🏷️', '分类管理', '支出 9 + 收入 5，可自定义', () => openCategoryMgr());
  const item2 = createMenuItem('🏪', '供应商管理', '记账时输入即可自动创建', () => openSupplierMgr());
  const item3 = createMenuItem('💼', '账户管理', '现金 / 微信 / 支付宝…', () => openAccountMgr());
  const item4 = createMenuItem('🗑️', '回收站', recycleCount ? `${recycleCount} 条，30 天内可恢复` : '空',
    () => void openRecycleBin());
  const item5 = createMenuItem('📤', '导出 CSV', '账单数据备份', () => void doExport());
  const item6 = createMenuItem('ℹ️', '关于小管家', 'V2.0.0', openAbout);
  const item7 = createMenuItem('🚪', '退出登录', '退出后需重新输入密码', () => confirmDialog({
    title: '退出登录？',
    text: '退出后需重新输入密码才能查看账单。',
    onOk: () => void S.logout(),
  }));

  menu.appendChild(item1);
  menu.appendChild(item2);
  menu.appendChild(item3);
  menu.appendChild(item4);
  menu.appendChild(item5);
  menu.appendChild(item6);
  menu.appendChild(item7);
  body.appendChild(menu);
  body.appendChild(el('div', { class: 'about-box' },
    el('div', { text: '小管家 · 10 秒记完一笔，月底一眼看清钱去哪了' }),
    el('div', { text: '数据云端存储（Cloudflare），按账户隔离，请妥善保管密码' })));
}

/* ---------- 分类管理 ---------- */
function openCategoryMgr(): void {
  let curType: 'expense' | 'income' = 'expense';
  const listHost = el('div', {});
  const seg = el('div', { class: 'seg block', style: 'margin-bottom:10px' });
  const iconInput = el('input', { type: 'text', value: '📦', maxlength: '2', style: 'width:64px;text-align:center' });
  const nameInput = el('input', { type: 'text', placeholder: '新分类名（≤6 字）', maxlength: '6', style: 'flex:1' });

  const row = (c: CategoryDTO) =>
    el('div', { class: `mgr-row${c.status === 'inactive' ? ' off' : ''}` },
      el('span', { class: 'ico', text: c.icon }),
      el('button', { class: 'name', text: c.name, style: 'text-align:left', onclick: () => promptSheet({ title: '重命名分类', label: '分类名称', value: c.name, onOk: (v) => void S.renameCategory(c.id, v).catch((e) => toast(errMsg(e))) }) }),
      c.isDefault ? el('span', { class: 'tag', text: '默认' }) : el('span', { class: 'tag', text: '自定义' }),
      el('button', { class: 'mini-btn', text: '↑', 'aria-label': '上移', onclick: () => void S.moveCategory(c.id, -1).catch((e) => toast(errMsg(e))) }),
      el('button', { class: 'mini-btn', text: '↓', 'aria-label': '下移', onclick: () => void S.moveCategory(c.id, 1).catch((e) => toast(errMsg(e))) }),
      el('button', {
        class: 'mini-btn wide-mini', text: c.status === 'active' ? '停用' : '启用',
        onclick: () => void S.setCategoryStatus(c.id, c.status === 'active' ? 'inactive' : 'active').catch((e) => toast(errMsg(e))),
      }));

  function renderList(): void {
    listHost.replaceChildren(...S.allCategories(curType).map(row));
  }
  function renderSeg(): void {
    seg.replaceChildren(
      el('button', { 'aria-pressed': String(curType === 'expense'), text: '支出分类', onclick: () => { curType = 'expense'; (iconInput as HTMLInputElement).value = '📦'; renderSeg(); renderList(); } }),
      el('button', { 'aria-pressed': String(curType === 'income'), text: '收入分类', onclick: () => { curType = 'income'; (iconInput as HTMLInputElement).value = '✨'; renderSeg(); renderList(); } }));
  }
  renderSeg(); renderList();

  const box = el('div', {},
    el('h3', { class: 'sheet-title', text: '分类管理' }),
    el('p', { class: 'chart-note', text: '停用后不再出现在记账选择中，历史账单不受影响；排序决定记账页的分类顺序。' }),
    seg, listHost,
    el('div', { class: 'mgr-row' }, iconInput, nameInput,
      el('button', {
        class: 'mini-btn wide-mini', text: '添加',
        onclick: async () => {
          const name = (nameInput as HTMLInputElement).value.trim();
          if (!name) return toast('请输入分类名');
          try {
            await S.addCategory(name, curType, (iconInput as HTMLInputElement).value.trim() || '📦');
            (nameInput as HTMLInputElement).value = ''; renderList();
          } catch (e) { toast(errMsg(e)); }
        },
      })));
  openSheet(box);
}

/* ---------- 供应商管理 ---------- */
function openSupplierMgr(): void {
  const listHost = el('div', {});
  const nameInput = el('input', { type: 'text', placeholder: '新供应商名（≤12 字）', maxlength: '12', style: 'flex:1' });
  function renderList(): void {
    const list = S.allSuppliers();
    if (!list.length) {
      listHost.replaceChildren(el('p', { class: 'empty', text: '还没有供应商，记账页输入新名称会自动创建', style: 'padding:16px 0' }));
      return;
    }
    listHost.replaceChildren(...list.map((s) => el('div', { class: `mgr-row${s.status === 'inactive' ? ' off' : ''}` },
      el('span', { class: 'ico', text: '🏪' }),
      el('button', { class: 'name', text: s.name, style: 'text-align:left', onclick: () => promptSheet({ title: '重命名供应商', label: '供应商名称', value: s.name, onOk: (v) => void S.renameSupplier(s.id, v).catch((e) => toast(errMsg(e))) }) }),
      el('button', { class: 'mini-btn', text: '↑', 'aria-label': '上移', onclick: () => void S.moveSupplier(s.id, -1).catch((e) => toast(errMsg(e))) }),
      el('button', { class: 'mini-btn', text: '↓', 'aria-label': '下移', onclick: () => void S.moveSupplier(s.id, 1).catch((e) => toast(errMsg(e))) }),
      el('button', { class: 'mini-btn wide-mini', text: s.status === 'active' ? '停用' : '启用', onclick: () => void S.setSupplierStatus(s.id, s.status === 'active' ? 'inactive' : 'active').catch((e) => toast(errMsg(e))) }))));
  }
  renderList();
  openSheet(el('div', {},
    el('h3', { class: 'sheet-title', text: '供应商管理' }),
    el('p', { class: 'chart-note', text: '停用后不再出现在记账建议中，历史账单不受影响。' }),
    listHost,
    el('div', { class: 'mgr-row' },
      el('span', { class: 'ico', text: '🏪' }), nameInput,
      el('button', {
        class: 'mini-btn wide-mini', text: '添加',
        onclick: async () => {
          const n = (nameInput as HTMLInputElement).value.trim();
          if (!n) return toast('请输入供应商名');
          try { await S.addSupplier(n); (nameInput as HTMLInputElement).value = ''; renderList(); }
          catch (e) { toast(errMsg(e)); }
        },
      }))));
}

/* ---------- 账户管理 ---------- */
function openAccountMgr(): void {
  const listHost = el('div', {});
  const iconInput = el('input', { type: 'text', value: '💰', maxlength: '2', style: 'width:64px;text-align:center' });
  const nameInput = el('input', { type: 'text', placeholder: '新账户名（≤6 字）', maxlength: '6', style: 'flex:1' });
  function renderList(): void {
    listHost.replaceChildren(...S.allAccounts().map((a) =>
      el('div', { class: 'mgr-row' },
        el('span', { class: 'ico', text: a.icon }),
        el('button', { class: 'name', text: a.name, style: 'text-align:left', onclick: () => promptSheet({ title: '重命名账户', label: '账户名称', value: a.name, onOk: (v) => void S.renameAccount(a.id, v).catch((e) => toast(errMsg(e))) }) }),
        el('button', { class: 'mini-btn', text: '↑', onclick: () => void S.moveAccount(a.id, -1).catch((e) => toast(errMsg(e))) }),
        el('button', { class: 'mini-btn', text: '↓', onclick: () => void S.moveAccount(a.id, 1).catch((e) => toast(errMsg(e))) }))));
  }
  renderList();
  openSheet(el('div', {},
    el('h3', { class: 'sheet-title', text: '账户管理' }),
    listHost,
    el('div', { class: 'mgr-row' }, iconInput, nameInput,
      el('button', {
        class: 'mini-btn wide-mini', text: '添加',
        onclick: async () => {
          const name = (nameInput as HTMLInputElement).value.trim();
          if (!name) return toast('请输入账户名');
          try {
            await S.addAccount(name, (iconInput as HTMLInputElement).value.trim() || '💰');
            (nameInput as HTMLInputElement).value = ''; renderList();
          } catch (e) { toast(errMsg(e)); }
        },
      }))));
}

/* ---------- 回收站 ---------- */
async function openRecycleBin(): Promise<void> {
  const listHost = el('div', {});
  let items: RecycleItemDTO[] = [];
  try { items = await S.recycleBin(); } catch (e) { return toast(errMsg(e)); }

  const renderList = () => {
    if (!items.length) {
      listHost.replaceChildren(el('p', { class: 'empty', text: '回收站是空的', style: 'padding:24px 0' }));
      return;
    }
    listHost.replaceChildren(...items.map((t) => {
      const c = S.findCategory(t.categoryId);
      const delDay = t.deletedAt.slice(5, 10).replace('-', '/');
      return el('div', { class: 'mgr-row' },
        el('span', { class: 'ico', text: c ? c.icon : '❓' }),
        el('span', { class: 'name' },
          el('div', { text: `${c ? c.name : '未知分类'} ¥${yuan(t.amount)}` }),
          el('div', { class: 'meta', style: 'font-size:11px;color:var(--muted)', text: `${t.date} 记录 · ${delDay} 删除` })),
        el('button', {
          class: 'mini-btn wide-mini', text: '恢复',
          onclick: async () => {
            try { await S.restoreTransaction(t.id); items = items.filter((x) => x.id !== t.id); renderList(); toast('已恢复'); }
            catch (e) { toast(errMsg(e)); }
          },
        }),
        el('button', {
          class: 'mini-btn wide-mini danger', text: '彻底删除',
          onclick: () => confirmDialog({
            title: '彻底删除？', text: '删除后无法恢复。', okText: '删除', danger: true,
            onOk: async () => {
              try { await S.purgeTransaction(t.id); items = items.filter((x) => x.id !== t.id); renderList(); }
              catch (e) { toast(errMsg(e)); }
            },
          }),
        }));
    }));
  };
  renderList();
  openSheet(el('div', {},
    el('h3', { class: 'sheet-title', text: '回收站（保留 30 天）' }),
    listHost));
}

/* ---------- CSV 导出（服务端生成，UTF-8 带 BOM） ---------- */
async function doExport(): Promise<void> {
  try {
    const count = await S.exportCSV();
    if (!count) return toast('暂无账单可导出');
    toast(`已导出 ${count} 笔账单`);
  } catch (e) { toast(errMsg(e)); }
}

/* ---------- 关于 ---------- */
function openAbout(): void {
  openSheet(el('div', {},
    el('h3', { class: 'sheet-title', text: '关于小管家' }),
    el('p', { class: 'chart-note', style: 'text-align:center;line-height:2' },
      '小管家 V2.0.0（云端版）\n一款轻量级个人记账 H5。数据云端存储、按账户隔离；受账户密码保护，忘记密码将无法找回。'),
    el('button', {
      class: 'btn danger-btn wide', text: '清空所有数据',
      onclick: () => confirmDialog({
        title: '清空所有数据？', text: '将删除全部账单、分类与预算，且无法恢复！建议先导出 CSV 备份。',
        okText: '仍然清空', danger: true,
        onOk: () => confirmDialog({
          title: '再次确认', text: '真的要清空吗？此操作不可恢复。', okText: '清空', danger: true,
          onOk: async () => {
            try { await S.clearAll(); toast('已清空'); }
            catch (e) { toast(errMsg(e)); }
          },
        }),
      }),
    })));
}

/* ================= 路由与初始化 ================= */
const VIEWS: Record<string, string> = { detail: 'view-detail', stats: 'view-stats', budget: 'view-budget', mine: 'view-mine' };
function switchTab(tab: string): void {
  state.tab = tab;
  document.querySelectorAll('.tabbar .tab').forEach((b) =>
    b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === tab)));
  for (const [name, id] of Object.entries(VIEWS)) $(id).hidden = name !== tab;
  void refreshAll();
}

async function refreshAll(): Promise<void> {
  if (state.tab === 'detail') await renderDetail();
  else if (state.tab === 'stats') await renderStats();
  else if (state.tab === 'budget') await renderBudget();
  else if (state.tab === 'mine') await renderMine();
}

async function init(): Promise<void> {
  /* Tab 切换 */
  document.querySelectorAll('.tabbar .tab').forEach((b) =>
    b.addEventListener('click', () => switchTab((b as HTMLElement).dataset.tab!)));
  $('fab').addEventListener('click', () => void openEditSheet(null));
  $('overlay').addEventListener('click', closeSheet);

  /* 明细月份切换与筛选 */
  $('d-prev').addEventListener('click', () => { state.detailMonth = monthShift(state.detailMonth, -1); state.page = 1; void renderDetail(); });
  $('d-next').addEventListener('click', () => { if (state.detailMonth < S.todayStr().slice(0, 7)) { state.detailMonth = monthShift(state.detailMonth, 1); state.page = 1; void renderDetail(); } });
  $('d-filter').addEventListener('click', openFilterSheet);
  $('d-more-btn').addEventListener('click', () => { state.page++; void renderDetail(); });

  /* 统计月份切换 */
  $('s-prev').addEventListener('click', () => { state.statsMonth = monthShift(state.statsMonth, -1); void renderStats(); });
  $('s-next').addEventListener('click', () => { if (state.statsMonth < S.todayStr().slice(0, 7)) { state.statsMonth = monthShift(state.statsMonth, 1); void renderStats(); } });

  /* 数据变化 → 刷新当前视图 */
  S.onChange(() => void refreshAll());

  /* PWA：仅 http(s) 下注册 */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  await refreshAll();
  await checkBudgetAlert();
}

/* ---------- 启动门（V2.0）：SSR 已做会话门，这里拉取基础数据后进入主应用 ---------- */
async function boot(): Promise<void> {
  try {
    await S.loadBootstrap();
  } catch (e) {
    if (e instanceof ApiFail && e.status === 401) { location.href = '/login'; return; }
    document.body.textContent = '加载失败，请刷新重试';
    return;
  }
  await init();
}

void boot();
