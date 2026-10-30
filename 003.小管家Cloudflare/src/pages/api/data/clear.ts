import type { APIRoute } from 'astro';
import { handle, ok } from '../../../lib/http';
import { getDb, env } from '../../../lib/db';
import { requireUser } from '../../../lib/auth';
import { eq } from 'drizzle-orm';
import { transactions, photos, categories, accounts, suppliers, budgets } from '../../../db/schema';
import { seedDefaults } from '../../../services/users';

/** POST /api/data/clear — 清空所有数据：账单/图片/分类/账户/供应商/预算/偏好，并重置预置数据 */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const db = getDb(c);
  const { MY_BUCKET: bucket, KV: kv } = env(c);

  // 图片：先删 R2 对象，再清元数据
  const photoRows = await db.select().from(photos).where(eq(photos.userId, user.userId));
  for (const p of photoRows) await bucket.delete(p.r2Key);
  await db.delete(photos).where(eq(photos.userId, user.userId));

  await db.delete(transactions).where(eq(transactions.userId, user.userId));
  await db.delete(categories).where(eq(categories.userId, user.userId));
  await db.delete(accounts).where(eq(accounts.userId, user.userId));
  await db.delete(suppliers).where(eq(suppliers.userId, user.userId));
  await db.delete(budgets).where(eq(budgets.userId, user.userId));
  // 偏好与提醒标记清零
  await kv.delete(`set:${user.userId}`);

  await seedDefaults(db, user.userId);
  return ok({});
});
