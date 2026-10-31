/* DB 助手：从运行时上下文动态获取 D1 绑定（禁止模块级静态实例）
 * 在 Cloudflare Pages 中，环境变量通过 getRuntimeConfig() 获取
 */
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { APIContext } from 'astro';
import * as schema from '../db/schema';

export type DB = DrizzleD1Database<typeof schema>;

export function getDb(c: APIContext): DB {
  return drizzle((c as APIContext & { env: any }).env.xgj_db, { schema });
}

// 前端页面直接访问 Astro.env
// API 路由通过 env(c) 获取
export const env = (c: APIContext) => (c as APIContext & { env: any }).env;

/** 短随机 id（入库主键） */
export const newId = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 20);

export const nowISO = (): string => new Date().toISOString();
