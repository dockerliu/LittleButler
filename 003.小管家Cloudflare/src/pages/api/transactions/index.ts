import type { APIRoute } from 'astro';
import { handle, ok, readJson, requireStr, str } from '../../../lib/http';
import { getDb, env } from '../../../lib/db';
import { requireUser } from '../../../lib/auth';
import { addTransaction, queryTransactions, type TxInput } from '../../../services/transactions';
import type { TxQuery, TxType } from '../../../lib/types';

/** GET /api/transactions?month=&start=&end=&type=&categoryId=&accountId=&supplierId=&keyword= */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const p = c.url.searchParams;
  const q: TxQuery = {};
  const opt = (k: string) => { const v = p.get(k); if (v) q[k as keyof TxQuery] = v as never; };
  opt('month'); opt('start'); opt('end'); opt('type'); opt('categoryId'); opt('accountId'); opt('supplierId'); opt('keyword');
  return ok(await queryTransactions(getDb(c), user.userId, q));
});

/** POST /api/transactions — 记一笔 */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const body = await readJson<Record<string, unknown>>(c);
  const input: TxInput = {
    type: str(body.type) as TxType,
    amount: Number(body.amount) || 0,
    categoryId: requireStr(body.categoryId, '分类'),
    accountId: requireStr(body.accountId, '账户'),
    date: requireStr(body.date, '日期'),
    note: str(body.note),
    supplierId: str(body.supplierId) || null,
  };
  return ok(await addTransaction(getDb(c), env(c).KV, user.userId, input));
});
