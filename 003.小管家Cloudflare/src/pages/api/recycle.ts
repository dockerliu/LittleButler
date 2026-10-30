import type { APIRoute } from 'astro';
import { handle, ok } from '../../lib/http';
import { getDb, env } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { purgeExpiredRecycle, recycleBin } from '../../services/transactions';

/** GET /api/recycle — 回收站列表（30 天内可恢复） */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const db = getDb(c);
  await purgeExpiredRecycle(db, env(c).MY_BUCKET, user.userId);
  return ok(await recycleBin(db, user.userId));
});
