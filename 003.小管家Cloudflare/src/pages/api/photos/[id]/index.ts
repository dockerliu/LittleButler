import type { APIRoute } from 'astro';
import { handle, ok } from '../../../../lib/http';
import { getDb, env } from '../../../../lib/db';
import { requireUser } from '../../../../lib/auth';
import { deletePhoto, getPhoto } from '../../../../services/photos';

/** GET /api/photos/:id — 鉴权后从 R2 流式返回图片二进制 */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const { object } = await getPhoto(getDb(c), env(c).MY_BUCKET, user.userId, c.params.id!);
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'image/jpeg',
      'cache-control': 'private, max-age=31536000, immutable',
      etag: object.httpEtag,
    },
  });
});

/** DELETE /api/photos/:id */
export const DELETE: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  await deletePhoto(getDb(c), env(c).MY_BUCKET, user.userId, c.params.id!);
  return ok({});
});
