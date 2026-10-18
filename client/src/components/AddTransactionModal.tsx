import React, { useState, useEffect } from 'react';
import type { Transaction, TransactionType, TransactionCategory, SupportedCurrency } from '../types';
import { CURRENCY_SYMBOLS } from '../utils/formatters';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransaction: (newTx: Omit<Transaction, 'id'>) => void;
  currency?: SupportedCurrency;
}

const CATEGORIES: TransactionCategory[] = [
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
  'Other',
];

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onAddTransaction,
  currency = 'USD',
}) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<TransactionCategory>('Groceries');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (!title.trim()) {
      setError('Please provide a description or merchant name.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    onAddTransaction({
      title: title.trim(),
      amount: parsedAmount,
      type,
      category,
      date,
      note: note.trim() || undefined,
    });

    // Reset form
    setTitle('');
    setAmount('');
    setType('expense');
    setCategory('Groceries');
    setDate(new Date().toISOString().split('T')[0]);
    setNote('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <h3 id="modal-title" className="modal-title">
              Add New Transaction
            </h3>
            <p className="modal-subtitle">Log a new income or expense to your records.</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && <div className="modal-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Type Toggle: Expense vs Income */}
          <div className="form-group">
            <label className="form-label">Transaction Type</label>
            <div className="type-toggle-group">
              <button
                type="button"
                className={`type-toggle-btn expense ${type === 'expense' ? 'selected' : ''}`}
                onClick={() => {
                  setType('expense');
                  if (category === 'Salary' || category === 'Freelance') {
                    setCategory('Groceries');
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
                  setCategory('Salary');
                }}
              >
                🟢 Income
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="form-group">
            <label htmlFor="tx-title" className="form-label">
              Description / Payee *
            </label>
            <input
              id="tx-title"
              type="text"
              placeholder="e.g. Grocery Store, Client Payment"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-input"
              autoFocus
              required
            />
          </div>

          {/* Amount & Category */}
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
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
                placeholder="e.g. Dinner with Sarah"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Add Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
