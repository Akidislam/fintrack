export type AccountType =
  | 'Cash'
  | 'Bank Account'
  | 'Mobile Wallet'
  | 'Credit Card';

export type CategoryType = 'income' | 'expense' | 'transfer';

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  currency: string;
  note: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  currentBalance: number;
  transactionCount: number;
}

export interface CreateAccountDTO {
  name: string;
  type: AccountType;
  openingBalance?: number;
  currency?: string;
  note?: string;
}

export interface UpdateAccountDTO {
  name?: string;
  type?: AccountType;
  openingBalance?: number;
  currency?: string;
  note?: string | null;
  isArchived?: boolean;
}

export interface CategoryResponse {
  id: string;
  userId: string | null;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}
