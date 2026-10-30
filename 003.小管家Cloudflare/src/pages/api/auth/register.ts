import type { APIRoute } from 'astro';
import { handle, readJson, requireStr, ok } from '../../../lib/http';
import { createSession, setSessionCookie } from '../../../lib/auth';
import { getDb, env } from '../../../lib/db';
import { registerUser } from '../../../services/users';

/** POST /api/auth/register — 注册即登录（7 天免登录，与旧版一致） */
export const POST: APIRoute = async (c) => handle(async () => {
  const body = await readJson<{ username?: string; password?: string }>(c);
  const username = requireStr(body.username, '用户名');
  const password = requireStr(body.password, '密码');

  const user = await registerUser(getDb(c), username, password);
  const token = await createSession(env(c).KV, user.id, user.username, true);
  setSessionCookie(c, token, true);
  return ok({ username: user.username });
});
