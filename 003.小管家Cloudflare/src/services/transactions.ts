/* 账单服务：CRUD / 软删除 / 回收站 / 查询
 * 口径（与 PRD 第六节一致）：金额以「分」存整数；软删除 deletedAt；
 * 统计按账单 date 归月、剔除已删除（统计函数见 stats.ts，同一口径）。
 */
import { and, desc, eq, gte, inArray, isNull, isNotNull, lte, sql } from 'drizzle-orm';
import { ApiError } from '../lib/http';
import { newId, nowISO, type DB } from '../lib/db';
import { transactions, photos, categories, accounts } from '../db/schema';
import { isDateStr, isMonthStr } from '../lib/date';
import { parseAmountToCents } from '../lib/money';
import type { TxDTO, TxQuery, TxType, UserSettings, RecycleItemDTO } from '../lib/types';
import { readSettings, writeSettings } from './users';
import { deleteAllForTransaction } from './photos';

type Row = typeof transactions.$inferSelect;

const isTxType = (v: unknown): v is TxType => v === 'expense' || v === 'income';

/** 同步「最近使用的分类」到用户偏好（KV） */
async function touchLastCategory(kv: KVNamespace, userId: string, type: TxType, categoryId: string): Promise<void> {
  const s: UserSettings = await readSettings(kv, userId);
  s.lastCategory[type] = categoryId;
  await writeSettings(kv, userId, s);
}

function buildFilters(userId: string, q: TxQuery) {
  const conds = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];
  if (q.month) {
    if (!isMonthStr(q.month)) throw new ApiError('month 格式应为 YYYY-MM');
    conds.push(sql`substr(${transactions.date}, 1, 7) = ${q.month}`);
  }
  if (q.start) {
    if (!isDateStr(q.start)) throw new ApiError('start 格式应为 YYYY-MM-DD');
    conds.push(gte(transactions.date, q.start));
  }
  if (q.end) {
    if (!isDateStr(q.end)) throw new ApiError('end 格式应为 YYYY-MM-DD');
    conds.push(lte(transactions.date, q.end));
  }
  if (q.type) {
    if (!isTxType(q.type)) throw new ApiError('type 应为 expense/income');
    conds.push(eq(transactions.type, q.type));
  }
  if (q.categoryId) conds.push(eq(transactions.categoryId, q.categoryId));
  if (q.accountId) conds.push(eq(transactions.accountId, q.accountId));
  if (q.supplierId) conds.push(eq(transactions.supplierId, q.supplierId));
  if (q.keyword) conds.push(sql`${transactions.note} LIKE ${'%' + q.keyword.replace(/[%_]/g, '\\$&') + '%'}`);
  return and(...conds);
}

const toDTO = (r: Row, photoCount = 0): TxDTO => ({
  id: r.id, type: r.type as TxType, amount: r.amount,
  categoryId: r.categoryId, supplierId: r.supplierId, accountId: r.accountId,
  date: r.date, note: r.note, createdAt: r.createdAt, photoCount,
});

/** 查询（含汇总，口径：剔除已删除；排序与旧版一致 date+createdAt 倒序） */
export async function queryTransactions(db: DB, userId: string, q: TxQuery): Promise<{ items: TxDTO[]; expense: number; income: number }> {
  const rows = await db.select().from(transactions)
    .where(buildFilters(userId, q))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));

  // 图片计数：一次 group by 查询补齐（图片与账单主体分开存储）
  const countMap = new Map<string, number>();
  if (rows.length) {
    const counts = await db.select({ txId: photos.transactionId, n: sql<number>`count(*)` })
      .from(photos)
      .where(and(eq(photos.userId, userId), inArray(photos.transactionId, rows.map(r => r.id))))
      .groupBy(photos.transactionId);
    for (const c of counts) countMap.set(c.txId, Number(c.n));
  }

  let expense = 0, income = 0;
  const items = rows.map(r => {
    if (r.type === 'expense') expense += r.amount; else income += r.amount;
    return toDTO(r, countMap.get(r.id) ?? 0);
  });
  return { items, expense, income };
}

export async function getTransaction(db: DB, userId: string, id: string): Promise<TxDTO | null> {
  const r = await db.select().from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id))).get();
  if (!r) return null;
  const n = await db.select({ n: sql<number>`count(*)` }).from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.transactionId, id))).get();
  return toDTO(r, Number(n?.n ?? 0));
}

