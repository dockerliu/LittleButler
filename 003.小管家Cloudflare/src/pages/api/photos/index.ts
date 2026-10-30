import type { APIRoute } from 'astro';
import { ApiError, handle, ok } from '../../../lib/http';
import { getDb, env } from '../../../lib/db';
import { requireUser } from '../../../lib/auth';
import { addPhotos, photosOf, MAX_PHOTOS_PER_TX } from '../../../services/photos';

/** GET /api/photos?transactionId= — 某笔账单的图片元数据 */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const txId = c.url.searchParams.get('transactionId');
  if (!txId) throw new ApiError('缺少 transactionId');
  return ok(await photosOf(getDb(c), user.userId, txId));
});

/** POST /api/photos — multipart 上传（transactionId + photos[]，客户端已压缩） */
export const POST: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  let form: FormData;
  try {
    form = await c.request.formData();
  } catch {
    throw new ApiError('请求体不是合法的 multipart 表单');
  }
  const transactionId = String(form.get('transactionId') || '');
  if (!transactionId) throw new ApiError('缺少 transactionId');

  const files: { data: ArrayBuffer; contentType: string }[] = [];
  for (const f of form.getAll('photos')) {
    if (f instanceof File && f.size > 0) {
      files.push({ data: await f.arrayBuffer(), contentType: f.type || 'image/jpeg' });
    }
  }
  const saved = await addPhotos(getDb(c), env(c).MY_BUCKET, user.userId, transactionId, files);
  return ok({ photos: saved, total: MAX_PHOTOS_PER_TX });
});
