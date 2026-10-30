import React from 'react';
import type { FinancialSummary, SupportedCurrency } from '../types';
import { formatCurrency } from '../utils/formatters';

interface SummaryCardsProps {
  summary: FinancialSummary;
  currency?: SupportedCurrency;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary, currency = 'USD' }) => {
  return (
    <section className="summary-grid dashboard-summary-grid" aria-label="Financial summary">
      <article className="summary-card dashboard-summary-card dashboard-balance-card">
        <div className="dashboard-summary-card-heading">
          <div>
            <h2 className="dashboard-summary-label">Total net balance</h2>
            <p className="dashboard-summary-period">Current balance</p>
          </div>
          <span className="dashboard-summary-icon balance" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 10h18M7 15h3" />
            </svg>
          </span>
        </div>
        <p className="dashboard-summary-value">{formatCurrency(summary.totalBalance, currency)}</p>
        <p className="dashboard-summary-footnote">Across your accounts and recorded activity</p>
      </article>

      <article className="summary-card dashboard-summary-card">
        <div className="dashboard-summary-card-heading">
          <div>
            <h2 className="dashboard-summary-label">Income</h2>
            <p className="dashboard-summary-period">All time</p>
          </div>
          <span className="dashboard-summary-icon income" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5m-7 7 7-7 7 7" />
            </svg>
          </span>
        </div>
        <p className="dashboard-summary-value income">{formatCurrency(summary.totalIncome, currency)}</p>
        <p className="dashboard-summary-footnote">Total recorded income</p>
      </article>

      <article className="summary-card dashboard-summary-card">
        <div className="dashboard-summary-card-heading">
          <div>
            <h2 className="dashboard-summary-label">Expenses</h2>
            <p className="dashboard-summary-period">All time</p>
          </div>
          <span className="dashboard-summary-icon expense" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14m7-7-7 7-7-7" />
            </svg>
          </span>
        </div>
        <p className="dashboard-summary-value expense">{formatCurrency(summary.totalExpenses, currency)}</p>
        <p className="dashboard-summary-footnote">Total recorded expenses</p>
      </article>

      <article className="summary-card dashboard-summary-card">
        <div className="dashboard-summary-card-heading">
          <div>
            <h2 className="dashboard-summary-label">Savings rate</h2>
            <p className="dashboard-summary-period">All time</p>
          </div>
          <span className="dashboard-summary-icon savings" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20m7-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H5" />
            </svg>
          </span>
        </div>
        <p className="dashboard-summary-value savings">{summary.savingsRate.toFixed(1)}%</p>
        <p className="dashboard-summary-footnote">Based on recorded income and expenses</p>
      </article>
    </section>
  );
};