export interface TxInput {
  type: TxType;
  amount: number;        // 元字符串或数字，服务端统一转分
  categoryId: string;
  accountId: string;
  date: string;
  note?: string;
  supplierId?: string | null;
}

/** 公共校验 + 转分 */
async function validateInput(db: DB, userId: string, input: TxInput): Promise<Row> {
  if (!isTxType(input.type)) throw new ApiError('type 应为 expense/income');
  const cents = parseAmountToCents(input.amount);
  if (!cents) throw new ApiError('金额需大于 0、最多两位小数，且不超过 99,999,999');
  if (!isDateStr(input.date)) throw new ApiError('日期格式应为 YYYY-MM-DD');
  const cat = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, input.categoryId))).get();
  if (!cat) throw new ApiError('分类不存在');
  const acc = await db.select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, input.accountId))).get();
  if (!acc) throw new ApiError('账户不存在');
  return {
    id: '', userId, type: input.type, amount: cents,
    categoryId: input.categoryId, accountId: input.accountId,
    supplierId: input.supplierId || null, date: input.date,
    note: (input.note || '').slice(0, 50),
    createdAt: '', updatedAt: '', deletedAt: null,
  };
}

export async function addTransaction(db: DB, kv: KVNamespace, userId: string, input: TxInput): Promise<TxDTO> {
  const v = await validateInput(db, userId, input);
  const now = nowISO();
  const row: Row = { ...v, id: newId(), createdAt: now, updatedAt: now };
  await db.insert(transactions).values(row);
  await touchLastCategory(kv, userId, row.type as TxType, row.categoryId);
  return toDTO(row);
}

export async function updateTransaction(db: DB, kv: KVNamespace, userId: string, id: string, input: TxInput): Promise<TxDTO> {
  const existing = await db.select().from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id))).get();
  if (!existing) throw new ApiError('账单不存在', 404);
  const v = await validateInput(db, userId, input);
  const row = { ...existing, ...v, id: existing.id, createdAt: existing.createdAt, updatedAt: nowISO(), deletedAt: existing.deletedAt };
  await db.update(transactions).set({
    type: row.type, amount: row.amount, categoryId: row.categoryId, accountId: row.accountId,
    supplierId: row.supplierId, date: row.date, note: row.note, updatedAt: row.updatedAt,
  }).where(and(eq(transactions.userId, userId), eq(transactions.id, id)));
  await touchLastCategory(kv, userId, row.type as TxType, row.categoryId);
  return toDTO(row);
}

export async function softDeleteTransaction(db: DB, userId: string, id: string): Promise<void> {
  const r = await db.update(transactions).set({ deletedAt: nowISO() })
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id), isNull(transactions.deletedAt)))
    .returning({ id: transactions.id });
  if (!r.length) throw new ApiError('账单不存在', 404);
}

export async function restoreTransaction(db: DB, userId: string, id: string): Promise<void> {
  const r = await db.update(transactions).set({ deletedAt: null })
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id), isNotNull(transactions.deletedAt)))
    .returning({ id: transactions.id });
  if (!r.length) throw new ApiError('账单不在回收站中', 404);
}

/** 彻底删除：账单行 + 图片（R2 与元数据）一并清除 */
export async function purgeTransaction(db: DB, bucket: R2Bucket, userId: string, id: string): Promise<void> {
  const r = await db.delete(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
    .returning({ id: transactions.id });
  if (!r.length) throw new ApiError('账单不存在', 404);
  await deleteAllForTransaction(db, bucket, userId, id);
}

/* ---------- 回收站 ---------- */

export async function recycleBin(db: DB, userId: string): Promise<RecycleItemDTO[]> {
  const rows = await db.select().from(transactions)
    .where(and(eq(transactions.userId, userId), isNotNull(transactions.deletedAt)))
    .orderBy(desc(transactions.deletedAt));
  return rows.map(r => ({ ...toDTO(r), deletedAt: r.deletedAt! }));
}

/** 回收站超期自动清理（> 30 天彻底删除），load/查询时触发 */
export async function purgeExpiredRecycle(db: DB, bucket: R2Bucket, userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const expired = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.userId, userId), isNotNull(transactions.deletedAt), lte(transactions.deletedAt, cutoff)));
  for (const t of expired) {
    await db.delete(transactions).where(eq(transactions.id, t.id));
    await deleteAllForTransaction(db, bucket, userId, t.id);
  }
}
