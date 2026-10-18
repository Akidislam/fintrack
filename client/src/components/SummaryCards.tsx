import React from 'react';
import type { FinancialSummary, SupportedCurrency } from '../types';
import { formatCurrency } from '../utils/formatters';

interface SummaryCardsProps {
  summary: FinancialSummary;
  currency?: SupportedCurrency;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary, currency = 'USD' }) => {

  return (
    <div className="summary-grid">
      {/* 1. Total Balance Card (Hero fintech gradient card) */}
      <div className="summary-card balance-card">
        <div className="balance-card-bg-glow" />
        <div className="card-top">
          <div className="card-label-light">TOTAL NET BALANCE</div>
          <span className="balance-chip">Active Vault</span>
        </div>
        <div className="balance-amount">{formatCurrency(summary.totalBalance, currency)}</div>
        <div className="card-bottom">
          <div className="trend-badge positive">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
              <polyline points="17 6 23 6 23 12"></polyline>
            </svg>
            <span>+12.8% this month</span>
          </div>
          <span className="card-subtext-light">Updated moments ago</span>
        </div>
      </div>

      {/* 2. Total Income Card */}
      <div className="summary-card stat-card income-card">
        <div className="card-top">
          <div className="stat-label">TOTAL INCOME</div>
          <div className="stat-icon-wrapper income">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </div>
        </div>
        <div className="stat-amount income-text">{formatCurrency(summary.totalIncome, currency)}</div>
        <div className="card-bottom">
          <span className="stat-pill positive">+2 inbound sources</span>
          <span className="card-subtext">Oct 1 - Oct 31</span>
        </div>
      </div>

      {/* 3. Total Expense Card */}
      <div className="summary-card stat-card expense-card">
        <div className="card-top">
          <div className="stat-label">TOTAL EXPENSES</div>
          <div className="stat-icon-wrapper expense">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </div>
        </div>
        <div className="stat-amount expense-text">{formatCurrency(summary.totalExpenses, currency)}</div>
        <div className="card-bottom">
          <span className="stat-pill neutral">5 recorded expenses</span>
          <span className="card-subtext">Under monthly budget</span>
        </div>
      </div>

      {/* 4. Savings Rate Card */}
      <div className="summary-card stat-card savings-card">
        <div className="card-top">
          <div className="stat-label">SAVINGS RATE</div>
          <div className="stat-icon-wrapper savings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
          </div>
        </div>
        <div className="stat-amount">{summary.savingsRate.toFixed(1)}%</div>
        <div className="savings-progress-bar">
          <div
            className="savings-progress-fill"
            style={{ width: `${Math.min(Math.max(summary.savingsRate, 0), 100)}%` }}
          />
        </div>
        <div className="card-bottom">
          <span className="card-subtext">Goal target: 60%</span>
        </div>
      </div>
    </div>
  );
};
