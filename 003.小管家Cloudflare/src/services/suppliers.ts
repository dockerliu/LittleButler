/* 供应商服务（V1.0.2）：可选字段，记账时输入新名称自动创建（同名直接复用） */
import { and, asc, eq, max } from 'drizzle-orm';
import { ApiError } from '../lib/http';
import { newId, nowISO, type DB } from '../lib/db';
import { suppliers } from '../db/schema';
import type { SupplierDTO } from '../lib/types';

type Row = typeof suppliers.$inferSelect;
const toDTO = (r: Row): SupplierDTO => ({
  id: r.id, name: r.name, status: r.status as SupplierDTO['status'], sort: r.sort, createdAt: r.createdAt,
});

export async function listSuppliers(db: DB, userId: string): Promise<SupplierDTO[]> {
  const rows = await db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(asc(suppliers.sort));
  return rows.map(toDTO);
}

export async function findSupplier(db: DB, userId: string, id: string): Promise<Row | undefined> {
  return db.select().from(suppliers).where(and(eq(suppliers.userId, userId), eq(suppliers.id, id))).get();
}

/** 记账页入口：输入名称即确保存在（同名含已停用直接复用） */
export async function ensureSupplier(db: DB, userId: string, rawName: string): Promise<string> {
  const n = rawName.trim().slice(0, 12);
  if (!n) throw new ApiError('请输入供应商名');
  const found = await db.select().from(suppliers)
    .where(and(eq(suppliers.userId, userId), eq(suppliers.name, n))).get();
  if (found) return found.id;
  const maxSort = await db.select({ v: max(suppliers.sort) }).from(suppliers).where(eq(suppliers.userId, userId)).get();
  const row = { id: newId(), userId, name: n, status: 'active' as const, sort: (maxSort?.v ?? -1) + 1, createdAt: nowISO() };
  await db.insert(suppliers).values(row);
  return row.id;
}

export async function addSupplier(db: DB, userId: string, rawName: string): Promise<SupplierDTO> {
  const id = await ensureSupplier(db, userId, rawName);
  const row = await findSupplier(db, userId, id);
  if (!row) throw new ApiError('创建供应商失败', 500);
  return toDTO(row);
}

export async function renameSupplier(db: DB, userId: string, id: string, rawName: string): Promise<void> {
  const n = rawName.trim().slice(0, 12);
  if (!n) throw new ApiError('请输入供应商名');
  const s = await findSupplier(db, userId, id);
  if (!s) throw new ApiError('供应商不存在', 404);
  await db.update(suppliers).set({ name: n }).where(and(eq(suppliers.userId, userId), eq(suppliers.id, id)));
}

export async function moveSupplier(db: DB, userId: string, id: string, dir: -1 | 1): Promise<void> {
  const s = await findSupplier(db, userId, id);
  if (!s) throw new ApiError('供应商不存在', 404);
  const list = await db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(asc(suppliers.sort));
  const idx = list.findIndex(x => x.id === id);
  const swap = list[idx + dir];
  if (!swap) return;
  await db.update(suppliers).set({ sort: swap.sort }).where(eq(suppliers.id, s.id));
  await db.update(suppliers).set({ sort: s.sort }).where(eq(suppliers.id, swap.id));
}

export async function setSupplierStatus(db: DB, userId: string, id: string, status: 'active' | 'inactive'): Promise<void> {
  const s = await findSupplier(db, userId, id);
  if (!s) throw new ApiError('供应商不存在', 404);
  await db.update(suppliers).set({ status }).where(and(eq(suppliers.userId, userId), eq(suppliers.id, id)));
}
