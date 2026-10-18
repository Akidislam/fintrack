import React, { useState, useEffect } from 'react';
import type { CategoryBudget, TransactionCategory, SupportedCurrency } from '../types';
import { CURRENCY_SYMBOLS } from '../utils/formatters';

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: TransactionCategory, monthlyLimit: number, editId?: string) => void;
  existingBudget?: CategoryBudget | null;
  configuredCategories: TransactionCategory[];
  currency?: SupportedCurrency;
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

export const BudgetModal: React.FC<BudgetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingBudget,
  configuredCategories,
  currency = 'USD',
}) => {
  const [category, setCategory] = useState<TransactionCategory>('Groceries');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (existingBudget) {
      setCategory(existingBudget.category);
      setMonthlyLimit(existingBudget.monthlyLimit.toString());
      setError('');
    } else {
      // Pick first unconfigured category if available
      const available = EXPENSE_CATEGORIES.find((cat) => !configuredCategories.includes(cat));
      setCategory(available || 'Groceries');
      setMonthlyLimit('');
      setError('');
    }
  }, [existingBudget, configuredCategories, isOpen]);

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

    const parsedLimit = parseFloat(monthlyLimit);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      setError('Please enter a valid positive monthly budget amount.');
      return;
    }

    onSave(category, parsedLimit, existingBudget?.id);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {existingBudget ? 'Edit Budget' : 'Set Monthly Budget'}
            </h2>
            <p className="modal-subtitle">
              {existingBudget
                ? `Update monthly limit for ${existingBudget.category}`
                : 'Set a monthly spending limit for an expense category'}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && <div className="modal-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label" htmlFor="budget-category">
              Expense Category
            </label>
            <select
              id="budget-category"
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as TransactionCategory)}
              disabled={!!existingBudget}
            >
              {EXPENSE_CATEGORIES.map((cat) => {
                const isAlreadyConfigured =
                  !existingBudget && configuredCategories.includes(cat);
                return (
                  <option key={cat} value={cat} disabled={isAlreadyConfigured}>
                    {cat} {isAlreadyConfigured ? '(Already budgeted)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="budget-limit">
              Monthly Limit Amount ({CURRENCY_SYMBOLS[currency]})
            </label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">{CURRENCY_SYMBOLS[currency]}</span>
              <input
                id="budget-limit"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                className="form-input"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {existingBudget ? 'Save Changes' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
