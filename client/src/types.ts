export type TransactionType = 'income' | 'expense' | 'transfer';

export type TransactionCategory =
  | 'Salary'
  | 'Freelance'
  | 'Investments'
  | 'Housing'
  | 'Groceries'
  | 'Dining'
  | 'Transportation'
  | 'Utilities'
  | 'Entertainment'
  | 'Healthcare'
  | 'Shopping'
  | 'Transfer'
  | 'Other';

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  date: string;
  note?: string | null;
  /** Associated primary/source account ID */
  accountId?: string | null;
  /** Destination account ID (used when type === 'transfer') */
  toAccountId?: string | null;
}

export interface FinancialSummary {
  totalBalance: number;
  totalIncome: number;
  totalExpenses: number;
  savingsRate: number;
}

export interface CategoryBudget {
  id: string;
  category: TransactionCategory;
  monthlyLimit: number;
  userId?: string;
  categoryId?: string | null;
  categoryName?: string;
  currentSpent?: number;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type SupportedCurrency = 'USD' | 'BDT' | 'EUR' | 'GBP';

export type AccountType = 'Cash' | 'Bank Account' | 'Mobile Wallet' | 'Credit Card';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  /** ISO date string (YYYY-MM-DD) when the account was added */
  createdAt: string;
  note?: string;
  currency?: string;
  isArchived?: boolean;
  updatedAt?: string;
  currentBalance?: number;
  transactionCount?: number;
}

export interface Category {
  id: string;
  userId?: string | null;
  name: string;
  type: TransactionType;
  icon?: string | null;
  color?: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  currency: string;
  createdAt: string;
}
