/* 小管家 — 数据层
 * 口径（与 PRD 第六节一致）：
 * - 金额一律以「分」为整数存储，避免浮点误差
 * - 账单软删除（deletedAt），回收站保留 30 天
 * - 统计按账单 date 归月，剔除已删除
 */
(function () {
  'use strict';

  let KEY = 'xgj:data:v1'; // V1.0.1：登录后切换为按账户隔离的键（见 setUser）
  const RECYCLE_DAYS = 30;                 // 评审决议：回收站保留期 30 天
  const MAX_YUAN = 99999999;               // PRD 4.1 金额上限

  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const currentMonth = () => todayStr().slice(0, 7);
  const monthOf = dateStr => dateStr.slice(0, 7);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function monthShift(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function daysInMonth(month) {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getDay(); // 0 周日
  }
  const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ---------- 预置数据（评审决议：默认分类 9 支出 + 5 收入，不调整） ---------- */
  const DEFAULT_EXPENSE = [['餐饮', '🍜'], ['交通', '🚌'], ['购物', '🛒'], ['居住', '🏠'], ['娱乐', '🎮'], ['医疗', '💊'], ['教育', '📚'], ['人情往来', '🎁'], ['其他', '📦']];
  const DEFAULT_INCOME = [['工资', '💼'], ['兼职', '🧾'], ['理财收益', '📈'], ['红包礼金', '🧧'], ['其他', '✨']];
  const DEFAULT_ACCOUNTS = [['现金', '💵', 'cash'], ['微信', '💚', 'wechat'], ['支付宝', '💙', 'alipay'], ['银行卡', '🏦', 'bank'], ['信用卡', '💳', 'credit']];

  function seed() {
    const categories = [];
    let sort = 0;
    for (const [name, icon] of DEFAULT_EXPENSE) {
      categories.push({ id: uid(), name, icon, type: 'expense', sort: sort++, status: 'active', isDefault: true });
    }
    sort = 0;
    for (const [name, icon] of DEFAULT_INCOME) {
      categories.push({ id: uid(), name, icon, type: 'income', sort: sort++, status: 'active', isDefault: true });
    }
    return {
      version: 1,
      transactions: [],
      categories,
      suppliers: [],
      accounts: DEFAULT_ACCOUNTS.map(([name, icon, type], i) => ({ id: uid(), name, icon, type, sort: i })),
      budgets: {},                 // { 'YYYY-MM': cents }
      budgetAlerts: {},            // { 'YYYY-MM': { '80': true, '100': true } }
      settings: { lastCategory: { expense: null, income: null } },
    };
  }

  /* ---------- 持久化 ---------- */
  let db = null;
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : null;
    } catch (e) { db = null; }
    if (!db || !Array.isArray(db.transactions)) db = seed();
    if (!Array.isArray(db.suppliers)) db.suppliers = []; // V1.0.2 旧数据归一化
    purgeRecycleBin();
    save();
    return db;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 存储满等异常下静默，导出可兜底 */ }
    listeners.forEach(fn => fn());
  }
  function onChange(fn) { listeners.push(fn); }

  /* ---------- V1.0.1 账户隔离 ---------- */
  function setUser(username) {
    KEY = username ? `xgj:data:v1:u:${username}` : 'xgj:data:v1';
    PHOTOS_KEY = username ? `xgj:photos:v1:u:${username}` : 'xgj:photos:v1';
    photosCache = null;
    load();
  }
  /* 旧版本匿名数据迁移：当前账户是全新空账、且存在 V1.0 的本机数据时自动继承 */
  function adoptLegacyData() {
    if (KEY === 'xgj:data:v1') return false;
    const legacy = localStorage.getItem('xgj:data:v1');
    if (!legacy) return false;
    let parsed = null;
    try { parsed = JSON.parse(legacy); } catch (e) { return false; }
    if (!parsed || !Array.isArray(parsed.transactions)) return false;
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }
    const pristine = !cur || (Array.isArray(cur.transactions) && cur.transactions.length === 0
      && Object.keys(cur.budgets || {}).length === 0);
    if (!pristine) return false;
    localStorage.setItem(KEY, legacy);
    load();
    return true;
  }

  /* ---------- V1.0.2 图片附件：与账单主体分开存储，按账单 id 索引 ---------- */
  let PHOTOS_KEY = 'xgj:photos:v1';
  let photosCache = null;
  function photosMap() {
    if (!photosCache) {
      try { photosCache = JSON.parse(localStorage.getItem(PHOTOS_KEY)) || {}; }
      catch (e) { photosCache = {}; }
    }
    return photosCache;
  }
  const photosOf = txId => photosMap()[txId] || [];
  function persistPhotos() {
    try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(photosCache)); }
    catch (e) { /* 存储满：由「我的」页的占用提示与 CSV 导出兜底 */ }
  }
  function savePhotos(txId, arr) {
    const list = (arr || []).slice(0, 5);
    const m = photosMap();
    if (list.length) m[txId] = list; else delete m[txId];
    persistPhotos();
  }
  function deletePhotos(txId) {
    const m = photosMap();
    if (m[txId]) { delete m[txId]; persistPhotos(); }
  }

  /* 回收站超期自动清理（> 30 天彻底删除） */
  function purgeRecycleBin() {
    const cutoff = Date.now() - RECYCLE_DAYS * 86400000;
    db.transactions = db.transactions.filter(t => !t.deletedAt || Date.parse(t.deletedAt) >= cutoff);
  }

  /* ---------- 金额换算 ---------- */
  function parseAmountToCents(str) {
    const s = String(str).trim().replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;      // 空 / 负数 / 超两位小数 / 非法字符
    const cents = Math.round(parseFloat(s) * 100);
    if (cents <= 0 || cents > MAX_YUAN * 100) return null;
    return cents;
  }
  function centsToYuanText(cents) {
    return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---------- 账单 CRUD ---------- */
  function addTransaction({ type, amountCents, categoryId, accountId, date, note, supplierId }) {
    const t = {
      id: uid(), type, amount: amountCents,
      categoryId, accountId, supplierId: supplierId || null, date,
      note: (note || '').slice(0, 50),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null,
    };
    db.transactions.push(t);
    db.settings.lastCategory[type] = categoryId;
    save();
    return t;
  }
  function updateTransaction(id, patch) {
    const t = db.transactions.find(x => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { updatedAt: new Date().toISOString() });
    db.settings.lastCategory[t.type] = t.categoryId;
    save();
    return t;
  }
  function softDeleteTransaction(id) {
    const t = db.transactions.find(x => x.id === id);
    if (t) { t.deletedAt = new Date().toISOString(); save(); }
    return t;
  }
  function restoreTransaction(id) {
    const t = db.transactions.find(x => x.id === id);
    if (t) { t.deletedAt = null; save(); }
    return t;
  }
  function purgeTransaction(id) {
    db.transactions = db.transactions.filter(t => t.id !== id);
    deletePhotos(id);   // 彻底删除时图片一并清除
    save();
  }
  const getTransaction = id => db.transactions.find(t => t.id === id) || null;

  /* ---------- 分类 / 账户管理 ---------- */
  const findCategory = id => db.categories.find(c => c.id === id) || null;
  const findAccount = id => db.accounts.find(a => a.id === id) || null;
  const allAccounts = () => [...db.accounts].sort((a, b) => a.sort - b.sort);
  function findAccountFirstId() { const list = allAccounts(); return list.length ? list[0].id : null; }
  function lastUsedCategory(type) {
    const c = findCategory(db.settings.lastCategory[type]);
    return c && c.status === 'active' ? c.id : null;
  }
  const activeCategories = type =>
    db.categories.filter(c => c.type === type && c.status === 'active').sort((a, b) => a.sort - b.sort);
  const allCategories = type =>
    db.categories.filter(c => c.type === type).sort((a, b) => a.sort - b.sort);

  function addCategory(name, type, icon) {
    const sameType = db.categories.filter(c => c.type === type);
    const c = { id: uid(), name: name.slice(0, 6), icon: icon || '📦', type, sort: sameType.length ? Math.max(...sameType.map(x => x.sort)) + 1 : 0, status: 'active', isDefault: false };
    db.categories.push(c); save(); return c;
  }
  function renameCategory(id, name) {
    const c = findCategory(id);
    if (c && name.trim()) { c.name = name.trim().slice(0, 6); save(); }
  }
  function moveCategory(id, dir) {
    const c = findCategory(id);
    if (!c) return;
    const list = allCategories(c.type);
    const idx = list.indexOf(c);
    const swapWith = list[idx + dir];
    if (!swapWith) return;
    [c.sort, swapWith.sort] = [swapWith.sort, c.sort];
    save();
  }
  function setCategoryStatus(id, status) {
    const c = findCategory(id);
    if (c) { c.status = status; save(); }   // 只停用不删除，历史账单展示不受影响
  }

  /* ---------- V1.0.2 供应商 ---------- */
  const findSupplier = id => db.suppliers.find(s => s.id === id) || null;
  const activeSuppliers = () => db.suppliers.filter(s => s.status === 'active').sort((a, b) => a.sort - b.sort);
  const allSuppliers = () => [...db.suppliers].sort((a, b) => a.sort - b.sort);
  function ensureSupplier(name) {
    const n = String(name).trim().slice(0, 12);
    if (!n) return null;
    const found = db.suppliers.find(s => s.name === n);
    if (found) return found.id;               // 同名（含已停用）直接复用
    const s = { id: uid(), name: n, status: 'active', sort: db.suppliers.length ? Math.max(...db.suppliers.map(x => x.sort)) + 1 : 0, createdAt: new Date().toISOString() };
    db.suppliers.push(s); save(); return s.id;
  }
  function renameSupplier(id, name) {
    const s = findSupplier(id);
    if (s && name.trim()) { s.name = name.trim().slice(0, 12); save(); }
  }
  function moveSupplier(id, dir) {
    const s = findSupplier(id);
    if (!s) return;
    const list = allSuppliers();
    const swapWith = list[list.indexOf(s) + dir];
    if (!swapWith) return;
    [s.sort, swapWith.sort] = [swapWith.sort, s.sort];
    save();
  }
  function setSupplierStatus(id, status) {
    const s = findSupplier(id);
    if (s) { s.status = status; save(); }     // 只停用不删除，历史账单展示不受影响
  }

  function addAccount(name, icon) {
    const a = { id: uid(), name: name.slice(0, 6), icon: icon || '💰', type: 'custom', sort: db.accounts.length ? Math.max(...db.accounts.map(x => x.sort)) + 1 : 0 };
    db.accounts.push(a); save(); return a;
  }
  function renameAccount(id, name) {
    const a = findAccount(id);
    if (a && name.trim()) { a.name = name.trim().slice(0, 6); save(); }
  }
  function moveAccount(id, dir) {
    const a = findAccount(id);
    if (!a) return;
    const list = [...db.accounts].sort((x, y) => x.sort - y.sort);
    const idx = list.indexOf(a);
    const swapWith = list[idx + dir];
    if (!swapWith) return;
    [a.sort, swapWith.sort] = [swapWith.sort, a.sort];
    save();
  }

  /* ---------- 预算 ---------- */
  const getBudget = month => (month in db.budgets ? db.budgets[month] : null);
  function setBudget(month, cents) {
    if (cents == null) delete db.budgets[month];
    else db.budgets[month] = cents;
    save();
  }
  function budgetState(month) {
    const budget = getBudget(month);
    if (budget == null) return null;
    const used = monthSummary(month).expense;
    const remaining = budget - used;
    const days = daysInMonth(month);
    const today = todayStr();
    const daysLeft = month === currentMonth() ? days - Number(today.slice(8)) + 1 : days; // 非当前月按整天计
    const pct = budget > 0 ? used / budget : 0;
    return {
      budget, used, remaining, pct,
      dailyAvailable: remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
      overspent: remaining < 0 ? -remaining : 0,
      daysLeft, daysInMonth: days,
    };
  }
  function firedAlert(month, level) { return !!(db.budgetAlerts[month] && db.budgetAlerts[month][level]); }
  function markAlert(month, level) {
    (db.budgetAlerts[month] = db.budgetAlerts[month] || {})[level] = true;
    save();
  }

  /* ---------- 查询与统计（统一口径：按 date 归月、剔除已删除） ---------- */
  function queryTransactions({ month, start, end, type, categoryId, accountId, supplierId, keyword } = {}) {
    return db.transactions
      .filter(t => !t.deletedAt)
      .filter(t => {
        if (month && monthOf(t.date) !== month) return false;
        if (start && t.date < start) return false;
        if (end && t.date > end) return false;
        if (type && t.type !== type) return false;
        if (categoryId && t.categoryId !== categoryId) return false;
        if (accountId && t.accountId !== accountId) return false;
        if (supplierId && t.supplierId !== supplierId) return false;
        if (keyword && !(t.note || '').includes(keyword)) return false; // PRD：备注关键词
        return true;
      })
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  }

  function monthSummary(month) {
    let expense = 0, income = 0;
    for (const t of db.transactions) {
      if (t.deletedAt || monthOf(t.date) !== month) continue;
      if (t.type === 'expense') expense += t.amount; else income += t.amount;
    }
    return { expense, income, balance: income - expense };
  }

  /* 分类占比（支出），从高到低 */
  function categorySums(month, type = 'expense') {
    const map = new Map();
    for (const t of db.transactions) {
      if (t.deletedAt || t.type !== type || monthOf(t.date) !== month) continue;
      map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
    }
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([id, cents]) => {
        const c = findCategory(id);
        return { id, cents, name: c ? c.name : '未知分类', icon: c ? c.icon : '❓', pct: total ? cents / total : 0 };
      })
      .sort((a, b) => b.cents - a.cents);
  }

  /* 供应商支出排行（V1.0.2），从高到低 */
  function supplierSums(month, type = 'expense') {
    const map = new Map();
    for (const t of db.transactions) {
      if (t.deletedAt || t.type !== type || monthOf(t.date) !== month || !t.supplierId) continue;
      map.set(t.supplierId, (map.get(t.supplierId) || 0) + t.amount);
    }
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([id, cents]) => {
        const s = findSupplier(id);
        return { id, cents, name: s ? s.name : '未知供应商', icon: '🏪', pct: total ? cents / total : 0 };
      })
      .sort((a, b) => b.cents - a.cents);
  }

  /* 每日支出序列（整月，含无消费日补 0） */
  function dailyExpenseSeries(month) {
    const sums = new Array(daysInMonth(month) + 1).fill(0);
    for (const t of db.transactions) {
      if (t.deletedAt || t.type !== 'expense' || monthOf(t.date) !== month) continue;
      sums[Number(t.date.slice(8))] += t.amount;
    }
    const today = todayStr();
    return sums.slice(1).map((cents, i) => {
      const day = i + 1;
      const wd = weekdayOf(`${month}-${pad(day)}`);
      return { day, cents, weekend: wd === 0 || wd === 6, isToday: `${month}-${pad(day)}` === today };
    });
  }

  /* 近 N 个月支出（含 endMonth 往前推） */
  function expenseByMonth(endMonth, count = 6) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const m = monthShift(endMonth, -i);
      out.push({ month: m, cents: monthSummary(m).expense });
    }
    return out;
  }

  /* ---------- 回收站 / 导出 ---------- */
  const recycleBin = () =>
    db.transactions.filter(t => t.deletedAt).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  function exportCSV() {
    const rows = [['日期', '类型', '分类', '供应商', '账户', '金额(元)', '备注']];
    const list = db.transactions.filter(t => !t.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
    for (const t of list) {
      const c = findCategory(t.categoryId), a = findAccount(t.accountId);
      const sup = findSupplier(t.supplierId);
      rows.push([
        t.date,
        t.type === 'expense' ? '支出' : '收入',
        c ? c.name : '未知分类',
        sup ? sup.name : '',
        a ? a.name : '未知账户',
        (t.amount / 100).toFixed(2),
        t.note || '',
      ]);
    }
    const csv = '﻿' + rows.map(r =>
      r.map(v => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')
    ).join('\r\n');
    return { csv, count: list.length };
  }

  function statsOverview() {
    return {
      transactionCount: db.transactions.filter(t => !t.deletedAt).length,
      recycleCount: db.transactions.filter(t => t.deletedAt).length,
    };
  }

  function clearAll() {
    db = seed();
    photosCache = {};
    try { localStorage.removeItem(PHOTOS_KEY); } catch (e) { /* ignore */ }
    save();
  }

  load();

  /* 导出为全局命名空间 */
  window.XGJ = {
    RECYCLE_DAYS, MAX_YUAN, WEEK_CN,
    todayStr, currentMonth, monthOf, monthShift, daysInMonth, weekdayOf, pad,
    parseAmountToCents, centsToYuanText,
    addTransaction, updateTransaction, softDeleteTransaction, restoreTransaction, purgeTransaction, getTransaction,
    addCategory, renameCategory, moveCategory, setCategoryStatus, activeCategories, allCategories, findCategory,
    findSupplier, activeSuppliers, allSuppliers, ensureSupplier, renameSupplier, moveSupplier, setSupplierStatus, supplierSums,
    photosOf, savePhotos, deletePhotos,
    addAccount, renameAccount, moveAccount, findAccount, allAccounts, findAccountFirstId, lastUsedCategory,
    getBudget, setBudget, budgetState, firedAlert, markAlert,
    queryTransactions, monthSummary, categorySums, dailyExpenseSeries, expenseByMonth,
    recycleBin, exportCSV, statsOverview, clearAll, onChange, setUser, adoptLegacyData,
  };
})();
