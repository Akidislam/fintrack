import React, { useState, useEffect, useRef } from 'react';
import type { CategoryBudget, TransactionCategory, SupportedCurrency } from '../types';
import { CURRENCY_SYMBOLS } from '../utils/formatters';
import { EXPENSE_CATEGORIES } from '../utils/transactionFilters';

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: TransactionCategory, monthlyLimit: number, editId?: string) => void;
  existingBudget?: CategoryBudget | null;
  configuredCategories: TransactionCategory[];
  currency?: SupportedCurrency;
}

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

  // Unbudgeted categories that can have a new budget created.
  // If editing, always include the budget's current category.
  const availableCategories = EXPENSE_CATEGORIES.filter(
    (cat) =>
      !configuredCategories.includes(cat) ||
      (existingBudget && existingBudget.category === cat)
  );

  const allCategoriesConfigured =
    !existingBudget && availableCategories.length === 0;

  useEffect(() => {
    if (existingBudget) {
      setCategory(existingBudget.category);
      setMonthlyLimit(existingBudget.monthlyLimit.toString());
      setError('');
    } else {
      const available = EXPENSE_CATEGORIES.filter((cat) => !configuredCategories.includes(cat));
      if (available.length > 0) {
        setCategory(available[0]);
      }
      setMonthlyLimit('');
      setError('');
    }
  }, [existingBudget, configuredCategories, isOpen]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (allCategoriesConfigured) {
      setError('All expense categories already have a budget configured.');
      return;
    }

    if (!existingBudget && configuredCategories.includes(category)) {
      setError('A budget for this category already exists.');
      return;
    }

    const parsedLimit = Number.parseFloat(monthlyLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setError('Please enter a valid positive monthly budget amount.');
      return;
    }

    const cleanLimit = Math.round((parsedLimit + Number.EPSILON) * 100) / 100;
    onSave(category, cleanLimit, existingBudget?.id);
    onClose();
  };

  // If opened when all categories are already budgeted, show a clear informational dialog
  // instead of a confusing disabled form.
  if (allCategoriesConfigured) {
    return (
      <div className="modal-overlay">
        <div ref={modalRef} className="modal-container" role="dialog" aria-modal="true">
          <div className="modal-header">
            <div>
              <h2 className="modal-title">All Categories Budgeted</h2>
              <p className="modal-subtitle">
                All {EXPENSE_CATEGORIES.length} expense categories already have monthly budgets
              </p>
            </div>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
              ✕
            </button>
          </div>

          <div className="modal-all-budgeted-content">
            <div className="modal-all-budgeted-icon">🎯</div>
            <h3 className="modal-all-budgeted-heading">Every expense category has an active budget</h3>
            <p className="modal-all-budgeted-desc">
              FinTrack tracks budgets across all <strong>{EXPENSE_CATEGORIES.length} expense categories</strong>. Each category currently has a monthly limit assigned, so no new category budget can be added right now.
            </p>

            <div className="modal-category-chips">
              {EXPENSE_CATEGORIES.map((cat) => (
                <span key={cat} className="modal-category-chip">
                  ✓ {cat}
                </span>
              ))}
            </div>

            <p className="modal-all-budgeted-hint">
              💡 <strong>Want to change a spending limit?</strong> Close this window and click the edit icon (✏️) on any budget card to update its monthly limit, or delete a budget to free up that category.
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              Got It
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div ref={modalRef} className="modal-container" role="dialog" aria-modal="true">
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
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <span className="form-hint">
              {existingBudget
                ? 'Category cannot be changed while editing. Delete this budget to set one for a different category.'
                : `${availableCategories.length} expense ${
                    availableCategories.length === 1 ? 'category' : 'categories'
                  } currently available to budget.`}
            </span>
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
