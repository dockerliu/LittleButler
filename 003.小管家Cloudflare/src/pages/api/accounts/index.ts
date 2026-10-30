import type { APIRoute } from 'astro';
import { handle, ok, readJson, requireStr, str } from '../../../lib/http';
import { getDb } from '../../../lib/db';
import { requireUser } from '../../../lib/auth';
import { addAccount, listAccounts } from '../../../services/accounts';

/** GET /api/accounts */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  return ok(await listAccounts(getDb(c), user.userId));
});

/** POST /api/accounts */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const body = await readJson<Record<string, unknown>>(c);
  return ok(await addAccount(getDb(c), user.userId, requireStr(body.name, '账户名'), str(body.icon) || '💰'));
});
