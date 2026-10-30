import type { APIRoute } from 'astro';
import { handle, ok } from '../../../../lib/http';
import { getDb } from '../../../../lib/db';
import { requireUser } from '../../../../lib/auth';
import { restoreTransaction } from '../../../../services/transactions';

/** POST /api/transactions/:id/restore — 从回收站恢复 */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  await restoreTransaction(getDb(c), user.userId, c.params.id!);
  return ok({});
});
