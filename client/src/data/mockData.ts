import type { Transaction, CategoryBudget } from '../types';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    title: 'Salary Deposit - Acme Corp',
    amount: 4850.0,
    type: 'income',
    category: 'Salary',
    date: '2026-10-01',
    note: 'Monthly net payroll',
  },
  {
    id: 'tx-2',
    title: 'Apartment Rent',
    amount: 1450.0,
    type: 'expense',
    category: 'Housing',
    date: '2026-10-03',
    note: 'October lease payment',
  },
  {
    id: 'tx-3',
    title: 'Whole Foods Market',
    amount: 142.3,
    type: 'expense',
    category: 'Groceries',
    date: '2026-10-06',
    note: 'Weekly grocery run',
  },
  {
    id: 'tx-4',
    title: 'Freelance Design Retainer',
    amount: 950.0,
    type: 'income',
    category: 'Freelance',
    date: '2026-10-08',
    note: 'Mobile app UI design',
  },
  {
    id: 'tx-5',
    title: 'Electric & Gas Utility',
    amount: 86.5,
    type: 'expense',
    category: 'Utilities',
    date: '2026-10-10',
    note: 'Monthly power bill',
  },
  {
    id: 'tx-6',
    title: 'Streaming Subscriptions',
    amount: 31.98,
    type: 'expense',
    category: 'Entertainment',
    date: '2026-10-12',
    note: 'Spotify & Netflix',
  },
  {
    id: 'tx-7',
    title: 'Bistro Lunch & Coffee',
    amount: 28.5,
    type: 'expense',
    category: 'Dining',
    date: '2026-10-14',
    note: 'Team lunch',
  },
];

export const INITIAL_BUDGETS: CategoryBudget[] = [
  {
    id: 'b-1',
    category: 'Housing',
    monthlyLimit: 1500.0,
  },
  {
    id: 'b-2',
    category: 'Groceries',
    monthlyLimit: 400.0,
  },
  {
    id: 'b-3',
    category: 'Utilities',
    monthlyLimit: 120.0,
  },
  {
    id: 'b-4',
    category: 'Entertainment',
    monthlyLimit: 80.0,
  },
];

