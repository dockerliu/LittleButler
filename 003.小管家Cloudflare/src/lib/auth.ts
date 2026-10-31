/* 认证核心（V2.0 云端账户，PRD 4.7 增补）
 * 边缘安全规范：全部使用 Web Crypto / Web 标准 API，无 Node 模块。
 * - 密码：随机盐 + PBKDF2-SHA256（10 万次迭代）服务端哈希
 * - 会话：随机 token 存 KV（TTL 即会话期）+ HttpOnly/Secure/SameSite=Lax Cookie
 * - 频控：连错 5 次锁 5 分钟（KV 按账户计数）
 */
import type { APIContext } from 'astro';
import { ApiError } from './http';

export const SESSION_COOKIE = 'xgj_session';
const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_REMEMBER = 7 * 86400;   // 7 天免登录
const SESSION_TTL_PLAIN = 12 * 3600;      // 不勾选：12 小时
export const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

export const toHex = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
};

export function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

/** PBKDF2-SHA256 派生 → 64 位十六进制 */
async function pbkdf2(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS },
    key, 256,
  );
  return toHex(bits);
}

export const hashPassword = (password: string, salt: string) => pbkdf2(password, salt);

/** 常数时间比较，防时序侧信道 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- 会话（KV） ---------- */

interface SessionValue { userId: string; username: string }

export async function createSession(
  kv: KVNamespace, userId: string, username: string, remember: boolean,
): Promise<string> {
  const token = randomHex(32);
  const ttl = remember ? SESSION_TTL_REMEMBER : SESSION_TTL_PLAIN;
  await kv.put(`sess:${token}`, JSON.stringify({ userId, username } satisfies SessionValue), { expirationTtl: ttl });
  return token;
}

export function setSessionCookie(c: APIContext, token: string, remember: boolean): void {
  c.cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    // 记住：7 天；否则浏览器会话 Cookie（KV 侧 12h 兜底过期）
    ...(remember ? { maxAge: SESSION_TTL_REMEMBER } : {}),
  });
}

export function clearSessionCookie(c: APIContext): void {
  c.cookies.set(SESSION_COOKIE, '', { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0 });
}

/** 从请求中解析会话，无效/过期返回 null */
export async function getSession(kv: KVNamespace, c: APIContext): Promise<SessionValue | null> {
  const token = c.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const raw = await kv.get(`sess:${token}`);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SessionValue;
    return v?.userId ? v : null;
  } catch {
    return null;
  }
}

export async function destroySession(kv: KVNamespace, c: APIContext): Promise<void> {
  const token = c.cookies.get(SESSION_COOKIE)?.value;
  if (token) await kv.delete(`sess:${token}`);
  clearSessionCookie(c);
}

/** API 路由专用：未登录直接抛 401 */
export async function requireUser(c: APIContext): Promise<SessionValue> {
  const s = await getSession((c as APIContext & { env: any }).env.xgj_kv, c);
  if (!s) throw new ApiError('请先登录', 401);
  return s;
}

/* ---------- 登录频控（KV 按账户计数） ---------- */

interface FailState { count: number; until: number }

export async function lockedForMs(kv: KVNamespace, username: string): Promise<number> {
  const raw = await kv.get(`fail:${username}`);
  if (!raw) return 0;
  try {
    const f = JSON.parse(raw) as FailState;
    return f.until > Date.now() ? f.until - Date.now() : 0;
  } catch {
    return 0;
  }
}

export async function recordFail(kv: KVNamespace, username: string): Promise<{ locked: boolean; left: number }> {
  let f: FailState = { count: 0, until: 0 };
  try {
    f = (JSON.parse((await kv.get(`fail:${username}`)) || '') as FailState) || f;
  } catch { /* 首次失败无记录 */ }
  f.count += 1;
  if (f.count >= MAX_FAILS) {
    f.until = Date.now() + LOCK_MS;
    f.count = 0;
  }
  await kv.put(`fail:${username}`, JSON.stringify(f), { expirationTtl: LOCK_MS / 1000 + 60 });
  return { locked: f.until > Date.now(), left: MAX_FAILS - f.count };
}

export async function clearFails(kv: KVNamespace, username: string): Promise<void> {
  await kv.delete(`fail:${username}`);
}
