import type { Account, Transaction } from '../types';

/**
 * Calculates the current real balance for an account by applying all linked transactions
 * (income, expenses, and transfers) on top of the account's opening balance.
 *
 * Rules:
 * - Income linked to this account increases balance (+).
 * - Expense linked to this account decreases balance (-).
 * - Transfer with this account as source decreases balance (-).
 * - Transfer with this account as destination increases balance (+).
 * - Transactions without an accountId, or linked to other accounts, do not affect this account.
 */
export function calculateAccountBalance(
  account: Account,
  transactions: Transaction[]
): number {
  let balance = account.openingBalance;

  for (const tx of transactions) {
    if (tx.type === 'income') {
      if (tx.accountId === account.id) {
        balance += tx.amount;
      }
    } else if (tx.type === 'expense') {
      if (tx.accountId === account.id) {
        balance -= tx.amount;
      }
    } else if (tx.type === 'transfer') {
      // Source account loses funds
      if (tx.accountId === account.id) {
        balance -= tx.amount;
      }
      // Destination account receives funds
      if (tx.toAccountId === account.id) {
        balance += tx.amount;
      }
    }
  }

  // Round to 2 decimal places to prevent floating-point anomalies
  return Math.round((balance + Number.EPSILON) * 100) / 100;
}

/**
 * Returns transaction summary statistics for a given account.
 */
export function getAccountTransactionStats(
  accountId: string,
  transactions: Transaction[]
): {
  count: number;
  income: number;
  expense: number;
  transfers: number;
} {
  let count = 0;
  let income = 0;
  let expense = 0;
  let transfers = 0;

  for (const tx of transactions) {
    const isSource = tx.accountId === accountId;
    const isDest = tx.type === 'transfer' && tx.toAccountId === accountId;

    if (isSource || isDest) {
      count++;
      if (tx.type === 'income') {
        income += tx.amount;
      } else if (tx.type === 'expense') {
        expense += tx.amount;
      } else if (tx.type === 'transfer') {
        transfers++;
      }
    }
  }

  return {
    count,
    income: Math.round((income + Number.EPSILON) * 100) / 100,
    expense: Math.round((expense + Number.EPSILON) * 100) / 100,
    transfers,
  };
}

/**
 * Safely resolves an account name from an accountId, handling deleted or missing accounts.
 */
export function getAccountName(
  accountId: string | undefined,
  accounts: Account[]
): { name: string; isDeleted: boolean; account?: Account } {
  if (!accountId) {
    return { name: '', isDeleted: false };
  }
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    return { name: account.name, isDeleted: false, account };
  }
  return { name: 'Deleted Account', isDeleted: true };
}
