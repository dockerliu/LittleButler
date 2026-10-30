import type { APIRoute } from 'astro';
import { handle, ok } from '../../lib/http';
import { getDb, env } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { todayStr } from '../../lib/date';
import { listCategories } from '../../services/categories';
import { listAccounts } from '../../services/accounts';
import { listSuppliers } from '../../services/suppliers';
import { readSettings } from '../../services/users';
import { purgeExpiredRecycle } from '../../services/transactions';
import type { BootstrapDTO } from '../../lib/types';

/** GET /api/bootstrap — 首屏一次拉齐：基础数据 + 用户偏好；顺带触发回收站超期清理 */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const db = getDb(c);

  const [categories, accounts, suppliers, settings] = await Promise.all([
    listCategories(db, user.userId),
    listAccounts(db, user.userId),
    listSuppliers(db, user.userId),
    readSettings(env(c).KV, user.userId),
  ]);
  await purgeExpiredRecycle(db, env(c).MY_BUCKET, user.userId);

  const data: BootstrapDTO = {
    username: user.username,
    today: todayStr(),
    categories,
    accounts,
    suppliers,
    lastCategory: settings.lastCategory,
  };
  return ok(data);
});
