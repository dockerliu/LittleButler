import type { APIRoute } from 'astro';
import { ApiError, handle, ok, readJson, str } from '../../../../lib/http';
import { getDb, env } from '../../../../lib/db';
import { requireUser } from '../../../../lib/auth';
import { budgetState, clearBudget, markAlert, setBudget } from '../../../../services/budgets';

function monthParam(c: { params: Record<string, string | undefined> }): string {
  const m = c.params.month!;
  if (!/^\d{4}-\d{2}$/.test(m)) throw new ApiError('month 格式应为 YYYY-MM');
  return m;
}

/** GET /api/budgets/:month?today=YYYY-MM-DD — 预算 + 状态（used 与统计同口径） */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const month = monthParam(c);
  const today = c.url.searchParams.get('today') || undefined;
  return ok(await budgetState(getDb(c), env(c).KV, user.userId, month, today));
});

/** PUT /api/budgets/:month — { amount: 元 } 设置/修改预算 */
export const PUT: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const body = await readJson<Record<string, unknown>>(c);
  const cents = await setBudget(getDb(c), user.userId, monthParam(c), (body.amount ?? '') as string | number);
  return ok({ amount: cents });
});

/** DELETE /api/budgets/:month — 清除预算 */
export const DELETE: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  await clearBudget(getDb(c), user.userId, monthParam(c));
  return ok({});
});

/** POST /api/budgets/:month — { level: '80'|'100' } 标记提醒已触发（各提醒一次） */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const month = monthParam(c);
  const body = await readJson<{ level?: string }>(c);
  const level = str(body.level);
  if (level !== '80' && level !== '100') throw new ApiError('level 应为 80/100');
  await markAlert(env(c).KV, user.userId, month, level);
  return ok({});
});
