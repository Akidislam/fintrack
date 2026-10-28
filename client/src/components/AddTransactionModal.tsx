import React, { useState, useEffect, useRef } from 'react';
import type {
  Transaction,
  TransactionType,
  TransactionCategory,
  SupportedCurrency,
  Account,
  Category,
} from '../types';
import { CURRENCY_SYMBOLS } from '../utils/formatters';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTransaction: (data: Omit<Transaction, 'id'>, editId?: string) => Promise<void> | void;
  existingTransaction?: Transaction | null;
  accounts: Account[];
  currency?: SupportedCurrency;
  categories?: Category[];
}

const EXPENSE_CATEGORIES: TransactionCategory[] = [
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

const INCOME_CATEGORIES: TransactionCategory[] = [
  'Salary',
  'Freelance',
  'Investments',
  'Other',
];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSaveTransaction,
  existingTransaction,
  accounts,
  currency = 'USD',
  categories,
}) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<TransactionCategory>('Groceries');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form fields on open or when existingTransaction changes
  useEffect(() => {
    if (existingTransaction) {
      setTitle(existingTransaction.title);
      setAmount(existingTransaction.amount.toString());
      setType(existingTransaction.type);
      setCategory(existingTransaction.category);
      setDate(existingTransaction.date);
      setNote(existingTransaction.note ?? '');
      setAccountId(existingTransaction.accountId ?? '');
      setToAccountId(existingTransaction.toAccountId ?? '');
    } else {
      setTitle('');
      setAmount('');
      setType('expense');
      setCategory('Groceries');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      // Default to the first account if available
      setAccountId(accounts.length > 0 ? accounts[0].id : '');
      setToAccountId(accounts.length > 1 ? accounts[1].id : '');
    }
    setError('');
  }, [existingTransaction, isOpen, accounts]);

  const availableCategories = React.useMemo(() => {
    if (categories && categories.length > 0) {
      const matched = categories.filter((c) => c.type === type);
      if (matched.length > 0) {
        return matched.map((c) => c.name);
      }
    }
    return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  }, [categories, type]);

  const modalRef = useRef<HTMLDivElement>(null);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (isOpen && modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedAmount = Number.parseFloat(amount);
    if (!title.trim()) {
      setError('Please provide a description or merchant name.');
      return;
    }
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    if (type === 'transfer') {
      if (!accountId) {
        setError('Please select a source account (From Account).');
        return;
      }
      if (!toAccountId) {
        setError('Please select a destination account (To Account).');
        return;
      }
      if (accountId === toAccountId) {
        setError('Source and destination accounts must be different.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await onSaveTransaction(
        {
          title: title.trim(),
          amount: parsedAmount,
          type,
          category: type === 'transfer' ? 'Transfer' : category,
          date,
          note: note.trim() || undefined,
          accountId: accountId || undefined,
          toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
        },
        existingTransaction?.id
      );

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCurrentAccountDeleted =
    Boolean(accountId) && !accounts.some((a) => a.id === accountId);
  const isToAccountDeleted =
    Boolean(toAccountId) && !accounts.some((a) => a.id === toAccountId);

  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 id="modal-title" className="modal-title">
              {existingTransaction ? 'Edit Transaction' : 'Add New Transaction'}
            </h3>
            <p className="modal-subtitle">
              {existingTransaction
                ? `Update details for "${existingTransaction.title}"`
                : 'Log a new income, expense, or transfer to your records.'}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && <div className="modal-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Type Toggle: Expense vs Income vs Transfer */}
          <div className="form-group">
            <span id="tx-type-label" className="form-label">Transaction Type</span>
            <div className="type-toggle-group" role="group" aria-labelledby="tx-type-label">
              <button
                type="button"
                className={`type-toggle-btn expense ${type === 'expense' ? 'selected' : ''}`}
                onClick={() => {
                  setType('expense');
                  const expenseCats = categories && categories.length > 0
                    ? categories.filter((c) => c.type === 'expense').map((c) => c.name)
                    : EXPENSE_CATEGORIES;
                  if (!expenseCats.includes(category)) {
                    setCategory(expenseCats[0] || 'Groceries');
                  }
                }}
              >
                🔴 Expense
              </button>
              <button
                type="button"
                className={`type-toggle-btn income ${type === 'income' ? 'selected' : ''}`}
                onClick={() => {
                  setType('income');
                  const incomeCats = categories && categories.length > 0
                    ? categories.filter((c) => c.type === 'income').map((c) => c.name)
                    : INCOME_CATEGORIES;
                  if (!incomeCats.includes(category)) {
                    setCategory(incomeCats[0] || 'Salary');
                  }
                }}
              >
                🟢 Income
              </button>
              <button
                type="button"
                className={`type-toggle-btn transfer ${type === 'transfer' ? 'selected' : ''}`}
                onClick={() => {
                  setType('transfer');
                  setCategory('Transfer');
                  if (!accountId && accounts.length > 0) {
                    setAccountId(accounts[0].id);
                  }
                  if (!toAccountId && accounts.length > 1) {
                    setToAccountId(accounts[1].id);
                  }
                }}
                disabled={accounts.length < 2 && !existingTransaction}
                title={
                  accounts.length < 2 && !existingTransaction
                    ? 'At least 2 accounts are required to record transfers'
                    : 'Transfer funds between accounts'
                }
              >
                🔄 Transfer
              </button>
            </div>
            {accounts.length < 2 && (
              <span className="form-hint">
                💡 Tip: Add 2 or more accounts on the Accounts page to record transfers between them.
              </span>
            )}
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="tx-title" className="form-label">
              Description / Payee *
            </label>
            <input
              id="tx-title"
              type="text"
              placeholder={
                type === 'transfer'
                  ? 'e.g. Transfer to Savings, Pay Credit Card'
                  : 'e.g. Grocery Store, Client Payment'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-input"
              autoFocus
              required
            />
          </div>

          {/* Amount & Account / Category */}
          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="tx-amount" className="form-label">
                Amount ({CURRENCY_SYMBOLS[currency]}) *
              </label>
              <div className="input-prefix-wrapper">
                <span className="input-prefix">{CURRENCY_SYMBOLS[currency]}</span>
                <input
                  id="tx-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="form-input with-prefix"
                  required
                />
              </div>
            </div>

            {type !== 'transfer' && (
              <div className="form-group flex-1">
                <label htmlFor="tx-category" className="form-label">
                  Category
                </label>
                <select
                  id="tx-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                  className="form-select"
                >
                  {category && !availableCategories.includes(category) && (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  )}
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Account Selectors */}
          {type === 'transfer' ? (
            <div className="form-row">
              <div className="form-group flex-1">
                <label htmlFor="tx-from-account" className="form-label">
                  From Account (Source) *
                </label>
                <select
                  id="tx-from-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="form-select"
                  required
                >
                  <option value="">Select source account...</option>
                  {isCurrentAccountDeleted && (
                    <option value={accountId} disabled>
                      ⚠️ Deleted Account
                    </option>
                  )}
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group flex-1">
                <label htmlFor="tx-to-account" className="form-label">
                  To Account (Destination) *
                </label>
                <select
                  id="tx-to-account"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="form-select"
                  required
                >
                  <option value="">Select destination account...</option>
                  {isToAccountDeleted && (
                    <option value={toAccountId} disabled>
                      ⚠️ Deleted Account
                    </option>
                  )}
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} disabled={acc.id === accountId}>
                      {acc.name} ({acc.type})
                      {acc.id === accountId ? ' (Source)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="tx-account" className="form-label">
                {type === 'expense' ? 'Paid From Account' : 'Deposit To Account'}
              </label>
              <select
                id="tx-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="form-select"
              >
                <option value="">-- No Account (Unassigned) --</option>
                {isCurrentAccountDeleted && (
                  <option value={accountId} disabled>
                    ⚠️ Deleted Account
                  </option>
                )}
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date & Note */}
          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="tx-date" className="form-label">
                Date
              </label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-input"
                required
              />
            </div>

            <div className="form-group flex-1">
              <label htmlFor="tx-note" className="form-label">
                Optional Note
              </label>
              <input
                id="tx-note"
                type="text"
                placeholder="e.g. Dinner with Sarah, Invoice #102"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : existingTransaction ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
