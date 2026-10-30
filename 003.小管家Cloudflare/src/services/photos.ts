/* 图片附件服务（V1.0.2 / V2.0）：二进制只进 R2，D1 仅存元数据
 * - key：photos/<userId>/<transactionId>/<sort>-<rand>.jpg
 * - 客户端已 canvas 压缩（最长边 1280px、目标 ≤200KB），服务端只做类型/大小/数量守门
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { ApiError } from '../lib/http';
import { newId, nowISO, type DB } from '../lib/db';
import { photos } from '../db/schema';
import type { PhotoDTO } from '../lib/types';

export const MAX_PHOTOS_PER_TX = 5;
export const MAX_UPLOAD_BYTES = 512 * 1024; // 客户端压缩目标 ≤200KB，服务端留余量守门

const toDTO = (r: typeof photos.$inferSelect): PhotoDTO => ({
  id: r.id, transactionId: r.transactionId, sort: r.sort,
});

export async function photosOf(db: DB, userId: string, transactionId: string): Promise<PhotoDTO[]> {
  const rows = await db.select().from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.transactionId, transactionId)))
    .orderBy(asc(photos.sort));
  return rows.map(toDTO);
}

export async function addPhotos(
  db: DB, bucket: R2Bucket, userId: string, transactionId: string,
  files: { data: ArrayBuffer; contentType: string }[],
): Promise<PhotoDTO[]> {
  if (!files.length) throw new ApiError('未收到图片文件');
  const existing = await photosOf(db, userId, transactionId);
  if (existing.length + files.length > MAX_PHOTOS_PER_TX) {
    throw new ApiError(`每笔最多 ${MAX_PHOTOS_PER_TX} 张图片`);
  }
  const out: PhotoDTO[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    if (!/^image\/(jpeg|png|webp)$/.test(f.contentType)) throw new ApiError('仅支持 JPEG/PNG/WebP 图片');
    if (f.data.byteLength === 0 || f.data.byteLength > MAX_UPLOAD_BYTES) {
      throw new ApiError('单张图片需在压缩后 500KB 以内');
    }
    const sort = existing.length + i;
    const id = newId();
    const key = `photos/${userId}/${transactionId}/${sort}-${id.slice(0, 8)}.jpg`;
    await bucket.put(key, f.data, { httpMetadata: { contentType: f.contentType } });
    const row = { id, userId, transactionId, r2Key: key, size: f.data.byteLength, sort, createdAt: nowISO() };
    await db.insert(photos).values(row);
    out.push(toDTO(row));
  }
  return out;
}

export async function getPhoto(db: DB, bucket: R2Bucket, userId: string, id: string): Promise<{ row: typeof photos.$inferSelect; object: R2ObjectBody }> {
  const row = await db.select().from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.id, id))).get();
  if (!row) throw new ApiError('图片不存在', 404);
  // 防御：key 必须落在当前用户命名空间内
  if (!row.r2Key.startsWith(`photos/${userId}/`)) throw new ApiError('图片不存在', 404);
  const object = await bucket.get(row.r2Key);
  if (!object) throw new ApiError('图片不存在', 404);
  return { row, object };
}

/** 删除单张图片（R2 + 元数据） */
export async function deletePhoto(db: DB, bucket: R2Bucket, userId: string, id: string): Promise<void> {
  const row = await db.select().from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.id, id))).get();
  if (!row) throw new ApiError('图片不存在', 404);
  await bucket.delete(row.r2Key);
  await db.delete(photos).where(eq(photos.id, id));
}

/** 彻底删除账单时：清空其全部图片 */
export async function deleteAllForTransaction(db: DB, bucket: R2Bucket, userId: string, transactionId: string): Promise<void> {
  const rows = await db.select().from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.transactionId, transactionId)));
  for (const r of rows) await bucket.delete(r.r2Key);
  if (rows.length) {
    await db.delete(photos).where(and(eq(photos.userId, userId), eq(photos.transactionId, transactionId)));
  }
}

export async function countPhotos(db: DB, userId: string): Promise<number> {
  const n = await db.select({ n: sql<number>`count(*)` }).from(photos)
    .where(eq(photos.userId, userId)).get();
  return Number(n?.n ?? 0);
}
