import type { APIRoute } from 'astro';
import { handle } from '../../lib/http';
import { getDb } from '../../lib/db';
import { requireUser } from '../../lib/auth';
import { queryTransactions } from '../../services/transactions';
import { listCategories } from '../../services/categories';
import { listAccounts } from '../../services/accounts';
import { listSuppliers } from '../../services/suppliers';

/** GET /api/export — CSV 导出（UTF-8 带 BOM，Excel 中文不乱码；口径：剔除已删除） */
export const GET: APIRoute = async (c) => handle(async () => {
  const user = await requireUser(c);
  const db = getDb(c);

  const [{ items }, cats, accs, sups] = await Promise.all([
    queryTransactions(db, user.userId, {}),
    listCategories(db, user.userId),
    listAccounts(db, user.userId),
    listSuppliers(db, user.userId),
  ]);
  const catName = new Map(cats.map(x => [x.id, `${x.icon} ${x.name}`.slice(0, 12)]));
  const accName = new Map(accs.map(x => [x.id, x.name]));
  const supName = new Map(sups.map(x => [x.id, x.name]));

  const rows: string[][] = [['日期', '类型', '分类', '供应商', '账户', '金额(元)', '备注']];
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    rows.push([
      t.date,
      t.type === 'expense' ? '支出' : '收入',
      catName.get(t.categoryId) || '未知分类',
      t.supplierId ? supName.get(t.supplierId) || '' : '',
      accName.get(t.accountId) || '未知账户',
      (t.amount / 100).toFixed(2),
      t.note || '',
    ]);
  }

  const csv = '﻿' + rows.map(r =>
    r.map(v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','),
  ).join('\r\n');

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="xiaoguanjia_${stamp}.csv"`,
      'x-export-count': String(sorted.length),
    },
  });
});
