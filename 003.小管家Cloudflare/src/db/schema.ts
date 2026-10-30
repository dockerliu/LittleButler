/* 小管家 — D1 数据库 Schema（唯一 Schema 定义，口径与 PRD 第六节一致）
 * - 金额一律以「分」为整数存储（amount 字段）
 * - 账单软删除（deletedAt），回收站保留 30 天
 * - 时间统一存 ISO 字符串；date 为 'YYYY-MM-DD'
 * - 图片二进制只进 R2，photos 表仅存元数据
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  salt: text('salt').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('users_username_uq').on(t.username)]);

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // expense / income
  icon: text('icon').notNull(),
  sort: integer('sort').notNull().default(0),
  status: text('status').notNull().default('active'), // active / inactive（只停用不删除）
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
}, t => [index('categories_user_idx').on(t.userId, t.type, t.sort)]);

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  type: text('type').notNull(), // cash / wechat / alipay / bank / credit / custom
  sort: integer('sort').notNull().default(0),
}, t => [index('accounts_user_idx').on(t.userId, t.sort)]);

export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  sort: integer('sort').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('suppliers_user_name_uq').on(t.userId, t.name)]);

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // expense / income
  amount: integer('amount').notNull(), // 分
  categoryId: text('category_id').notNull(),
  supplierId: text('supplier_id'),
  accountId: text('account_id').notNull(),
  date: text('date').notNull(), // 'YYYY-MM-DD'，统计按此归月
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'), // 软删除，null = 正常
}, t => [
  index('transactions_user_date_idx').on(t.userId, t.date),
  index('transactions_user_deleted_idx').on(t.userId, t.deletedAt),
]);

export const budgets = sqliteTable('budgets', {
  userId: text('user_id').notNull(),
  month: text('month').notNull(), // 'YYYY-MM'
  amount: integer('amount').notNull(), // 分
  updatedAt: text('updated_at').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.month] })]);

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  transactionId: text('transaction_id').notNull(),
  r2Key: text('r2_key').notNull(),
  size: integer('size').notNull().default(0),
  sort: integer('sort').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, t => [index('photos_tx_idx').on(t.userId, t.transactionId, t.sort)]);
