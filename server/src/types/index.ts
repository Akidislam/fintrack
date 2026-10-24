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
