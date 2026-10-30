import type { APIRoute } from 'astro';
import { handle, ok, readJson, str } from '../../../../lib/http';
import { getDb } from '../../../../lib/db';
import { requireUser } from '../../../../lib/auth';
import { moveAccount, renameAccount } from '../../../../services/accounts';

/** PATCH /api/accounts/:id — { action: 'rename'|'move', ... } */
export const PATCH: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const db = getDb(c);
  const id = c.params.id!;
  const body = await readJson<{ action?: string; name?: string; dir?: number }>(c);

  switch (body.action) {
    case 'rename':
      await renameAccount(db, user.userId, id, str(body.name));
      break;
    case 'move':
      await moveAccount(db, user.userId, id, body.dir === -1 ? -1 : 1);
      break;
    default:
      return ok({ error: '未知操作' });
  }
  return ok({});
});
