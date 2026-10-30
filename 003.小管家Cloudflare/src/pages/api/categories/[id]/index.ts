import type { APIRoute } from 'astro';
import { handle, ok, readJson, str } from '../../../../lib/http';
import { getDb } from '../../../../lib/db';
import { requireUser } from '../../../../lib/auth';
import { moveCategory, renameCategory, setCategoryStatus } from '../../../../services/categories';

/** PATCH /api/categories/:id — { action: 'rename'|'move'|'status', ... } */
export const PATCH: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const db = getDb(c);
  const id = c.params.id!;
  const body = await readJson<{ action?: string; name?: string; dir?: number; status?: string }>(c);

  switch (body.action) {
    case 'rename':
      await renameCategory(db, user.userId, id, str(body.name));
      break;
    case 'move':
      await moveCategory(db, user.userId, id, body.dir === -1 ? -1 : 1);
      break;
    case 'status':
      await setCategoryStatus(db, user.userId, id, body.status === 'inactive' ? 'inactive' : 'active');
      break;
    default:
      return ok({ error: '未知操作' });
  }
  return ok({});
});
