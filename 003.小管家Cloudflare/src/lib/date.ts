/* 日期纯函数（服务端 services 与客户端 scripts 共用）
 * 口径：date 一律 'YYYY-MM-DD'，month 一律 'YYYY-MM'，按 date 归月
 */
export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export const pad = (n: number) => String(n).padStart(2, '0');

export function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const currentMonth = (now = new Date()) => todayStr(now).slice(0, 7);

export const monthOf = (dateStr: string) => dateStr.slice(0, 7);

export function monthShift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
}

/** 0 = 周日 */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, d).getDay();
}

export const isDateStr = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const isMonthStr = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
