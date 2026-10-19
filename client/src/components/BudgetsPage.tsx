import React, { useState } from 'react';
import type { CategoryBudget, Transaction, TransactionCategory, SupportedCurrency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { getCurrentYearMonth, isInYearMonth } from '../utils/dateUtils';
import { EXPENSE_CATEGORIES } from '../utils/transactionFilters';
import { BudgetModal } from './BudgetModal';

interface BudgetsPageProps {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  onSaveBudget: (category: TransactionCategory, monthlyLimit: number, editId?: string) => void;
  onRemoveBudget: (id: string) => void;
  currency?: SupportedCurrency;
}

const getCategoryIcon = (category: string): string => {
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
    case 'Other':
      return '🏷️';
    default:
      return '💳';
  }
};

export const BudgetsPage: React.FC<BudgetsPageProps> = ({
  budgets,
  transactions,
  onSaveBudget,
  onRemoveBudget,
  currency = 'USD',
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CategoryBudget | null>(null);

  // Compute current year/month once outside filter to avoid calling
  // new Date() inside render (React purity lint rule).
  const currentYearMonth = getCurrentYearMonth();

  // Human-readable label for the tracked month, e.g. "October 2026"
  const currentMonthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(currentYearMonth[0], currentYearMonth[1] - 1, 1));

  // Calculate current-month spending and transaction count for a specific
  // category — only counts expense transactions in the current month.
  const getMonthlySpending = (
    category: TransactionCategory
  ): { amount: number; txCount: number } => {
    const matching = transactions.filter(
      (tx) =>
        tx.type === 'expense' &&
        tx.category === category &&
        isInYearMonth(tx.date, currentYearMonth)
    );
    const rawAmount = matching.reduce((sum, tx) => sum + tx.amount, 0);
    const amount = Math.round((rawAmount + Number.EPSILON) * 100) / 100;
    return { amount, txCount: matching.length };
  };

  const configuredCategories = budgets.map((b) => b.category);
  const allCategoriesBudgeted = EXPENSE_CATEGORIES.every((cat) =>
    configuredCategories.includes(cat)
  );

  const handleOpenAddModal = () => {
    if (allCategoriesBudgeted) return;
    setEditingBudget(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (budget: CategoryBudget) => {
    setEditingBudget(budget);
    setIsModalOpen(true);
  };

  return (
    <div className="transactions-section">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Monthly Budgets</h2>
          <span className="section-subtitle">
            {currentMonthLabel} • {configuredCategories.length} of {EXPENSE_CATEGORIES.length} expense categories budgeted
          </span>
        </div>

        <button
          className="btn-primary"
          onClick={handleOpenAddModal}
          disabled={allCategoriesBudgeted}
          aria-disabled={allCategoriesBudgeted}
          title={
            allCategoriesBudgeted
              ? `All ${EXPENSE_CATEGORIES.length} expense categories already have budgets configured`
              : 'Set a monthly budget for an expense category'
          }
        >
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
        <>
          <div className="budgets-grid">
            {budgets.map((budget) => {
              const { amount: spent, txCount } = getMonthlySpending(budget.category);
              const remaining = Math.max(0, Math.round((budget.monthlyLimit - spent + Number.EPSILON) * 100) / 100);
              const percentUsed =
                budget.monthlyLimit > 0 ? (spent / budget.monthlyLimit) * 100 : 0;
              const isOverBudget = budget.monthlyLimit > 0 && spent >= budget.monthlyLimit;
              const isNearBudget = !isOverBudget && percentUsed >= 80;
              const overage = Math.round((spent - budget.monthlyLimit + Number.EPSILON) * 100) / 100;

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
                        <span className="budget-period">{currentMonthLabel}</span>
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
                      <span className="budget-amount-label">
                        Spent This Month
                        {txCount > 0 && (
                          <span className="budget-tx-count">
                            {' '}· {txCount} {txCount === 1 ? 'expense' : 'expenses'}
                          </span>
                        )}
                      </span>
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
                        ? `⚠️ Exceeded by ${formatCurrency(overage, currency)}`
                        : isNearBudget
                        ? `${formatCurrency(remaining, currency)} left — near limit`
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

          {allCategoriesBudgeted ? (
            <div className="budget-all-set-banner">
              <span className="banner-icon">🎯</span>
              <div className="banner-content">
                <strong>All {EXPENSE_CATEGORIES.length} expense categories are budgeted</strong>
                <p>
                  Every expense category has an active monthly limit. Click the edit icon (✏️) on any budget card to adjust its limit, or delete a budget if you want to remove it.
                </p>
              </div>
            </div>
          ) : (
            <div className="budget-unbudgeted-note">
              <span>
                💡 {EXPENSE_CATEGORIES.length - configuredCategories.length} categories remaining without budgets:{' '}
                {EXPENSE_CATEGORIES.filter((c) => !configuredCategories.includes(c)).join(', ')}
              </span>
            </div>
          )}
        </>
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
