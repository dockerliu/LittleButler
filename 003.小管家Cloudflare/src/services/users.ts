/* 用户服务：注册（含预置数据种子）与登录校验 */
import { eq } from 'drizzle-orm';
import { ApiError } from '../lib/http';
import { newId, nowISO, type DB } from '../lib/db';
import { hashPassword, randomHex, safeEqual } from '../lib/auth';
import { users, categories, accounts } from '../db/schema';
import type { CategoryDTO, UserSettings } from '../lib/types';

/* 预置数据（评审决议：默认分类 9 支出 + 5 收入、默认账户 5 项，不调整） */
const DEFAULT_EXPENSE = [['餐饮', '🍜'], ['交通', '🚌'], ['购物', '🛒'], ['居住', '🏠'], ['娱乐', '🎮'], ['医疗', '💊'], ['教育', '📚'], ['人情往来', '🎁'], ['其他', '📦']] as const;
const DEFAULT_INCOME = [['工资', '💼'], ['兼职', '🧾'], ['理财收益', '📈'], ['红包礼金', '🧧'], ['其他', '✨']] as const;
const DEFAULT_ACCOUNTS = [['现金', '💵', 'cash'], ['微信', '💚', 'wechat'], ['支付宝', '💙', 'alipay'], ['银行卡', '🏦', 'bank'], ['信用卡', '💳', 'credit']] as const;

export async function registerUser(db: DB, username: string, password: string): Promise<{ id: string; username: string }> {
  if (!/^[^\s]{2,16}$/.test(username)) throw new ApiError('用户名需 2–16 位且不含空格');
  if (password.length < 6) throw new ApiError('密码至少 6 位');

  const exists = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
  if (exists) throw new ApiError('该用户名已被注册');

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const id = newId();

  await db.insert(users).values({ id, username, salt, passwordHash, createdAt: nowISO() });
  await seedDefaults(db, id);

  return { id, username };
}

/** 预置分类与账户（注册与「清空所有数据」共用） */
export async function seedDefaults(db: DB, userId: string): Promise<void> {
  const catRows: (typeof categories.$inferInsert)[] = [];
  let sort = 0;
  for (const [name, icon] of DEFAULT_EXPENSE) {
    catRows.push({ id: newId(), userId, name, icon, type: 'expense', sort: sort++, status: 'active', isDefault: true });
  }
  sort = 0;
  for (const [name, icon] of DEFAULT_INCOME) {
    catRows.push({ id: newId(), userId, name, icon, type: 'income', sort: sort++, status: 'active', isDefault: true });
  }
  await db.insert(categories).values(catRows);
  await db.insert(accounts).values(
    DEFAULT_ACCOUNTS.map(([name, icon, type], i) => ({ id: newId(), userId, name, icon, type, sort: i })),
  );
}

export async function verifyLogin(db: DB, username: string, password: string): Promise<{ id: string; username: string }> {
  const user = await db.select().from(users).where(eq(users.username, username)).get();
  // 用户不存在时也做一次哈希，避免响应时间暴露账户是否存在
  const salt = user?.salt ?? 'xgj-dummy-salt';
  const hash = await hashPassword(password, salt);
  if (!user || !safeEqual(hash, user.passwordHash)) {
    throw new ApiError('用户名或密码错误');
  }
  return { id: user.id, username: user.username };
}

export const emptySettings = (): UserSettings => ({ lastCategory: { expense: null, income: null }, alerts: {} });

/** 用户偏好存 KV：set:<userId>（lastCategory、预算提醒触发标记） */
export async function readSettings(kv: KVNamespace, userId: string): Promise<UserSettings> {
  try {
    const raw = await kv.get(`set:${userId}`);
    if (raw) {
      const v = JSON.parse(raw) as UserSettings;
      return { ...emptySettings(), ...v, lastCategory: { ...emptySettings().lastCategory, ...v.lastCategory } };
    }
  } catch { /* ignore */ }
  return emptySettings();
}

export async function writeSettings(kv: KVNamespace, userId: string, s: UserSettings): Promise<void> {
  await kv.put(`set:${userId}`, JSON.stringify(s));
}

export type { CategoryDTO };
