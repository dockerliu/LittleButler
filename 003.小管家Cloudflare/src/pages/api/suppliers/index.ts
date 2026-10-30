import type { APIRoute } from 'astro';
import { handle, ok, readJson, requireStr } from '../../../lib/http';
import { getDb } from '../../../lib/db';
import { requireUser } from '../../../lib/auth';
import { addSupplier, listSuppliers } from '../../../services/suppliers';

/** GET /api/suppliers */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  return ok(await listSuppliers(getDb(c), user.userId));
});

/** POST /api/suppliers */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const body = await readJson<Record<string, unknown>>(c);
  return ok(await addSupplier(getDb(c), user.userId, requireStr(body.name, '供应商名')));
});
