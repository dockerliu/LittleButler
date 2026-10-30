/* 账户/支付方式服务：增/改名/排序 */
import { and, asc, eq, max } from 'drizzle-orm';
import { ApiError } from '../lib/http';
import { newId, type DB } from '../lib/db';
import { accounts } from '../db/schema';
import type { AccountDTO } from '../lib/types';

type Row = typeof accounts.$inferSelect;
const toDTO = (r: Row): AccountDTO => ({ id: r.id, name: r.name, icon: r.icon, type: r.type, sort: r.sort });

export async function listAccounts(db: DB, userId: string): Promise<AccountDTO[]> {
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(asc(accounts.sort));
  return rows.map(toDTO);
}

export async function findAccount(db: DB, userId: string, id: string): Promise<Row | undefined> {
  return db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.id, id))).get();
}

export async function addAccount(db: DB, userId: string, name: string, icon: string): Promise<AccountDTO> {
  const n = name.trim().slice(0, 6);
  if (!n) throw new ApiError('请输入账户名');
  const maxSort = await db.select({ v: max(accounts.sort) }).from(accounts).where(eq(accounts.userId, userId)).get();
  const row = { id: newId(), userId, name: n, icon: icon || '💰', type: 'custom', sort: (maxSort?.v ?? -1) + 1 };
  await db.insert(accounts).values(row);
  return toDTO(row);
}

export async function renameAccount(db: DB, userId: string, id: string, name: string): Promise<void> {
  const n = name.trim().slice(0, 6);
  if (!n) throw new ApiError('请输入账户名');
  const a = await findAccount(db, userId, id);
  if (!a) throw new ApiError('账户不存在', 404);
  await db.update(accounts).set({ name: n }).where(and(eq(accounts.userId, userId), eq(accounts.id, id)));
}

export async function moveAccount(db: DB, userId: string, id: string, dir: -1 | 1): Promise<void> {
  const a = await findAccount(db, userId, id);
  if (!a) throw new ApiError('账户不存在', 404);
  const list = await db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(asc(accounts.sort));
  const idx = list.findIndex(x => x.id === id);
  const swap = list[idx + dir];
  if (!swap) return;
  await db.update(accounts).set({ sort: swap.sort }).where(eq(accounts.id, a.id));
  await db.update(accounts).set({ sort: a.sort }).where(eq(accounts.id, swap.id));
}
