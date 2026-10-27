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

export interface CreateCategoryDTO {
  name: string;
  type: CategoryType;
  icon?: string;
  color?: string;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface TransactionResponse {
  id: string;
  userId: string;
  title: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  category: string;
  categoryName: string;
  date: string;
  note: string | null;
  accountId: string | null;
  toAccountId: string | null;
  accountName: string | null;
  toAccountName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionDTO {
  title: string;
  amount: number;
  type: TransactionType;
  category?: string;
  categoryName?: string;
  categoryId?: string;
  date: string;
  note?: string;
  accountId?: string;
  toAccountId?: string;
}

export interface UpdateTransactionDTO {
  title?: string;
  amount?: number;
  type?: TransactionType;
  category?: string;
  categoryName?: string;
  categoryId?: string | null;
  date?: string;
  note?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  currency: string;
  createdAt: string;
}

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  currency?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}
