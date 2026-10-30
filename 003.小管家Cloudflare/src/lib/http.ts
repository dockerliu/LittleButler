/* API 响应助手：统一 {ok:true,data} | {ok:false,msg} 约定 */
import type { APIContext } from 'astro';

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers || {}) },
    ...init,
  });
}

export function fail(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, msg }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** 包一层：未捕获异常统一 500，不让堆栈泄给客户端 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return fail(e.message, e.status);
    console.error('[api]', e);
    return fail('服务暂时不可用，请稍后再试', 500);
  }
}

/** JSON body 读取与校验 */
export async function readJson<T extends object>(c: APIContext): Promise<T> {
  try {
    return (await c.request.json()) as T;
  } catch {
    throw new ApiError('请求体不是合法 JSON');
  }
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const requireStr = (v: unknown, field: string): string => {
  const s = str(v).trim();
  if (!s) throw new ApiError(`缺少字段：${field}`);
  return s;
};
