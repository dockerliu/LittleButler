import type { APIRoute } from 'astro';
import { ApiError, handle, ok, readJson, requireStr } from '../../../lib/http';
import { clearFails, createSession, lockedForMs, recordFail, setSessionCookie } from '../../../lib/auth';
import { getDb, env } from '../../../lib/db';
import { verifyLogin } from '../../../services/users';

/** POST /api/auth/login — 连错 5 次锁 5 分钟（KV 按账户计数，规则同旧版） */
export const POST: APIRoute = async (c) => handle(async () => {
  const body = await readJson<{ username?: string; password?: string; remember?: boolean }>(c);
  const username = requireStr(body.username, '用户名');
  const password = requireStr(body.password, '密码');
  const remember = body.remember === true;
  const kv = env(c).KV;

  const lock = await lockedForMs(kv, username);
  if (lock > 0) {
    throw new ApiError(`尝试次数过多，请约 ${Math.ceil(lock / 60000)} 分钟后再试`, 429);
  }

  try {
    const user = await verifyLogin(getDb(c), username, password);
    await clearFails(kv, username);
    const token = await createSession(kv, user.id, user.username, remember);
    setSessionCookie(c, token, remember);
    return ok({ username: user.username });
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      const f = await recordFail(kv, username);
      if (f.locked) throw new ApiError('错误次数过多，已锁定 5 分钟', 429);
      throw new ApiError(`用户名或密码错误（再错 ${f.left} 次将锁定 5 分钟）`);
    }
    throw e;
  }
});
