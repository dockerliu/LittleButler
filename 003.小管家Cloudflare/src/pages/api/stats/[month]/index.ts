import type { APIRoute } from 'astro';
import { handle, ok } from '../../../../lib/http';
import { getDb } from '../../../../lib/db';
import { requireUser } from '../../../../lib/auth';
import { monthStats } from '../../../../services/stats';

/** GET /api/stats/:month?today=YYYY-MM-DD — 统计页一次聚合（汇总/环比/分类/供应商/每日/近6月） */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const month = c.params.month!;
  const today = c.url.searchParams.get('today') || undefined;
  return ok(await monthStats(getDb(c), user.userId, month, today));
});
