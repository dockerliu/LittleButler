/* 服务端响应与客户端共享的 DTO 类型 */

export type TxType = 'expense' | 'income';
export type CategoryType = TxType;

export interface CategoryDTO {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  sort: number;
  status: 'active' | 'inactive';
  isDefault: boolean;
}

export interface AccountDTO {
  id: string;
  name: string;
  icon: string;
  type: string;
  sort: number;
}

export interface SupplierDTO {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  sort: number;
  createdAt: string;
}

export interface TxDTO {
  id: string;
  type: TxType;
  amount: number; // 分
  categoryId: string;
  supplierId: string | null;
  accountId: string;
  date: string;
  note: string;
  createdAt: string;
  photoCount: number;
}

export interface TxQuery {
  month?: string;
  start?: string;
  end?: string;
  type?: TxType;
  categoryId?: string;
  accountId?: string;
  supplierId?: string;
  keyword?: string;
}

export interface TxListResult {
  items: TxDTO[];
  expense: number;
  income: number;
}

export interface MonthSummaryDTO {
  expense: number;
  income: number;
  balance: number;
}

export interface CategorySumDTO {
  id: string;
  cents: number;
  name: string;
  icon: string;
  pct: number;
}

export interface DailyPointDTO {
  day: number;
  cents: number;
  weekend: boolean;
  isToday: boolean;
}

export interface BudgetStateDTO {
  budget: number;
  used: number;
  remaining: number;
  pct: number;
  dailyAvailable: number;
  overspent: number;
  daysLeft: number;
  daysInMonth: number;
  fired80: boolean;
  fired100: boolean;
}

export interface StatsDTO {
  summary: MonthSummaryDTO;
  prevSummary: MonthSummaryDTO;
  categorySums: CategorySumDTO[];
  supplierSums: CategorySumDTO[];
  dailySeries: DailyPointDTO[];
  sixMonth: { month: string; cents: number }[];
}

export interface BootstrapDTO {
  username: string;
  today: string;
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  suppliers: SupplierDTO[];
  lastCategory: { expense: string | null; income: string | null };
}

export interface PhotoDTO {
  id: string;
  transactionId: string;
  sort: number;
}

/** 用户偏好（KV：set:<userId>） */
export interface UserSettings {
  lastCategory: { expense: string | null; income: string | null };
  alerts: Record<string, Record<'80' | '100', boolean>>;
}

/** 回收站条目 */
export interface RecycleItemDTO extends TxDTO {
  deletedAt: string;
}
