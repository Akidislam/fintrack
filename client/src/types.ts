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
  | 'Other'
  | (string & {});

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

export interface Person {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}

export interface UpdatePersonInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}

export interface GetPeopleParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export type LoanDirection = 'lent' | 'borrowed';
export type LoanInterestMethod = 'none' | 'simple' | 'flat';
export type LoanRepaymentMode = 'one_time' | 'installments';

export interface LoanInstallmentInput {
  dueDate: string;
  principalDue: string;
}

export interface CreateLoanInput {
  personId: string;
  type: LoanDirection;
  amount: string;
  accountId: string;
  currency?: string;
  startDate: string;
  dueDate?: string;
  interestMethod: LoanInterestMethod;
  annualRatePct: string;
  repaymentMode: LoanRepaymentMode;
  description?: string | null;
  installments?: LoanInstallmentInput[];
}

export interface CreatedLoan {
  id: string;
  userId: string;
  personId: string;
  personName: string;
  type: LoanDirection;
  amount: string;
  accountId: string;
  accountName: string;
  currency: string;
  startDate: string;
  dueDate: string;
  interestMethod: LoanInterestMethod;
  annualRatePct: string;
  repaymentMode: LoanRepaymentMode;
  description: string | null;
  status: string;
  currentScheduleVersion: number;
  schedule: {
    version: number;
    installments: Array<{
      installmentNumber: number;
      dueDate: string;
      principalDue: string;
      interestDue: string;
    }>;
  };
  createdAt: string;
}

export interface LoanListItem {
  id: string;
  person: { id: string; name: string };
  type: LoanDirection;
  amount: string;
  account: { id: string; name: string; type: string; currency: string } | null;
  currency: string;
  startDate: string;
  dueDate: string;
  interestMethod: LoanInterestMethod;
  annualRatePct: string;
  repaymentMode: LoanRepaymentMode;
  description: string | null;
  status: string;
  currentScheduleVersion: number;
  createdAt: string;
}

export interface GetLoansParams {
  limit?: number;
  offset?: number;
}
