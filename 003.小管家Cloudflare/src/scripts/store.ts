/* API 客户端（数据层，替代旧 localStorage 版 store.js）
 * 服务端为唯一口径：金额分、软删除、按 date 归月统计；
 * 客户端只缓存基础数据（分类/账户/供应商/偏好），变更后即时刷新并通知渲染层。
 */
import type {
  AccountDTO, BootstrapDTO, BudgetStateDTO, CategoryDTO, CategoryType,
  PhotoDTO, RecycleItemDTO, StatsDTO, SupplierDTO, TxDTO, TxListResult, TxQuery, TxType,
} from '../lib/types';

/* ---------- 底层请求 ---------- */

export class ApiFail extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let json: { ok: boolean; data?: T; msg?: string } | null = null;
  try { json = await res.json(); } catch { /* 非 JSON（如 502） */ }
  if (!res.ok || !json?.ok) {
    throw new ApiFail(json?.msg || `请求失败（${res.status}）`, res.status);
  }
  return json.data as T;
}

const get = <T,>(url: string) => request<T>(url);
const post = <T,>(url: string, body?: unknown) => request<T>(url, {
  method: 'POST',
  headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
  body: body !== undefined ? JSON.stringify(body) : undefined,
});
const patch = <T,>(url: string, body: unknown) => request<T>(url, {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const del = <T,>(url: string) => request<T>(url, { method: 'DELETE' });
const put = <T,>(url: string, body: unknown) => request<T>(url, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

/* ---------- 基础数据缓存与变更通知 ---------- */

let base: BootstrapDTO | null = null;
const listeners: (() => void)[] = [];

/** 数据或基础信息变化后调用：刷新当前视图 */
export function onChange(fn: () => void): void { listeners.push(fn); }
function notify(): void { listeners.forEach((fn) => fn()); }

export async function loadBootstrap(force = false): Promise<BootstrapDTO> {
  if (!base || force) base = await get<BootstrapDTO>('/api/bootstrap');
  return base;
}

export const todayStr = (): string => base?.today ?? new Date().toISOString().slice(0, 10);
export const username = (): string => base?.username ?? '';

/* ---------- 只读缓存访问（对齐旧 store.js 命名） ---------- */

export const allCategories = (type?: CategoryType): CategoryDTO[] =>
  (base?.categories || []).filter((c) => !type || c.type === type);
export const activeCategories = (type: CategoryType): CategoryDTO[] =>
  allCategories(type).filter((c) => c.status === 'active');
export const findCategory = (id: string | null): CategoryDTO | undefined =>
  id ? allCategories().find((c) => c.id === id) : undefined;

export const allAccounts = (): AccountDTO[] => [...(base?.accounts || [])];
export const findAccount = (id: string | null): AccountDTO | undefined =>
  id ? allAccounts().find((a) => a.id === id) : undefined;
export const findAccountFirstId = (): string | null => allAccounts()[0]?.id ?? null;

export const allSuppliers = (): SupplierDTO[] => [...(base?.suppliers || [])];
export const activeSuppliers = (): SupplierDTO[] => allSuppliers().filter((s) => s.status === 'active');
export const findSupplier = (id: string | null): SupplierDTO | undefined =>
  id ? allSuppliers().find((s) => s.id === id) : undefined;

export const lastUsedCategory = (type: TxType): string | null => {
  const id = base?.lastCategory[type] ?? null;
  const c = findCategory(id);
  return c && c.status === 'active' ? c.id : null;
};

async function refreshBase(): Promise<void> {
  await loadBootstrap(true);
}

/* ---------- 账单 ---------- */

export const queryTransactions = (q: TxQuery): Promise<TxListResult> => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, String(v));
  const qs = p.toString();
  return get<TxListResult>(`/api/transactions${qs ? `?${qs}` : ''}`);
};

export interface TxSaveInput {
  type: TxType;
  amountYuan: string;
  categoryId: string;
  accountId: string;
  date: string;
  note: string;
  supplierId: string | null;
}

const txBody = (i: TxSaveInput) => ({
  type: i.type, amount: i.amountYuan, categoryId: i.categoryId,
  accountId: i.accountId, date: i.date, note: i.note, supplierId: i.supplierId,
});

export async function addTransaction(input: TxSaveInput): Promise<TxDTO> {
  const t = await post<TxDTO>('/api/transactions', txBody(input));
  await refreshBase(); // lastCategory 可能变化
  notify();
  return t;
}

export async function updateTransaction(id: string, input: TxSaveInput): Promise<TxDTO> {
  const t = await patch<TxDTO>(`/api/transactions/${id}`, txBody(input));
  await refreshBase();
  notify();
  return t;
}

export const getTransaction = (id: string): Promise<TxDTO | null> => get<TxDTO | null>(`/api/transactions/${id}`);

export const softDeleteTransaction = async (id: string): Promise<void> => { await del(`/api/transactions/${id}`); notify(); };
export const restoreTransaction = async (id: string): Promise<void> => { await post(`/api/transactions/${id}/restore`); notify(); };
export const purgeTransaction = async (id: string): Promise<void> => { await del(`/api/transactions/${id}?purge=1`); notify(); };

export const recycleBin = (): Promise<RecycleItemDTO[]> => get<RecycleItemDTO[]>('/api/recycle');

/* ---------- 分类 / 账户 / 供应商（写操作后刷新缓存） ---------- */

export async function addCategory(name: string, type: CategoryType, icon: string): Promise<void> {
  await post('/api/categories', { name, type, icon });
  await refreshBase(); notify();
}
export async function renameCategory(id: string, name: string): Promise<void> {
  await patch(`/api/categories/${id}`, { action: 'rename', name });
  await refreshBase(); notify();
}
export async function moveCategory(id: string, dir: -1 | 1): Promise<void> {
  await patch(`/api/categories/${id}`, { action: 'move', dir });
  await refreshBase(); notify();
}
export async function setCategoryStatus(id: string, status: 'active' | 'inactive'): Promise<void> {
  await patch(`/api/categories/${id}`, { action: 'status', status });
  await refreshBase(); notify();
}

export async function addAccount(name: string, icon: string): Promise<void> {
  await post('/api/accounts', { name, icon });
  await refreshBase(); notify();
}
export async function renameAccount(id: string, name: string): Promise<void> {
  await patch(`/api/accounts/${id}`, { action: 'rename', name });
  await refreshBase(); notify();
}
export async function moveAccount(id: string, dir: -1 | 1): Promise<void> {
  await patch(`/api/accounts/${id}`, { action: 'move', dir });
  await refreshBase(); notify();
}

export async function addSupplier(name: string): Promise<void> {
  await post('/api/suppliers', { name });
  await refreshBase(); notify();
}
export async function ensureSupplier(name: string): Promise<string | null> {
  if (!name.trim()) return null;
  const r = await post<{ id: string }>('/api/suppliers/ensure', { name: name.trim().slice(0, 12) });
  await refreshBase();
  return r.id;
}
export async function renameSupplier(id: string, name: string): Promise<void> {
  await patch(`/api/suppliers/${id}`, { action: 'rename', name });
  await refreshBase(); notify();
}
export async function moveSupplier(id: string, dir: -1 | 1): Promise<void> {
  await patch(`/api/suppliers/${id}`, { action: 'move', dir });
  await refreshBase(); notify();
}
export async function setSupplierStatus(id: string, status: 'active' | 'inactive'): Promise<void> {
  await patch(`/api/suppliers/${id}`, { action: 'status', status });
  await refreshBase(); notify();
}

/* ---------- 统计 / 预算 ---------- */

export const monthStats = (month: string): Promise<StatsDTO> =>
  get<StatsDTO>(`/api/stats/${month}?today=${todayStr()}`);

export const budgetState = (month: string): Promise<BudgetStateDTO | null> =>
  get<BudgetStateDTO | null>(`/api/budgets/${month}?today=${todayStr()}`);

export async function setBudget(month: string, cents: number | null): Promise<void> {
  if (cents == null) await del(`/api/budgets/${month}`);
  else await put(`/api/budgets/${month}`, { amount: (cents / 100).toFixed(2) });
  notify();
}

/** 80%/100% 提醒各触发一次：未触发则标记并返回 true */
export async function fireBudgetAlert(month: string, level: '80' | '100'): Promise<boolean> {
  const st = await budgetState(month);
  if (!st) return false;
  const fired = level === '80' ? st.fired80 : st.fired100;
  const reached = level === '80' ? st.pct >= 0.8 : st.pct >= 1;
  if (!reached || fired) return false;
  await post(`/api/budgets/${month}`, { level });
  return true;
}

/* ---------- 图片附件（R2 存储，客户端已压缩） ---------- */

export const photoUrl = (id: string): string => `/api/photos/${id}`;
export const photosOf = (txId: string): Promise<PhotoDTO[]> =>
  get<PhotoDTO[]>(`/api/photos?transactionId=${encodeURIComponent(txId)}`);

export async function uploadPhoto(txId: string, blob: Blob): Promise<PhotoDTO> {
  const form = new FormData();
  form.set('transactionId', txId);
  form.set('photos', blob, 'photo.jpg');
  const r = await request<{ photos: PhotoDTO[] }>('/api/photos', { method: 'POST', body: form });
  return r.photos[0]!;
}

export const deletePhoto = (id: string): Promise<void> => del(`/api/photos/${id}`);

/* ---------- 全局操作 ---------- */

export const clearAll = async (): Promise<void> => { await post('/api/data/clear'); await refreshBase(); notify(); };

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
  location.href = '/login';
}

/** CSV 导出：服务端生成（带 BOM），浏览器直接下载 */
export async function exportCSV(): Promise<number> {
  const res = await fetch('/api/export');
  if (!res.ok) throw new ApiFail(`导出失败（${res.status}）`, res.status);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `xiaoguanjia_${todayStr().replace(/-/g, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return Number(res.headers.get('x-export-count') || 0);
}
