import type { Account, Transaction, TransactionCategory, TransactionType } from '../types';
import { isDateInRange } from './dateUtils';

export interface TransactionFilterOptions {
  searchQuery?: string;
  type?: 'all' | TransactionType;
  accountId?: string;
  category?: 'all' | TransactionCategory;
  startDate?: string;
  endDate?: string;
}

export const INCOME_CATEGORIES: TransactionCategory[] = [
  'Salary',
  'Freelance',
  'Investments',
  'Other',
];

export const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'Housing',
  'Groceries',
  'Dining',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Other',
];

export const TRANSFER_CATEGORIES: TransactionCategory[] = ['Transfer'];

export const ALL_CATEGORIES: TransactionCategory[] = [
  'Salary',
  'Freelance',
  'Investments',
  'Housing',
  'Groceries',
  'Dining',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Transfer',
  'Other',
];

/**
 * Returns available transaction categories filtered by transaction type.
 */
export function getCategoriesForType(type: 'all' | TransactionType): TransactionCategory[] {
  switch (type) {
    case 'income':
      return INCOME_CATEGORIES;
    case 'expense':
      return EXPENSE_CATEGORIES;
    case 'transfer':
      return TRANSFER_CATEGORIES;
    case 'all':
    default:
      return ALL_CATEGORIES;
  }
}

/**
 * Returns true if any filter criteria (search, type, account, category, or date range) is active.
 */
export function hasActiveTransactionFilters(filters: TransactionFilterOptions): boolean {
  return (
    Boolean(filters.searchQuery?.trim()) ||
    (Boolean(filters.type) && filters.type !== 'all') ||
    (Boolean(filters.accountId) && filters.accountId !== 'all') ||
    (Boolean(filters.category) && filters.category !== 'all') ||
    Boolean(filters.startDate?.trim()) ||
    Boolean(filters.endDate?.trim())
  );
}

/**
 * Filters a list of transactions based on search query, type, account, category, and date range.
 * Properly handles transfers across both source and destination accounts.
 */
export function filterTransactions(
  transactions: Transaction[],
  accounts: Account[],
  filters: TransactionFilterOptions
): Transaction[] {
  const query = (filters.searchQuery || '').trim().toLowerCase();
  const filterType = filters.type || 'all';
  const filterAccount = filters.accountId || 'all';
  const filterCategory = filters.category || 'all';
  const { startDate, endDate } = filters;

  return transactions.filter((tx) => {
    // 1. Transaction Type filter
    if (filterType !== 'all' && tx.type !== filterType) {
      return false;
    }

    // 2. Category filter
    if (filterCategory !== 'all' && tx.category !== filterCategory) {
      return false;
    }

    // 3. Account filter
    if (filterAccount === 'unassigned') {
      if (tx.accountId || tx.toAccountId) {
        return false;
      }
    } else if (filterAccount !== 'all') {
      // For transfers, match if account is either source or destination.
      // For income/expense, match if account is linked.
      const isSource = tx.accountId === filterAccount;
      const isDestination = tx.type === 'transfer' && tx.toAccountId === filterAccount;
      if (!isSource && !isDestination) {
        return false;
      }
    }

    // 4. Date range filter
    if (startDate || endDate) {
      if (!isDateInRange(tx.date, startDate, endDate)) {
        return false;
      }
    }

    // 5. Search query (matches title, note, category, account names, and formatted amount)
    if (query) {
      const fromAccount = accounts.find((a) => a.id === tx.accountId);
      const toAccount = accounts.find((a) => a.id === tx.toAccountId);
      const accountNames = `${fromAccount?.name || ''} ${toAccount?.name || ''}`;
      const amountStr = tx.amount.toString();

      const matchesSearch =
        tx.title.toLowerCase().includes(query) ||
        tx.category.toLowerCase().includes(query) ||
        (tx.note && tx.note.toLowerCase().includes(query)) ||
        accountNames.toLowerCase().includes(query) ||
        amountStr.includes(query);

      if (!matchesSearch) {
        return false;
      }
    }

    return true;
  });
}
