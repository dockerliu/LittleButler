import type { APIRoute } from 'astro';
import { handle, ok, readJson, requireStr, str } from '../../../../lib/http';
import { getDb, env } from '../../../../lib/db';
import { requireUser } from '../../../../lib/auth';
import { getTransaction, purgeTransaction, softDeleteTransaction, updateTransaction, type TxInput } from '../../../../services/transactions';

/** GET /api/transactions/:id */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const tx = await getTransaction(getDb(c), user.userId, c.params.id!);
  return ok(tx);
});

/** PATCH /api/transactions/:id — 编辑 */
export const PATCH: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const body = await readJson<Record<string, unknown>>(c);
  const input: TxInput = {
    type: str(body.type) as TxInput['type'],
    amount: Number(body.amount) || 0,
    categoryId: requireStr(body.categoryId, '分类'),
    accountId: requireStr(body.accountId, '账户'),
    date: requireStr(body.date, '日期'),
    note: str(body.note),
    supplierId: str(body.supplierId) || null,
  };
  return ok(await updateTransaction(getDb(c), env(c).KV, user.userId, c.params.id!, input));
});

/** DELETE /api/transactions/:id — 软删除；?purge=1 彻底删除（图片一并清除） */
export const DELETE: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const id = c.params.id!;
  if (c.url.searchParams.get('purge') === '1') {
    await purgeTransaction(getDb(c), env(c).MY_BUCKET, user.userId, id);
  } else {
    await softDeleteTransaction(getDb(c), user.userId, id);
  }
  return ok({});
});
