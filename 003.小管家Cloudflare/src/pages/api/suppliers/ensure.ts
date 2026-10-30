import type { APIRoute } from 'astro';
import { handle, ok, readJson, requireStr } from '../../../lib/http';
import { getDb } from '../../../lib/db';
import { requireUser } from '../../../lib/auth';
import { ensureSupplier } from '../../../services/suppliers';

/** POST /api/suppliers/ensure — 记账入口：输入名称即确保存在，返回 supplierId */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const body = await readJson<{ name?: string }>(c);
  const id = await ensureSupplier(getDb(c), user.userId, requireStr(body.name, '供应商名'));
  return ok({ id });
});
