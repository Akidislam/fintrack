import React, { useState } from 'react';
import type { CategoryBudget, Transaction, TransactionCategory, SupportedCurrency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { BudgetModal } from './BudgetModal';

interface BudgetsPageProps {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  onSaveBudget: (category: TransactionCategory, monthlyLimit: number, editId?: string) => void;
  onRemoveBudget: (id: string) => void;
  currency?: SupportedCurrency;
}

export const BudgetsPage: React.FC<BudgetsPageProps> = ({
  budgets,
  transactions,
  onSaveBudget,
  onRemoveBudget,
  currency = 'USD',
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CategoryBudget | null>(null);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Housing':
        return '🏠';
      case 'Groceries':
        return '🛒';
      case 'Dining':
        return '☕';
      case 'Utilities':
        return '⚡';
      case 'Entertainment':
        return '🎬';
      case 'Transportation':
        return '🚗';
      case 'Healthcare':
        return '🏥';
      case 'Shopping':
        return '🛍️';
      default:
        return '💳';
    }
  };

  // Determine if a transaction date belongs to the current calendar month
  const isCurrentMonth = (dateStr: string): boolean => {
    try {
      const parts = dateStr.split('-');
      if (parts.length < 2) return false;
      const txYear = parseInt(parts[0], 10);
      const txMonth = parseInt(parts[1], 10);
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      return txYear === currentYear && txMonth === currentMonth;
    } catch {
      return false;
    }
  };

  // Calculate current-month spending for a specific category (expenses only)
  const calculateCurrentMonthSpending = (category: TransactionCategory): number => {
    return transactions
      .filter(
        (tx) =>
          tx.type === 'expense' &&
          tx.category === category &&
          isCurrentMonth(tx.date)
      )
      .reduce((sum, tx) => sum + tx.amount, 0);
  };

  const handleOpenAddModal = () => {
    setEditingBudget(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (budget: CategoryBudget) => {
    setEditingBudget(budget);
    setIsModalOpen(true);
  };

  const configuredCategories = budgets.map((b) => b.category);

  return (
    <div className="transactions-section">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Monthly Budgets</h2>
          <span className="section-subtitle">
            Set spending targets and monitor current-month expense progress
          </span>
        </div>

        <button className="btn-primary" onClick={handleOpenAddModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Set Budget</span>
        </button>
      </div>

      {budgets.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <h3 className="empty-title">No budgets configured</h3>
          <p className="empty-desc">
            You haven't set any category budgets yet. Create a monthly spending budget to track and control your expenses.
          </p>
          <button className="empty-action-btn" onClick={handleOpenAddModal}>
            + Set Your First Budget
          </button>
        </div>
      ) : (
        <div className="budgets-grid">
          {budgets.map((budget) => {
            const spent = calculateCurrentMonthSpending(budget.category);
            const remaining = budget.monthlyLimit - spent;
            const percentUsed =
              budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : 0;
            const isOverBudget = spent >= budget.monthlyLimit;
            const isNearBudget = !isOverBudget && percentUsed >= 80;

            return (
              <div
                key={budget.id}
                className={`budget-card ${
                  isOverBudget ? 'over-budget' : isNearBudget ? 'near-budget' : ''
                }`}
              >
                <div className="budget-card-header">
                  <div className="budget-category-info">
                    <div
                      className={`tx-icon-badge ${
                        isOverBudget ? 'expense-badge' : 'income-badge'
                      }`}
                    >
                      <span>{getCategoryIcon(budget.category)}</span>
                    </div>
                    <div>
                      <h3 className="budget-category-title">{budget.category}</h3>
                      <span className="budget-period">Monthly Budget</span>
                    </div>
                  </div>

                  <div className="budget-actions">
                    <button
                      className="budget-action-btn"
                      onClick={() => handleOpenEditModal(budget)}
                      title={`Edit ${budget.category} budget`}
                      aria-label={`Edit ${budget.category} budget`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button
                      className="budget-action-btn delete"
                      onClick={() => onRemoveBudget(budget.id)}
                      title={`Remove ${budget.category} budget`}
                      aria-label={`Remove ${budget.category} budget`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="budget-amounts">
                  <div className="budget-spent-block">
                    <span className="budget-amount-label">Spent This Month</span>
                    <span
                      className={`budget-spent-amount ${
                        isOverBudget ? 'text-danger' : ''
                      }`}
                    >
                      {formatCurrency(spent, currency)}
                    </span>
                  </div>
                  <div className="budget-limit-block">
                    <span className="budget-amount-label">Budget Limit</span>
                    <span className="budget-limit-amount">
                      {formatCurrency(budget.monthlyLimit, currency)}
                    </span>
                  </div>
                </div>

                <div className="budget-progress-container">
                  <div className="budget-progress-bar">
                    <div
                      className={`budget-progress-fill ${
                        isOverBudget
                          ? 'danger'
                          : isNearBudget
                          ? 'warning'
                          : 'normal'
                      }`}
                      style={{ width: `${Math.min(100, percentUsed)}%` }}
                    />
                  </div>
                </div>

                <div className="budget-card-footer">
                  <span
                    className={`budget-status-pill ${
                      isOverBudget
                        ? 'danger'
                        : isNearBudget
                        ? 'warning'
                        : 'normal'
                    }`}
                  >
                    {isOverBudget
                      ? `Exceeded by ${formatCurrency(spent - budget.monthlyLimit, currency)}`
                      : isNearBudget
                      ? `${formatCurrency(remaining, currency)} left (Near limit)`
                      : `${formatCurrency(remaining, currency)} remaining`}
                  </span>
                  <span className="budget-percent-text">
                    {percentUsed.toFixed(1)}% used
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Set / Edit Budget Modal */}
      <BudgetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onSaveBudget}
        existingBudget={editingBudget}
        configuredCategories={configuredCategories}
        currency={currency}
      />
    </div>
  );
};
