/* 预算服务：月度总预算（评审决议：不做分类预算）+ 预算状态计算 + 80%/100% 提醒标记 */
import { and, eq } from 'drizzle-orm';
import { ApiError } from '../lib/http';
import { nowISO, type DB } from '../lib/db';
import { budgets } from '../db/schema';
import { daysInMonth, isMonthStr, monthOf, todayStr } from '../lib/date';
import { parseAmountToCents } from '../lib/money';
import type { BudgetStateDTO } from '../lib/types';
import { monthSummary } from './stats';
import { readSettings, writeSettings } from './users';

export async function getBudget(db: DB, userId: string, month: string): Promise<number | null> {
  assertMonth(month);
  const r = await db.select().from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.month, month))).get();
  return r ? r.amount : null;
}

export async function setBudget(db: DB, userId: string, month: string, amount: string | number): Promise<number> {
  assertMonth(month);
  const cents = parseAmountToCents(amount);
  if (!cents) throw new ApiError('请输入有效的预算金额');
  await db.insert(budgets)
    .values({ userId, month, amount: cents, updatedAt: nowISO() })
    .onConflictDoUpdate({ target: [budgets.userId, budgets.month], set: { amount: cents, updatedAt: nowISO() } });
  return cents;
}

export async function clearBudget(db: DB, userId: string, month: string): Promise<void> {
  assertMonth(month);
  await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, month)));
}

function assertMonth(month: string): void {
  if (!isMonthStr(month)) throw new ApiError('month 格式应为 YYYY-MM');
}

/** 预算状态：used 与 stats 同口径（按 date 归月、剔除已删除）；today 由客户端传入（时区一致） */
export async function budgetState(db: DB, kv: KVNamespace, userId: string, month: string, today = todayStr()): Promise<BudgetStateDTO | null> {
  assertMonth(month);
  const budget = await getBudget(db, userId, month);
  if (budget == null) return null;

  const used = (await monthSummary(db, userId, month)).expense;
  const remaining = budget - used;
  const days = daysInMonth(month);
  const daysLeft = month === monthOf(today) ? days - Number(today.slice(8)) + 1 : days;
  const pct = budget > 0 ? used / budget : 0;

  const settings = await readSettings(kv, userId);
  const alerts = settings.alerts[month] || ({} as Record<'80' | '100', boolean>);

  return {
    budget, used, remaining, pct,
    dailyAvailable: remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
    overspent: remaining < 0 ? -remaining : 0,
    daysLeft, daysInMonth: days,
    fired80: !!alerts['80'], fired100: !!alerts['100'],
  };
}

/** 80% / 100% 各提醒一次（每月每档一次，不重复骚扰）——标记存 KV */
export async function markAlert(kv: KVNamespace, userId: string, month: string, level: '80' | '100'): Promise<void> {
  assertMonth(month);
  const s = await readSettings(kv, userId);
  (s.alerts[month] = s.alerts[month] || ({} as Record<'80' | '100', boolean>))[level] = true;
  await writeSettings(kv, userId, s);
}
