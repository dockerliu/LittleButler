/* 金额换算（服务端与客户端共用）：一律以「分」为整数存储 */
export const MAX_YUAN = 99_999_999; // PRD 4.1 金额上限

/** '12.30' → 1230；空/负数/超两位小数/超上限 → null */
export function parseAmountToCents(input: string | number): number | null {
  const s = String(input).trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  if (cents <= 0 || cents > MAX_YUAN * 100) return null;
  return cents;
}

export function centsToYuanText(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
