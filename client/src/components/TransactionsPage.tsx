import React, { useState } from 'react';
import type { Transaction, TransactionType, SupportedCurrency } from '../types';
import { formatCurrency } from '../utils/formatters';

interface TransactionsPageProps {
  transactions: Transaction[];
  currency?: SupportedCurrency;
}

export const TransactionsPage: React.FC<TransactionsPageProps> = ({
  transactions,
  currency = 'USD',
}) => {
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

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

  const filteredTransactions = transactions.filter((tx) => {
    const matchesFilter = filterType === 'all' || tx.type === filterType;
    const matchesSearch =
      tx.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.note && tx.note.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="transactions-section">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">All Transactions</h2>
          <span className="section-subtitle">
            Showing {filteredTransactions.length} of {transactions.length} transactions
          </span>
        </div>

        <div className="section-controls">
          {/* Search Box */}
          <div className="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search description or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Type Filter Buttons */}
          <div className="filter-pills">
            <button
              className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All
            </button>
            <button
              className={`filter-pill ${filterType === 'income' ? 'active' : ''}`}
              onClick={() => setFilterType('income')}
            >
              Income
            </button>
            <button
              className={`filter-pill ${filterType === 'expense' ? 'active' : ''}`}
              onClick={() => setFilterType('expense')}
            >
              Expenses
            </button>
          </div>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3 className="empty-title">No transactions found</h3>
          <p className="empty-desc">
            {searchQuery
              ? `No transactions match "${searchQuery}". Try adjusting your search query or filter.`
              : 'There are no transactions recorded for the selected filter.'}
          </p>
        </div>
      ) : (
        <div className="transactions-table-card">
          <div className="transactions-list">
            {filteredTransactions.map((tx) => {
              const isIncome = tx.type === 'income';
              return (
                <div key={tx.id} className="transaction-row">
                  <div className="tx-main">
                    <div className={`tx-icon-badge ${isIncome ? 'income-badge' : 'expense-badge'}`}>
                      <span>{getCategoryIcon(tx.category)}</span>
                    </div>
                    <div className="tx-details">
                      <div className="tx-title">{tx.title}</div>
                      <div className="tx-meta">
                        <span className={`tx-type-badge ${isIncome ? 'income' : 'expense'}`}>
                          {isIncome ? 'Income' : 'Expense'}
                        </span>
                        <span className="tx-dot">•</span>
                        <span className="tx-category-tag">{tx.category}</span>
                        <span className="tx-dot">•</span>
                        <span className="tx-date">{formatDate(tx.date)}</span>
                        {tx.note && (
                          <>
                            <span className="tx-dot">•</span>
                            <span className="tx-note">{tx.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="tx-right">
                    <div className={`tx-amount ${isIncome ? 'income-amount' : 'expense-amount'}`}>
                      {isIncome ? '+' : '-'}{formatCurrency(tx.amount, currency)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
