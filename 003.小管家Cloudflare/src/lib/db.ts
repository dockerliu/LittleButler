/* DB 助手：从运行时上下文动态获取 D1 绑定（禁止模块级静态实例）
 * 规范：const db = drizzle(Astro.locals.runtime.env.DB) —— 每次请求取一次
 */
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { APIContext } from 'astro';
import * as schema from '../db/schema';

export type DB = DrizzleD1Database<typeof schema>;

export function getDb(c: APIContext): DB {
  return drizzle(c.locals.runtime.runtime.env.DB, { schema });
}

export const env = (c: APIContext) => c.locals.runtime.runtime.env;

/** 短随机 id（入库主键） */
export const newId = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

export const nowISO = (): string => new Date().toISOString();
