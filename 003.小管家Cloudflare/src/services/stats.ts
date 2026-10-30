/* 统计服务 —— 唯一口径：按账单 date 归月、剔除已删除（与 PRD 第六、七节一致）
 * 聚合在 SQL 完成（D1），客户端不做第二套口径。
 */
import { and, eq, isNull, sql, gte, lte } from 'drizzle-orm';
import type { DB } from '../lib/db';
import { transactions, categories, suppliers } from '../db/schema';
import { daysInMonth, monthShift, pad, todayStr, weekdayOf } from '../lib/date';
import type { CategorySumDTO, DailyPointDTO, MonthSummaryDTO, StatsDTO, CategoryType } from '../lib/types';

const monthExpr = sql<string>`substr(${transactions.date}, 1, 7)`;

export async function monthSummary(db: DB, userId: string, month: string): Promise<MonthSummaryDTO> {
  const rows = await db.select({
    type: transactions.type,
    total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
  }).from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      sql`substr(${transactions.date}, 1, 7) = ${month}`,
    ))
    .groupBy(transactions.type);
  let expense = 0, income = 0;
  for (const r of rows) {
    if (r.type === 'expense') expense = Number(r.total);
    else income = Number(r.total);
  }
  return { expense, income, balance: income - expense };
}

interface SumRow { id: string | null; cents: number }

/** 分类占比（支出/收入），从高到低；名称取当前分类（已删除分类显示「未知分类」） */
export async function categorySums(db: DB, userId: string, month: string, type: CategoryType = 'expense'): Promise<CategorySumDTO[]> {
  const rows = await db.select({
    id: transactions.categoryId,
    cents: sql<number>`sum(${transactions.amount})`,
    name: categories.name,
    icon: categories.icon,
  }).from(transactions)
    .leftJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.userId, transactions.userId)))
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.type, type),
      sql`substr(${transactions.date}, 1, 7) = ${month}`,
    ))
    .groupBy(transactions.categoryId);

  const list: SumRow[] = rows.map(r => ({ id: r.id, cents: Number(r.cents) }));
  const total = list.reduce((s, v) => s + v.cents, 0);
  const nameMap = new Map(rows.filter(r => r.id).map(r => [r.id!, { name: r.name, icon: r.icon }]));
  return list
    .map(({ id, cents }) => {
      const meta = id ? nameMap.get(id) : undefined;
      return {
        id: id || '',
        cents,
        name: meta?.name || '未知分类',
        icon: meta?.icon || '❓',
        pct: total ? cents / total : 0,
      };
    })
    .sort((a, b) => b.cents - a.cents);
}

/** 供应商支出排行（V1.0.2），从高到低 */
export async function supplierSums(db: DB, userId: string, month: string, type: CategoryType = 'expense'): Promise<CategorySumDTO[]> {
  const rows = await db.select({
    id: transactions.supplierId,
    cents: sql<number>`sum(${transactions.amount})`,
    name: suppliers.name,
  }).from(transactions)
    .leftJoin(suppliers, and(eq(suppliers.id, transactions.supplierId), eq(suppliers.userId, transactions.userId)))
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.type, type),
      sql`${transactions.supplierId} is not null`,
      sql`substr(${transactions.date}, 1, 7) = ${month}`,
    ))
    .groupBy(transactions.supplierId);

  const list = rows.map(r => ({ id: r.id || '', cents: Number(r.cents) }));
  const total = list.reduce((s, v) => s + v.cents, 0);
  const nameMap = new Map(rows.filter(r => r.id).map(r => [r.id!, r.name]));
  return list
    .map(({ id, cents }) => ({
      id, cents,
      name: nameMap.get(id) || '未知供应商',
      icon: '🏪',
      pct: total ? cents / total : 0,
    }))
    .sort((a, b) => b.cents - a.cents);
}

/** 每日支出序列（整月，无消费日补 0）；isToday 按客户端传入的 today（时区一致） */
export async function dailyExpenseSeries(db: DB, userId: string, month: string, today = todayStr()): Promise<DailyPointDTO[]> {
  const rows = await db.select({
    day: sql<string>`substr(${transactions.date}, 9, 2)`,
    cents: sql<number>`sum(${transactions.amount})`,
  }).from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.type, 'expense'),
      sql`substr(${transactions.date}, 1, 7) = ${month}`,
    ))
    .groupBy(sql`substr(${transactions.date}, 9, 2)`);
  const byDay = new Map(rows.map(r => [Number(r.day), Number(r.cents)]));

  const days = daysInMonth(month);
  const out: DailyPointDTO[] = [];
  for (let day = 1; day <= days; day++) {
    const dateStr = `${month}-${pad(day)}`;
    const wd = weekdayOf(dateStr);
    out.push({
      day,
      cents: byDay.get(day) ?? 0,
      weekend: wd === 0 || wd === 6,
      isToday: dateStr === today,
    });
  }
  return out;
}

/** 近 N 个月支出（含 endMonth 往前推） */
export async function expenseByMonth(db: DB, userId: string, endMonth: string, count = 6): Promise<{ month: string; cents: number }[]> {
  const startMonth = monthShift(endMonth, -(count - 1));
  const rows = await db.select({
    m: monthExpr,
    cents: sql<number>`sum(${transactions.amount})`,
  }).from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.type, 'expense'),
      gte(transactions.date, `${startMonth}-01`),
      lte(transactions.date, `${endMonth}-31`),
    ))
    .groupBy(monthExpr);
  const map = new Map(rows.map(r => [r.m, Number(r.cents)]));
  const out: { month: string; cents: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = monthShift(endMonth, -i);
    out.push({ month: m, cents: map.get(m) ?? 0 });
  }
  return out;
}

/** 统计页一次聚合（减少边缘往返） */
export async function monthStats(db: DB, userId: string, month: string, today = todayStr()): Promise<StatsDTO> {
  const [summary, prevSummary, cats, sups, dailySeries, sixMonth] = await Promise.all([
    monthSummary(db, userId, month),
    monthSummary(db, userId, monthShift(month, -1)),
    categorySums(db, userId, month, 'expense'),
    supplierSums(db, userId, month),
    dailyExpenseSeries(db, userId, month, today),
    expenseByMonth(db, userId, month, 6),
  ]);
  return { summary, prevSummary, categorySums: cats, supplierSums: sups, dailySeries, sixMonth };
}
