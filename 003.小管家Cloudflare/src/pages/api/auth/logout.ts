import type { APIRoute } from 'astro';
import { handle, ok } from '../../../lib/http';
import { destroySession } from '../../../lib/auth';
import { env } from '../../../lib/db';

/** POST /api/auth/logout */
export const POST: APIRoute = async (c) => handle(async () => {
  await destroySession(env(c).KV, c);
  return ok({});
});
