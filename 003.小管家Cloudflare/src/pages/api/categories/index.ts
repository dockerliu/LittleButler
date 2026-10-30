import type { APIRoute } from 'astro';
import { handle, ok, readJson, requireStr, str } from '../../../lib/http';
import { getDb } from '../../../lib/db';
import { requireUser } from '../../../lib/auth';
import { addCategory, listCategories } from '../../../services/categories';
import type { CategoryType } from '../../../lib/types';

/** GET /api/categories?type= */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const type = c.url.searchParams.get('type') as CategoryType | null;
  return ok(await listCategories(getDb(c), user.userId, type || undefined));
});

/** POST /api/categories */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const body = await readJson<Record<string, unknown>>(c);
  return ok(await addCategory(
    getDb(c), user.userId,
    requireStr(body.name, '分类名'),
    str(body.type) as CategoryType,
    str(body.icon) || '📦',
  ));
});
