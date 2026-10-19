import React from 'react';
import type { Transaction, SupportedCurrency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { getCurrentYearMonth, isInYearMonth } from '../utils/dateUtils';

interface AnalyticsPageProps {
  transactions: Transaction[];
  currency?: SupportedCurrency;
}

interface MonthlyData {
  key: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  transactions,
  currency = 'USD',
}) => {

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Salary':
        return '💰';
      case 'Freelance':
        return '💻';
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
      case 'Investments':
        return '📈';
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

  // Determine if a transaction belongs to the current calendar month.
  // getCurrentYearMonth() is called once here (outside any map/filter) to
  // satisfy the React purity lint rule (avoids new Date() in render).
  const currentYearMonth = getCurrentYearMonth();
  const isCurrentMonth = (dateStr: string) => isInYearMonth(dateStr, currentYearMonth);

  // 1. Current Month KPIs
  const currentMonthTransactions = transactions.filter((tx) => isCurrentMonth(tx.date));

  const currentMonthIncome = currentMonthTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const currentMonthExpenses = currentMonthTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const netCashFlow = currentMonthIncome - currentMonthExpenses;
  const isPositiveNet = netCashFlow >= 0;

  const currentMonthIncomeCount = currentMonthTransactions.filter((tx) => tx.type === 'income').length;
  const currentMonthExpenseCount = currentMonthTransactions.filter((tx) => tx.type === 'expense').length;

  const currentMonthSavingsRate =
    currentMonthIncome > 0
      ? Math.max(0, (netCashFlow / currentMonthIncome) * 100)
      : 0;

  // 2. Current Month Category Breakdown (expenses only)
  const categoryExpensesMap: Record<string, number> = {};
  currentMonthTransactions
    .filter((tx) => tx.type === 'expense')
    .forEach((tx) => {
      categoryExpensesMap[tx.category] = (categoryExpensesMap[tx.category] || 0) + tx.amount;
    });

  const categoryBreakdown = Object.entries(categoryExpensesMap)
    .sort(([, a], [, b]) => b - a)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: currentMonthExpenses > 0 ? (amount / currentMonthExpenses) * 100 : 0,
    }));

  // 3. Monthly Income vs Expenses Comparison (strictly from existing transaction dates)
  const monthlyMap: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach((tx) => {
    const parts = tx.date.split('-');
    if (parts.length >= 2) {
      const key = `${parts[0]}-${parts[1]}`;
      if (!monthlyMap[key]) {
        monthlyMap[key] = { income: 0, expenses: 0 };
      }
      if (tx.type === 'income') {
        monthlyMap[key].income += tx.amount;
      } else if (tx.type === 'expense') {
        monthlyMap[key].expenses += tx.amount;
      }
    }
  });

  const monthlyHistory: MonthlyData[] = Object.keys(monthlyMap)
    .sort()
    .map((key) => {
      const [year, month] = key.split('-');
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
      }).format(dateObj);
      const income = monthlyMap[key].income;
      const expenses = monthlyMap[key].expenses;
      return {
        key,
        label,
        income,
        expenses,
        net: income - expenses,
      };
    });

  return (
    <div className="transactions-section">
      {/* Header */}
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Financial Analytics</h2>
          <span className="section-subtitle">
            Current-month cash flow analysis and historical comparison
          </span>
        </div>
      </div>

      {/* 3 Overview KPI Cards */}
      <div className="analytics-kpi-grid">
        {/* Current Month Income */}
        <div className="summary-card stat-card income-card">
          <div className="card-top">
            <div className="stat-label">CURRENT MONTH INFLOW</div>
            <div className="stat-icon-wrapper income">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            </div>
          </div>
          <div className="stat-amount income-text">{formatCurrency(currentMonthIncome, currency)}</div>
          <div className="card-bottom">
            <span className="stat-pill positive">
              {currentMonthIncomeCount} {currentMonthIncomeCount === 1 ? 'deposit' : 'deposits'}
            </span>
            <span className="card-subtext">This month</span>
          </div>
        </div>

        {/* Current Month Expenses */}
        <div className="summary-card stat-card expense-card">
          <div className="card-top">
            <div className="stat-label">CURRENT MONTH OUTFLOW</div>
            <div className="stat-icon-wrapper expense">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            </div>
          </div>
          <div className="stat-amount expense-text">{formatCurrency(currentMonthExpenses, currency)}</div>
          <div className="card-bottom">
            <span className="stat-pill neutral">
              {currentMonthExpenseCount} {currentMonthExpenseCount === 1 ? 'expense' : 'expenses'}
            </span>
            <span className="card-subtext">This month</span>
          </div>
        </div>

        {/* Current Month Net Flow */}
        <div className="summary-card stat-card">
          <div className="card-top">
            <div className="stat-label">NET CASH FLOW</div>
            <div className={`stat-icon-wrapper ${isPositiveNet ? 'income' : 'expense'}`}>
              {isPositiveNet ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                  <polyline points="17 6 23 6 23 12"></polyline>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>
                  <polyline points="17 18 23 18 23 12"></polyline>
                </svg>
              )}
            </div>
          </div>
          <div className={`stat-amount ${isPositiveNet ? 'income-text' : 'expense-text'}`}>
            {isPositiveNet ? '+' : ''}{formatCurrency(netCashFlow, currency)}
          </div>
          <div className="card-bottom">
            <span className={`stat-pill ${isPositiveNet ? 'positive' : 'neutral'}`}>
              {currentMonthSavingsRate.toFixed(1)}% savings rate
            </span>
            <span className="card-subtext">Income minus expenses</span>
          </div>
        </div>
      </div>

      {/* Analytics Main Sections Grid */}
      <div className="analytics-sections-grid">
        {/* Category-Wise Expense Breakdown */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <div>
              <h3 className="analytics-card-title">Category Spending Breakdown</h3>
              <p className="analytics-card-subtitle">
                Current-month expense distribution across categories
              </p>
            </div>
            <span className="analytics-badge">
              {categoryBreakdown.length} {categoryBreakdown.length === 1 ? 'category' : 'categories'}
            </span>
          </div>

          {categoryBreakdown.length === 0 ? (
            <div className="analytics-empty">
              <span className="empty-icon">📊</span>
              <p className="empty-title">No expenses this month</p>
              <p className="empty-desc">
                There are no expense transactions recorded for the current calendar month.
              </p>
            </div>
          ) : (
            <div className="category-breakdown-list">
              {categoryBreakdown.map((item) => (
                <div key={item.category} className="category-breakdown-row">
                  <div className="category-row-header">
                    <div className="category-name-wrap">
                      <span className="category-emoji-badge">
                        {getCategoryIcon(item.category)}
                      </span>
                      <span className="category-row-name">{item.category}</span>
                    </div>
                    <div className="category-amount-wrap">
                      <span className="category-row-amount">{formatCurrency(item.amount, currency)}</span>
                      <span className="category-row-pct">{item.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="category-bar-track">
                    <div
                      className="category-bar-fill"
                      style={{ width: `${Math.max(item.percentage, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly Income vs Expenses Comparison */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <div>
              <h3 className="analytics-card-title">Monthly Comparison</h3>
              <p className="analytics-card-subtitle">
                Inflow vs. outflow comparison based on recorded transactions
              </p>
            </div>
            <span className="analytics-badge">
              {monthlyHistory.length} {monthlyHistory.length === 1 ? 'month' : 'months'}
            </span>
          </div>

          {monthlyHistory.length === 0 ? (
            <div className="analytics-empty">
              <span className="empty-icon">📅</span>
              <p className="empty-title">No transaction history</p>
              <p className="empty-desc">
                No transactions found to generate monthly comparison data.
              </p>
            </div>
          ) : (
            <div className="monthly-comparison-list">
              {monthlyHistory.map((month) => {
                const maxVal = Math.max(month.income, month.expenses, 1);
                const incomePct = (month.income / maxVal) * 100;
                const expensePct = (month.expenses / maxVal) * 100;
                const monthPositive = month.net >= 0;

                return (
                  <div key={month.key} className="month-comparison-card">
                    <div className="month-card-header">
                      <span className="month-label">{month.label}</span>
                      <span className={`month-net-badge ${monthPositive ? 'positive' : 'negative'}`}>
                        Net: {monthPositive ? '+' : ''}{formatCurrency(month.net, currency)}
                      </span>
                    </div>

                    <div className="month-bars-container">
                      {/* Income Bar */}
                      <div className="comparison-bar-row">
                        <div className="comparison-bar-label-wrap">
                          <span className="comparison-dot income-dot" />
                          <span className="comparison-type-label">Income</span>
                        </div>
                        <div className="comparison-bar-track">
                          <div
                            className="comparison-bar-fill income-fill"
                            style={{ width: `${Math.max(incomePct, 2)}%` }}
                          />
                        </div>
                        <span className="comparison-bar-val income-val">
                          {formatCurrency(month.income, currency)}
                        </span>
                      </div>

                      {/* Expenses Bar */}
                      <div className="comparison-bar-row">
                        <div className="comparison-bar-label-wrap">
                          <span className="comparison-dot expense-dot" />
                          <span className="comparison-type-label">Expenses</span>
                        </div>
                        <div className="comparison-bar-track">
                          <div
                            className="comparison-bar-fill expense-fill"
                            style={{ width: `${Math.max(expensePct, 2)}%` }}
                          />
                        </div>
                        <span className="comparison-bar-val expense-val">
                          {formatCurrency(month.expenses, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
