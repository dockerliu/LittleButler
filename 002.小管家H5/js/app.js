/* 小管家 — UI 层：四个 Tab + 弹层交互 */
(function () {
  'use strict';
  const S = window.XGJ;
  const C = window.XGJCharts;
  const $ = id => document.getElementById(id);

  /* ---------- 通用工具 ---------- */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }
  const yuan = S.centsToYuanText;
  const monthLabel = m => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
  const dateLabel = d => `${Number(d.slice(5, 7))}月${Number(d.slice(8))}日 · ${S.WEEK_CN[S.weekdayOf(d)]}`;
  const nowStamp = () => { const d = new Date(); return `${d.getFullYear()}${S.pad(d.getMonth() + 1)}${S.pad(d.getDate())}`; };

  let toastTimer = null;
  function toast(msg, ms = 1500) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  /* ---------- 弹层 ---------- */
  function openSheet(contentEl, opts = {}) {
    const sheet = $('sheet');
    sheet.className = 'sheet' + (opts.center ? ' confirm-wrap' : '');
    sheet.textContent = '';
    if (!opts.center) sheet.appendChild(el('div', { class: 'grab' }));
    sheet.appendChild(contentEl);
    $('overlay').hidden = false;
    sheet.hidden = false;
  }
  function closeSheet() {
    $('overlay').hidden = true;
    $('sheet').hidden = true;
    C.hideTip();
  }
  function confirmDialog({ title, text, okText = '确定', danger = false, onOk }) {
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
  function promptSheet({ title, label, value = '', placeholder = '', onOk }) {
    const input = el('input', { type: 'text', value, placeholder, maxlength: '12' });
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

  /* ---------- V1.0.2 图片压缩与全屏预览 ---------- */
  const PHOTO_MAX_EDGE = 1280;     // 最长边
  const PHOTO_CHAR_LIMIT = 200000; // dataURL 字符数上限 ≈ 150KB 原始字节

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          let scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(w, h));
          let q = 0.72, out = '';
          for (let i = 0; i < 8; i++) {           // 先降质量，再缩尺寸
            const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = cw; canvas.height = ch;
            canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
            out = canvas.toDataURL('image/jpeg', q);
            if (out.length <= PHOTO_CHAR_LIMIT) break;
            if (q > 0.5) q -= 0.12; else scale *= 0.8;
          }
          if (!out || out.length > PHOTO_CHAR_LIMIT * 2) reject(new Error('compress fail'));
          else resolve(out);
        } catch (e) { reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load fail')); };
      img.src = url;
    });
  }

  function showLightbox(src) {
    const box = el('div', { class: 'lightbox' }, el('img', { src, alt: '图片预览' }));
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  /* ---------- 全局状态 ---------- */
  const state = {
    tab: 'detail',
    detailMonth: S.currentMonth(),
    statsMonth: S.currentMonth(),
    filter: { type: '', categoryId: '', accountId: '', supplierId: '', keyword: '', start: '', end: '' },
    page: 1,
    PAGE_SIZE: 40,
    segDaily: 'chart',
    segTrend: 'chart',
  };

  function filterActive() {
    const f = state.filter;
    return !!(f.type || f.categoryId || f.accountId || f.supplierId || f.keyword || f.start || f.end);
  }
  function filterArgs() {
    const f = state.filter;
    const args = {};
    if (f.start || f.end) { if (f.start) args.start = f.start; if (f.end) args.end = f.end; }
    else args.month = state.detailMonth;
    if (f.type) args.type = f.type;
    if (f.categoryId) args.categoryId = f.categoryId;
    if (f.accountId) args.accountId = f.accountId;
    if (f.supplierId) args.supplierId = f.supplierId;
    if (f.keyword) args.keyword = f.keyword;
    return args;
  }

  /* ================= Tab1 明细 ================= */
  function renderDetail() {
    const f = state.filter;
    const custom = !!(f.start || f.end);
    $('d-month').textContent = custom ? `${f.start || '…'} 至 ${f.end || '…'}` : monthLabel(state.detailMonth);
    $('d-prev').disabled = custom;
    $('d-next').disabled = custom || state.detailMonth >= S.currentMonth();
    $('d-filter').classList.toggle('active', filterActive());
    $('d-filter-dot').hidden = !filterActive();

    /* 汇总卡（当月/所选范围，不随筛选项变化，保持口径单一） */
    const args = custom ? {} : { month: state.detailMonth };
    if (custom) { if (f.start) args.start = f.start; if (f.end) args.end = f.end; }
    const list = S.queryTransactions(args);
    let exp = 0, inc = 0;
    for (const t of list) t.type === 'expense' ? exp += t.amount : inc += t.amount;
    $('d-summary').replaceChildren(
      el('div', {}, el('div', { class: 'lbl', text: '本月支出' }),
        el('div', { class: 'val' }, el('span', { class: 'sign', text: '¥' }), yuan(exp))),
      el('div', {}, el('div', { class: 'lbl', text: '本月收入' }),
        el('div', { class: 'val small' }, el('span', { class: 'sign', text: '¥' }), yuan(inc))),
      el('div', {}, el('div', { class: 'lbl', text: '本月结余' }),
        el('div', { class: 'val small' }, el('span', { class: 'sign', text: '¥' }), yuan(inc - exp))));

    renderList(list);
  }

  function renderList(all) {
    const host = $('d-list');
    host.textContent = '';
    const show = all.slice(0, state.page * state.PAGE_SIZE);
    let lastDate = null, group = null;

    for (const t of show) {
      if (t.date !== lastDate) {
        lastDate = t.date;
        group = el('div', { class: 'day-group' });
        const dayList = all.filter(x => x.date === t.date);
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
      const item = el('button', { class: 'bill-item', onclick: () => openEditSheet(t.id) },
        el('span', { class: 'ico', text: c ? c.icon : '❓' }),
        el('span', { class: 'mid' },
          el('div', { class: 'cat', text: c ? c.name : '未知分类' }),
          el('div', { class: 'meta', text: [t.note, sup ? sup.name : '', a ? a.name : ''].filter(Boolean).join(' · ') || ' ' })),
        S.photosOf(t.id).length ? el('span', { class: 'photo-flag', text: '📷', title: '有图片附件' }) : null,
        el('span', { class: `amt ${t.type === 'expense' ? 'out' : 'in'}`, text: `${t.type === 'expense' ? '−' : '+'}¥${yuan(t.amount)}` }));
      group.appendChild(item);
    }
    $('d-empty').hidden = all.length > 0;
    $('d-more').hidden = show.length >= all.length;
  }

  /* ---------- 筛选面板 ---------- */
  function openFilterSheet() {
    const f = state.filter;
    const typeSel = el('select', {},
      el('option', { value: '', text: '全部类型' }),
      el('option', { value: 'expense', text: '仅支出', ...(f.type === 'expense' ? { selected: true } : {}) }),
      el('option', { value: 'income', text: '仅收入', ...(f.type === 'income' ? { selected: true } : {}) }));
    const catSel = el('select', {}, el('option', { value: '', text: '全部分类' }));
    for (const type of ['expense', 'income']) {
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

    const box = el('div', {},
      el('h3', { class: 'sheet-title', text: '筛选账单' }),
      el('div', { class: 'field' }, el('label', { text: '类型' }), typeSel),
      el('div', { class: 'field' }, el('label', { text: '分类' }), catSel),
      el('div', { class: 'field' }, el('label', { text: '账户' }), accSel),
      el('div', { class: 'field' }, el('label', { text: '供应商' }), supSel),
      el('div', { class: 'field' }, el('label', { text: '备注关键词' }), kw),
      el('div', { class: 'field' }, el('label', { text: '自定义时间范围（可选，留空则按当前月份）' }), start, el('div', { style: 'height:6px' }), end),
      el('div', { class: 'sheet-actions' },
        el('button', {
          class: 'btn ghost plain', text: '重置',
          onclick: () => {
            state.filter = { type: '', categoryId: '', accountId: '', supplierId: '', keyword: '', start: '', end: '' };
            state.page = 1; closeSheet(); renderDetail();
          },
        }),
        el('button', {
          class: 'btn primary', text: '应用',
          onclick: () => {
            if (start.value && end.value && start.value > end.value) return toast('开始日期不能晚于结束日期');
            state.filter = { type: typeSel.value, categoryId: catSel.value, accountId: accSel.value, supplierId: supSel.value, keyword: kw.value.trim(), start: start.value, end: end.value };
            state.page = 1; closeSheet(); renderDetail();
          },
        })));
    openSheet(box);
  }

  /* ================= 记账 / 编辑 ================= */
  function openEditSheet(txId) {
    const tx = txId ? S.getTransaction(txId) : null;
    const cur = {
      type: tx ? tx.type : 'expense',
      amount: tx ? (tx.amount / 100).toFixed(2) : '',
      categoryId: tx ? tx.categoryId : null,
      accountId: tx ? tx.accountId : S.findAccountFirstId(),
      date: tx ? tx.date : S.todayStr(),
      note: tx ? tx.note : '',
    };
    let photos = tx ? S.photosOf(tx.id).slice() : [];   // V1.0.2 图片附件（dataURL 数组）
    if (!cur.categoryId) cur.categoryId = S.lastUsedCategory(cur.type) || S.activeCategories(cur.type)[0]?.id || null;

    const errEl = el('div', { class: 'amount-err' });
    const amountInput = el('input', {
      type: 'number', inputmode: 'decimal', step: '0.01', min: '0.01', placeholder: '0.00',
      value: cur.amount,
    });
    const catGrid = el('div', { class: 'cat-grid' });
    const accRow = el('div', { class: 'chip-row' });
    const segBtns = {};
    const saveBtn = el('button', { class: 'btn primary', text: '保存', onclick: saveOne });

    function renderCats() {
      catGrid.replaceChildren();
      for (const c of S.activeCategories(cur.type)) {
        catGrid.appendChild(el('button', {
          class: 'cat-cell', 'aria-pressed': String(cur.categoryId === c.id),
          onclick: () => { cur.categoryId = c.id; renderCats(); },
        }, el('span', { class: 'c-ico', text: c.icon }), el('span', { text: c.name })));
      }
    }
    function renderAccounts() {
      accRow.replaceChildren();
      for (const a of S.allAccounts()) {
        accRow.appendChild(el('button', {
          class: 'chip', 'aria-pressed': String(cur.accountId === a.id),
          onclick: () => { cur.accountId = a.id; renderAccounts(); },
        }, `${a.icon} ${a.name}`));
      }
    }
    /* 供应商（V1.0.2）：自动补全，新名称保存时自动创建 */
    const supplierInput = el('input', {
      type: 'text', maxlength: '12', list: 'xgj-supplier-list',
      placeholder: '可选，如：全家 / 美团 / 京东',
      value: tx ? (S.findSupplier(tx.supplierId)?.name || '') : '',
    });
    const supplierDl = el('datalist', { id: 'xgj-supplier-list' });
    for (const s of S.activeSuppliers()) supplierDl.appendChild(el('option', { value: s.name }));

    /* 图片附件（V1.0.2）：≤5 张，自动压缩 */
    const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
    const photoLabel = el('label', { text: '' });
    const thumbs = el('div', { class: 'thumb-row' });
    function renderThumbs() {
      photoLabel.textContent = `图片附件 ${photos.length}/5（自动压缩，最长边 1280px）`;
      const cells = photos.map((src, i) => el('span', { class: 'thumb' },
        el('img', { src, alt: `附件 ${i + 1}`, onclick: () => showLightbox(src) }),
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
          photos.push(await compressImage(f));
          renderThumbs();
        } catch (e) { toast('这张图处理失败，已跳过'); }
      }
    });
    renderThumbs();

    function validate() {
      const cents = S.parseAmountToCents(amountInput.value);
      if (amountInput.value && !cents) errEl.textContent = '金额需大于 0、最多两位小数，且不超过 99,999,999';
      else errEl.textContent = '';
      saveBtn.disabled = !cents;
      return cents;
    }
    amountInput.addEventListener('input', validate);

    function persist() {
      const cents = S.parseAmountToCents(amountInput.value);
      if (!cents) return null;
      const supplierName = supplierInput.value.trim().slice(0, 12);
      const supplierId = supplierName ? S.ensureSupplier(supplierName) : null;
      if (tx) {
        S.updateTransaction(tx.id, {
          type: cur.type, amount: cents, categoryId: cur.categoryId,
          accountId: cur.accountId, date: cur.date, note: noteInput.value.trim(), supplierId,
        });
        S.savePhotos(tx.id, photos.slice(0, 5));
      } else {
        const t = S.addTransaction({
          type: cur.type, amountCents: cents, categoryId: cur.categoryId,
          accountId: cur.accountId, date: cur.date, note: noteInput.value.trim(), supplierId,
        });
        S.savePhotos(t.id, photos.slice(0, 5));
      }
      return true;
    }
    function saveOne() {
      if (!cur.categoryId) return toast('请选择分类');
      if (!persist()) return;
      closeSheet();
      toast('已记录');
      checkBudgetAlert();
    }

    const noteInput = el('input', { type: 'text', maxlength: '50', placeholder: '备注（可选）', value: cur.note });
    const noteCount = el('span', { class: 'card-sub', text: `${cur.note.length}/50` });
    noteInput.addEventListener('input', () => { noteCount.textContent = `${noteInput.value.length}/50`; });

    const actions = tx
      ? el('div', { class: 'sheet-actions' },
          el('button', { class: 'btn danger-btn', text: '删除', onclick: () => confirmDialog({ title: '删除这笔账单？', text: '删除后可在「我的 → 回收站」30 天内恢复。', okText: '删除', danger: true, onOk: () => { S.softDeleteTransaction(tx.id); closeSheet(); toast('已移入回收站'); } }) }),
          saveBtn)
      : el('div', { class: 'sheet-actions' },
          el('button', {
            class: 'btn ghost plain', text: '再记一笔',
            onclick: () => {
              if (!cur.categoryId) return toast('请选择分类');
              if (!persist()) return;
              amountInput.value = ''; noteInput.value = ''; photos = []; renderThumbs(); validate();
              toast('已记录，可继续记');
              checkBudgetAlert();
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
        el('input', { type: 'date', value: cur.date, max: S.todayStr(), onchange: e => { cur.date = e.target.value; } })),
      el('div', { class: 'field' }, el('label', { text: '备注' }), noteInput, el('div', { style: 'text-align:right' }, noteCount)),
      actions);

    function switchType(type) {
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
  function deltaTile(lbl, cur, prev, upIsGood) {
    let deltaEl;
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

  function renderStats() {
    const m = state.statsMonth;
    $('s-month').textContent = monthLabel(m);
    $('s-next').disabled = m >= S.currentMonth();

    const cur = S.monthSummary(m);
    const prev = S.monthSummary(S.monthShift(m, -1));
    $('s-overview').replaceChildren(
      deltaTile('本月支出', cur.expense, prev.expense, false),
      deltaTile('本月收入', cur.income, prev.income, true),
      deltaTile('本月结余', cur.balance, prev.balance, true));

    /* 分类占比（点击跳转明细） */
    C.renderCategoryBars($('s-cat'), S.categorySums(m, 'expense'), it => {
      state.detailMonth = m;
      state.filter = { type: 'expense', categoryId: it.id, accountId: '', supplierId: '', keyword: '', start: '', end: '' };
      state.page = 1;
      switchTab('detail');
      toast(`已筛选「${it.name}」`);
    });

    /* 供应商排行（V1.0.2） */
    C.renderCategoryBars($('s-supplier'), S.supplierSums(m).slice(0, 5), it => {
      state.detailMonth = m;
      state.filter = { type: 'expense', categoryId: '', accountId: '', supplierId: it.id, keyword: '', start: '', end: '' };
      state.page = 1;
      switchTab('detail');
      toast(`已筛选「${it.name}」`);
    });

    /* 每日趋势 */
    const dailySeg = $('s-daily-seg');
    dailySeg.replaceChildren(segBtn('图表', state.segDaily === 'chart', () => { state.segDaily = 'chart'; renderStats(); }),
      segBtn('表格', state.segDaily === 'table', () => { state.segDaily = 'table'; renderStats(); }));
    const dailyHost = $('s-daily');
    if (state.segDaily === 'chart') C.renderDailyColumns(dailyHost, S.dailyExpenseSeries(m), m, true);
    else dailyHost.innerHTML = C.dailyTable(S.dailyExpenseSeries(m), m);

    /* 近 6 个月 */
    const trendSeg = $('s-trend-seg');
    trendSeg.replaceChildren(segBtn('图表', state.segTrend === 'chart', () => { state.segTrend = 'chart'; renderStats(); }),
      segBtn('表格', state.segTrend === 'table', () => { state.segTrend = 'table'; renderStats(); }));
    const points = S.expenseByMonth(m, 6);
    const trendHost = $('s-trend');
    if (state.segTrend === 'chart') C.renderSixMonthLine(trendHost, points);
    else trendHost.innerHTML = C.sixMonthTable(points);
  }
  const segBtn = (text, pressed, onClick) =>
    el('button', { 'aria-pressed': String(pressed), text, onclick: onClick });

  /* ================= Tab3 预算 ================= */
  function renderBudget() {
    const m = S.currentMonth();
    const st = S.budgetState(m);
    $('budget-dot').hidden = !(st && st.pct >= 0.8);

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
          onclick: () => {
            const cents = S.parseAmountToCents(input.value);
            if (!cents) return toast('请输入有效的预算金额');
            S.setBudget(m, cents);
            toast('预算已设置');
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
        const input = el('input', { type: 'number', inputmode: 'decimal', value: (st.budget / 100).toFixed(2) });
        const box = el('div', {},
          el('h3', { class: 'sheet-title', text: '修改本月预算' }),
          el('div', { class: 'field' }, el('label', { text: '本月预算（元）' }), input),
          el('button', {
            class: 'btn primary wide', text: '保存',
            onclick: () => {
              const cents = S.parseAmountToCents(input.value);
              if (!cents) return toast('请输入有效的预算金额');
              S.setBudget(m, cents); closeSheet(); toast('预算已更新');
            },
          }),
          el('button', {
            class: 'link-danger', text: '清除本月预算',
            onclick: () => confirmDialog({
              title: '清除本月预算？', text: '清除后本月不再进行预算提醒。', okText: '清除', danger: true,
              onOk: () => { S.setBudget(m, null); toast('已清除'); },
            }),
          }));
        openSheet(box);
      },
    }));
  }

  /* 80% / 100% 各提醒一次（每月每档一次，不重复骚扰） */
  function checkBudgetAlert() {
    const m = S.currentMonth();
    const st = S.budgetState(m);
    if (!st) return;
    if (st.pct >= 1 && !S.firedAlert(m, '100')) { S.markAlert(m, '100'); toast('⚠ 本月预算已超支！'); }
    else if (st.pct >= 0.8 && !S.firedAlert(m, '80')) { S.markAlert(m, '80'); toast('⚠ 预算快用完啦（已用 80%）'); }
  }

  /* ================= Tab4 我的 ================= */
  function renderMine() {
    const stats = S.statsOverview();
    const body = $('m-body');
    body.textContent = '';
    body.appendChild(el('div', { class: 'card profile-card' },
      el('span', { class: 'profile-avatar', text: '👤' }),
      el('div', {},
        el('div', { class: 'profile-name', text: window.XGJAuth ? window.XGJAuth.currentUser() || '未登录' : '未登录' }),
        el('div', { class: 'card-sub', text: '本机账户 · 数据仅存于此设备' }))));
    const menu = el('div', { class: 'menu' });
    const item = (icon, text, extra, onclick) =>
      el('button', { class: 'menu-item', onclick },
        el('span', { class: 'mi-ico', text: icon }),
        el('span', { class: 'mi-text', text }),
        extra ? el('span', { class: 'mi-extra', text: extra }) : null);
    menu.append(
      item('🏷️', '分类管理', '支出 9 + 收入 5，可自定义', () => openCategoryMgr()),
      item('🏪', '供应商管理', '记账时输入即可自动创建', () => openSupplierMgr()),
      item('💼', '账户管理', '现金 / 微信 / 支付宝…', () => openAccountMgr()),
      item('🗑️', '回收站', stats.recycleCount ? `${stats.recycleCount} 条，30 天内可恢复` : '空',
        () => openRecycleBin()),
      item('📤', '导出 CSV', `共 ${stats.transactionCount} 笔`, doExport),
      item('ℹ️', '关于小管家', 'V1.0.1', openAbout),
      item('🚪', '退出登录', '退出后需重新输入密码', () => confirmDialog({
        title: '退出登录？',
        text: '退出后需重新输入密码才能查看账单。',
        okText: '退出',
        onOk: () => { window.XGJAuth.logout(); location.reload(); },
      })));
    body.appendChild(menu);
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(est => {
        if (est.usage && est.usage > 3.5 * 1024 * 1024) {
          body.appendChild(el('div', { class: 'alert-banner', text: `本地存储已用 ${(est.usage / 1048576).toFixed(1)}MB，接近浏览器上限：建议定期导出 CSV 备份，并清理不再需要的图片附件。` }));
        }
      }).catch(() => {});
    }
    body.appendChild(el('div', { class: 'about-box' },
      el('div', { text: '小管家 · 10 秒记完一笔，月底一眼看清钱去哪了' }),
      el('div', { text: '数据仅保存在本机浏览器，不会上传' })));
  }

  /* ---------- 分类管理 ---------- */
  function openCategoryMgr() {
    let curType = 'expense';
    const listHost = el('div', {});
    const seg = el('div', { class: 'seg block', style: 'margin-bottom:10px' });
    const iconInput = el('input', { type: 'text', value: '📦', maxlength: '2', style: 'width:64px;text-align:center' });
    const nameInput = el('input', { type: 'text', placeholder: '新分类名（≤6 字）', maxlength: '6', style: 'flex:1' });

    function row(c) {
      return el('div', { class: `mgr-row${c.status === 'inactive' ? ' off' : ''}` },
        el('span', { class: 'ico', text: c.icon }),
        el('button', { class: 'name', text: c.name, style: 'text-align:left', onclick: () => promptSheet({ title: '重命名分类', label: '分类名称', value: c.name, onOk: v => S.renameCategory(c.id, v) }) }),
        c.isDefault ? el('span', { class: 'tag', text: '默认' }) : el('span', { class: 'tag', text: '自定义' }),
        el('button', { class: 'mini-btn', text: '↑', 'aria-label': '上移', onclick: () => S.moveCategory(c.id, -1) }),
        el('button', { class: 'mini-btn', text: '↓', 'aria-label': '下移', onclick: () => S.moveCategory(c.id, 1) }),
        el('button', {
          class: 'mini-btn wide-mini', text: c.status === 'active' ? '停用' : '启用',
          onclick: () => S.setCategoryStatus(c.id, c.status === 'active' ? 'inactive' : 'active'),
        }));
    }
    function renderList() {
      listHost.replaceChildren(...S.allCategories(curType).map(row));
    }
    function renderSeg() {
      seg.replaceChildren(
        el('button', { 'aria-pressed': String(curType === 'expense'), text: '支出分类', onclick: () => { curType = 'expense'; iconInput.value = '📦'; renderSeg(); renderList(); } }),
        el('button', { 'aria-pressed': String(curType === 'income'), text: '收入分类', onclick: () => { curType = 'income'; iconInput.value = '✨'; renderSeg(); renderList(); } }));
    }
    renderSeg(); renderList();

    const box = el('div', {},
      el('h3', { class: 'sheet-title', text: '分类管理' }),
      el('p', { class: 'chart-note', text: '停用后不再出现在记账选择中，历史账单不受影响；排序决定记账页的分类顺序。' }),
      seg, listHost,
      el('div', { class: 'mgr-row' }, iconInput, nameInput,
        el('button', {
          class: 'mini-btn wide-mini', text: '添加',
          onclick: () => {
            const name = nameInput.value.trim();
            if (!name) return toast('请输入分类名');
            S.addCategory(name, curType, iconInput.value.trim() || '📦');
            nameInput.value = ''; renderList();
          },
        })));
    openSheet(box);
  }

  /* ---------- 供应商管理（V1.0.2） ---------- */
  function openSupplierMgr() {
    const listHost = el('div', {});
    const nameInput = el('input', { type: 'text', placeholder: '新供应商名（≤12 字）', maxlength: '12', style: 'flex:1' });
    function renderList() {
      const list = S.allSuppliers();
      if (!list.length) {
        listHost.replaceChildren(el('p', { class: 'empty', text: '还没有供应商，记账页输入新名称会自动创建', style: 'padding:16px 0' }));
        return;
      }
      listHost.replaceChildren(...list.map(s => el('div', { class: `mgr-row${s.status === 'inactive' ? ' off' : ''}` },
        el('span', { class: 'ico', text: '🏪' }),
        el('button', { class: 'name', text: s.name, style: 'text-align:left', onclick: () => promptSheet({ title: '重命名供应商', label: '供应商名称', value: s.name, onOk: v => S.renameSupplier(s.id, v) }) }),
        el('button', { class: 'mini-btn', text: '↑', 'aria-label': '上移', onclick: () => S.moveSupplier(s.id, -1) }),
        el('button', { class: 'mini-btn', text: '↓', 'aria-label': '下移', onclick: () => S.moveSupplier(s.id, 1) }),
        el('button', { class: 'mini-btn wide-mini', text: s.status === 'active' ? '停用' : '启用', onclick: () => S.setSupplierStatus(s.id, s.status === 'active' ? 'inactive' : 'active') }))));
    }
    renderList();
    openSheet(el('div', {},
      el('h3', { class: 'sheet-title', text: '供应商管理' }),
      el('p', { class: 'chart-note', text: '停用后不再出现在记账建议中，历史账单不受影响。' }),
      listHost,
      el('div', { class: 'mgr-row' },
        el('span', { class: 'ico', text: '🏪' }), nameInput,
        el('button', { class: 'mini-btn wide-mini', text: '添加', onclick: () => { const n = nameInput.value.trim(); if (!n) return toast('请输入供应商名'); S.ensureSupplier(n); nameInput.value = ''; renderList(); } }))));
  }

  /* ---------- 账户管理 ---------- */
  function openAccountMgr() {
    const listHost = el('div', {});
    const iconInput = el('input', { type: 'text', value: '💰', maxlength: '2', style: 'width:64px;text-align:center' });
    const nameInput = el('input', { type: 'text', placeholder: '新账户名（≤6 字）', maxlength: '6', style: 'flex:1' });
    function renderList() {
      listHost.replaceChildren(...S.allAccounts().map(a =>
        el('div', { class: 'mgr-row' },
          el('span', { class: 'ico', text: a.icon }),
          el('button', { class: 'name', text: a.name, style: 'text-align:left', onclick: () => promptSheet({ title: '重命名账户', label: '账户名称', value: a.name, onOk: v => S.renameAccount(a.id, v) }) }),
          el('button', { class: 'mini-btn', text: '↑', onclick: () => S.moveAccount(a.id, -1) }),
          el('button', { class: 'mini-btn', text: '↓', onclick: () => S.moveAccount(a.id, 1) }))));
    }
    renderList();
    openSheet(el('div', {},
      el('h3', { class: 'sheet-title', text: '账户管理' }),
      listHost,
      el('div', { class: 'mgr-row' }, iconInput, nameInput,
        el('button', {
          class: 'mini-btn wide-mini', text: '添加',
          onclick: () => {
            const name = nameInput.value.trim();
            if (!name) return toast('请输入账户名');
            S.addAccount(name, iconInput.value.trim() || '💰');
            nameInput.value = ''; renderList();
          },
        }))));
  }

  /* ---------- 回收站 ---------- */
  function openRecycleBin() {
    const listHost = el('div', {});
    function renderList() {
      const items = S.recycleBin();
      if (!items.length) {
        listHost.replaceChildren(el('p', { class: 'empty', text: '回收站是空的', style: 'padding:24px 0' }));
        return;
      }
      listHost.replaceChildren(...items.map(t => {
        const c = S.findCategory(t.categoryId);
        const delDay = t.deletedAt.slice(5, 10).replace('-', '/');
        return el('div', { class: 'mgr-row' },
          el('span', { class: 'ico', text: c ? c.icon : '❓' }),
          el('span', { class: 'name' },
            el('div', { text: `${c ? c.name : '未知分类'} ¥${yuan(t.amount)}` }),
            el('div', { class: 'meta', style: 'font-size:11px;color:var(--muted)', text: `${t.date} 记录 · ${delDay} 删除` })),
          el('button', { class: 'mini-btn wide-mini', text: '恢复', onclick: () => { S.restoreTransaction(t.id); renderList(); toast('已恢复'); } }),
          el('button', {
            class: 'mini-btn wide-mini danger', text: '彻底删除',
            onclick: () => confirmDialog({ title: '彻底删除？', text: '删除后无法恢复。', okText: '删除', danger: true, onOk: () => { S.purgeTransaction(t.id); renderList(); } }),
          }));
      }));
    }
    renderList();
    openSheet(el('div', {},
      el('h3', { class: 'sheet-title', text: `回收站（保留 ${S.RECYCLE_DAYS} 天）` }),
      listHost));
  }

  /* ---------- CSV 导出（UTF-8 带 BOM，Excel 中文不乱码） ---------- */
  function doExport() {
    const { csv, count } = S.exportCSV();
    if (!count) return toast('暂无账单可导出');
    const text = csv.charCodeAt(0) === 0xFEFF ? csv : String.fromCharCode(0xfeff) + csv;
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `xiaoguanjia_${nowStamp()}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`已导出 ${count} 笔账单`);
  }

  /* ---------- 关于 ---------- */
  function openAbout() {
    openSheet(el('div', {},
      el('h3', { class: 'sheet-title', text: '关于小管家' }),
      el('p', { class: 'chart-note', style: 'text-align:center;line-height:2' },
        '小管家 V1.0.1\n一款轻量级个人记账 H5。数据仅存于本机浏览器，不上传任何服务器；受本机账户锁保护，忘记密码将无法找回。'),
      el('button', {
        class: 'btn ghost plain wide', text: '申请持久化存储（防清理丢数据）',
        onclick: async () => {
          try {
            const ok = await navigator.storage.persist();
            toast(ok ? '已获得持久化存储' : '浏览器未授予，请定期导出备份');
          } catch (e) { toast('当前环境不支持'); }
        },
      }),
      el('button', {
        class: 'btn danger-btn wide', text: '清空所有数据',
        onclick: () => confirmDialog({
          title: '清空所有数据？', text: '将删除全部账单、分类与预算，且无法恢复！建议先导出 CSV 备份。',
          okText: '仍然清空', danger: true,
          onOk: () => confirmDialog({
            title: '再次确认', text: '真的要清空吗？此操作不可恢复。', okText: '清空', danger: true,
            onOk: () => { S.clearAll(); location.reload(); },
          }),
        }),
      })));
  }

  /* ================= 路由与初始化 ================= */
  const VIEWS = { detail: 'view-detail', stats: 'view-stats', budget: 'view-budget', mine: 'view-mine' };
  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tabbar .tab').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    for (const [name, id] of Object.entries(VIEWS)) $(id).hidden = name !== tab;
    if (tab === 'detail') renderDetail();
    else if (tab === 'stats') renderStats();
    else if (tab === 'budget') renderBudget();
    else if (tab === 'mine') renderMine();
  }

  function refreshAll() {
    if (state.tab === 'detail') renderDetail();
    else if (state.tab === 'stats') renderStats();
    else if (state.tab === 'budget') renderBudget();
    else if (state.tab === 'mine') renderMine();
  }

  function init() {
    /* Tab 切换 */
    document.querySelectorAll('.tabbar .tab').forEach(b =>
      b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('fab').addEventListener('click', () => openEditSheet(null));
    $('overlay').addEventListener('click', closeSheet);

    /* 明细月份切换与筛选 */
    $('d-prev').addEventListener('click', () => { state.detailMonth = S.monthShift(state.detailMonth, -1); state.page = 1; renderDetail(); });
    $('d-next').addEventListener('click', () => { if (state.detailMonth < S.currentMonth()) { state.detailMonth = S.monthShift(state.detailMonth, 1); state.page = 1; renderDetail(); } });
    $('d-filter').addEventListener('click', openFilterSheet);
    $('d-more-btn').addEventListener('click', () => { state.page++; renderDetail(); });

    /* 统计月份切换 */
    $('s-prev').addEventListener('click', () => { state.statsMonth = S.monthShift(state.statsMonth, -1); renderStats(); });
    $('s-next').addEventListener('click', () => { if (state.statsMonth < S.currentMonth()) { state.statsMonth = S.monthShift(state.statsMonth, 1); renderStats(); } });

    /* 数据变化 → 刷新当前视图 */
    S.onChange(refreshAll);

    /* PWA：仅 http(s) 下注册 */
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    /* 尽早申请持久化存储（PRD 风险 #5 的兜底） */
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    switchTab('detail');
    checkBudgetAlert();
  }

  /* ---------- V1.0.1 启动门：本机账户锁（PRD 4.7） ---------- */
  function renderLockScreen() {
    const A = window.XGJAuth;
    const isRegister = !A.hasAccount();
    const err = el('div', { class: 'amount-err', style: 'text-align:center' });
    const userInput = el('input', { type: 'text', maxlength: '16', placeholder: '用户名（2–16 位，不含空格）', value: isRegister ? '' : A.getUsername() });
    const passIn = el('input', { type: 'password', placeholder: '密码（至少 6 位）' });
    const pass2In = el('input', { type: 'password', placeholder: '再输入一次密码' });
    const remember = el('input', { type: 'checkbox' });

    async function submit() {
      err.textContent = '';
      submitBtn.disabled = true;
      try {
        const u = userInput.value.trim();
        if (isRegister) {
          const r = await A.register(u, passIn.value);
          if (!r.ok) { err.textContent = r.msg; return; }
          const r2 = await A.login(u, passIn.value, true); // 注册成功即登录（7 天免登录）
          if (!r2.ok) { err.textContent = r2.msg; return; }
          location.reload();
        } else {
          const r = await A.login(u, passIn.value, remember.checked);
          if (!r.ok) { err.textContent = r.msg; return; }
          location.reload();
        }
      } finally {
        submitBtn.disabled = false;
      }
    }
    const submitBtn = el('button', { class: 'btn primary wide', text: isRegister ? '注 册' : '登 录', onclick: submit });

    passIn.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    pass2In.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    userInput.addEventListener('keydown', e => { if (e.key === 'Enter') passIn.focus(); });

    $('lock').hidden = false;
    $('lock').replaceChildren(el('div', { class: 'lock-card' },
      el('div', { class: 'lock-logo', text: '¥' }),
      el('h1', { text: '小管家' }),
      el('p', { class: 'lock-sub', text: isRegister ? '注册本机账户，锁定你的账单隐私' : '欢迎回来，请登录本机账户' }),
      el('div', { class: 'field' }, el('label', { text: '用户名' }), userInput),
      el('div', { class: 'field' }, el('label', { text: '密码' }), passIn),
      isRegister ? el('div', { class: 'field' }, el('label', { text: '确认密码' }), pass2In) : null,
      isRegister ? null : el('label', { class: 'lock-remember' }, remember, el('span', { text: '7 天内免登录' })),
      err,
      submitBtn,
      el('p', { class: 'lock-warn', text: isRegister
        ? '⚠ 数据仅保存在本机、没有云端找回。请务必记住密码：遗忘密码将无法访问数据，只能清空后重新开始。'
        : '数据仅保存在本机。忘记密码将无法登录，只能清空本机数据重新开始。' })));
  }

  function boot() {
    const user = window.XGJAuth && window.XGJAuth.currentUser();
    if (!user) { renderLockScreen(); return; }
    S.setUser(user);
    if (S.adoptLegacyData()) setTimeout(() => toast('已继承本机原有账单数据'), 400);
    $('app-root').hidden = false;
    init();
  }

  boot();
})();
