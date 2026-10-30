/* 分类服务：增/改名/排序/停用（只停用不删除，历史账单不受影响） */
import { and, asc, eq, max } from 'drizzle-orm';
import { ApiError } from '../lib/http';
import { newId, type DB } from '../lib/db';
import { categories } from '../db/schema';
import type { CategoryDTO, CategoryType } from '../lib/types';

type Row = typeof categories.$inferSelect;
const toDTO = (r: Row): CategoryDTO => ({
  id: r.id, name: r.name, type: r.type as CategoryType, icon: r.icon,
  sort: r.sort, status: r.status as CategoryDTO['status'], isDefault: r.isDefault,
});

export async function listCategories(db: DB, userId: string, type?: CategoryType): Promise<CategoryDTO[]> {
  const rows = await db.select().from(categories)
    .where(type ? and(eq(categories.userId, userId), eq(categories.type, type)) : eq(categories.userId, userId))
    .orderBy(asc(categories.sort));
  return rows.map(toDTO);
}

export async function findCategory(db: DB, userId: string, id: string): Promise<Row | undefined> {
  return db.select().from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, id))).get();
}

export async function addCategory(db: DB, userId: string, name: string, type: CategoryType, icon: string): Promise<CategoryDTO> {
  const n = name.trim().slice(0, 6);
  if (!n) throw new ApiError('请输入分类名');
  if (type !== 'expense' && type !== 'income') throw new ApiError('分类类型不合法');
  const maxSort = await db.select({ v: max(categories.sort) }).from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.type, type))).get();
  const row = { id: newId(), userId, name: n, icon: icon || '📦', type, sort: (maxSort?.v ?? -1) + 1, status: 'active' as const, isDefault: false };
  await db.insert(categories).values(row);
  return toDTO(row as Row);
}

export async function renameCategory(db: DB, userId: string, id: string, name: string): Promise<void> {
  const n = name.trim().slice(0, 6);
  if (!n) throw new ApiError('请输入分类名');
  const c = await findCategory(db, userId, id);
  if (!c) throw new ApiError('分类不存在', 404);
  await db.update(categories).set({ name: n }).where(and(eq(categories.userId, userId), eq(categories.id, id)));
}

/** 与相邻项交换 sort，实现上移/下移 */
export async function moveCategory(db: DB, userId: string, id: string, dir: -1 | 1): Promise<void> {
  const c = await findCategory(db, userId, id);
  if (!c) throw new ApiError('分类不存在', 404);
  const list = await db.select().from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.type, c.type)))
    .orderBy(asc(categories.sort));
  const idx = list.findIndex(x => x.id === id);
  const swap = list[idx + dir];
  if (!swap) return;
  await db.update(categories).set({ sort: swap.sort }).where(eq(categories.id, c.id));
  await db.update(categories).set({ sort: c.sort }).where(eq(categories.id, swap.id));
}

export async function setCategoryStatus(db: DB, userId: string, id: string, status: 'active' | 'inactive'): Promise<void> {
  const c = await findCategory(db, userId, id);
  if (!c) throw new ApiError('分类不存在', 404);
  await db.update(categories).set({ status }).where(and(eq(categories.userId, userId), eq(categories.id, id)));
}
