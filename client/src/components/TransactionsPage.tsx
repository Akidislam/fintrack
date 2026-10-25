import React, { useState } from 'react';
import type { Transaction, TransactionType, SupportedCurrency, Account, AccountType, TransactionCategory } from '../types';
import { formatCurrency } from '../utils/formatters';
import {
  filterTransactions,
  hasActiveTransactionFilters,
  getCategoriesForType,
  type TransactionFilterOptions,
} from '../utils/transactionFilters';
import {
  transactionsToCSV,
  generateTransactionsFilename,
  downloadCSV,
} from '../utils/csvExport';

interface TransactionsPageProps {
  transactions: Transaction[];
  accounts: Account[];
  onEditTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  currency?: SupportedCurrency;
}

const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  'Cash': '💵',
  'Bank Account': '🏦',
  'Mobile Wallet': '📱',
  'Credit Card': '💳',
};

export const TransactionsPage: React.FC<TransactionsPageProps> = ({
  transactions,
  accounts,
  onEditTransaction,
  onDeleteTransaction,
  currency = 'USD',
}) => {
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | TransactionCategory>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
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
      case 'Transfer':
        return '🔄';
      case 'Other':
        return '🏷️';
      default:
        return '💳';
    }
  };

  // Adjust category if not applicable to new type
  const handleTypeChange = (newType: 'all' | TransactionType) => {
    setFilterType(newType);
    if (filterCategory !== 'all') {
      const validCats = getCategoriesForType(newType);
      if (!validCats.includes(filterCategory)) {
        setFilterCategory('all');
      }
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterAccount('all');
    setFilterCategory('all');
    setStartDate('');
    setEndDate('');
  };

  const filterOptions: TransactionFilterOptions = {
    searchQuery,
    type: filterType,
    accountId: filterAccount,
    category: filterCategory,
    startDate,
    endDate,
  };

  const hasActiveFilters = hasActiveTransactionFilters(filterOptions);
  const filteredTransactions = filterTransactions(transactions, accounts, filterOptions);
  const availableCategories = getCategoriesForType(filterType);

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;
    const csvContent = transactionsToCSV(filteredTransactions, accounts);
    const filename = generateTransactionsFilename();
    downloadCSV(csvContent, filename);
  };

  return (
    <div className="transactions-section">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">All Transactions</h2>
          <span className="section-subtitle">
            Showing {filteredTransactions.length} of {transactions.length} transactions
            {hasActiveFilters && ' • Filters active'}
          </span>
        </div>

        <div className="section-controls">
          {/* 1. Search Box */}
          <div className="search-box">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search title, note, amount..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              aria-label="Search transactions"
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search query"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* 2. Type Filter Buttons */}
          <div className="filter-pills" role="group" aria-label="Filter by transaction type">
            <button
              className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => handleTypeChange('all')}
            >
              All
            </button>
            <button
              className={`filter-pill ${filterType === 'income' ? 'active' : ''}`}
              onClick={() => handleTypeChange('income')}
            >
              Income
            </button>
            <button
              className={`filter-pill ${filterType === 'expense' ? 'active' : ''}`}
              onClick={() => handleTypeChange('expense')}
            >
              Expenses
            </button>
            <button
              className={`filter-pill ${filterType === 'transfer' ? 'active' : ''}`}
              onClick={() => handleTypeChange('transfer')}
            >
              Transfers
            </button>
          </div>

          {/* 3. Account Filter Dropdown */}
          {accounts.length > 0 && (
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="filter-select"
              aria-label="Filter by account"
            >
              <option value="all">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
          )}

          {/* 4. Category Filter Dropdown */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as 'all' | TransactionCategory)}
            className="filter-select"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* 5. Date Range Filter */}
          <div className="date-filter-group" title="Filter by date range (From → To)">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="date-filter-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="date-filter-input"
              aria-label="From date"
              title="From date"
            />
            <span className="date-filter-separator">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="date-filter-input"
              aria-label="To date"
              title="To date"
            />
            {(startDate || endDate) && (
              <button
                className="search-clear"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                title="Clear date range"
                aria-label="Clear date range"
              >
                ✕
              </button>
            )}
          </div>

          {/* 6. Clear All Filters Button */}
          {hasActiveFilters && (
            <button
              className="btn-clear-filters"
              onClick={handleResetFilters}
              title="Reset all search and filter criteria"
              aria-label="Clear all filters"
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span>Clear Filters</span>
            </button>
          )}

          {/* 7. Export CSV Button */}
          <button
            type="button"
            className="btn-export-csv"
            onClick={handleExportCSV}
            disabled={filteredTransactions.length === 0}
            title={
              filteredTransactions.length === 0
                ? 'No transactions available to export'
                : `Export ${filteredTransactions.length} transaction${filteredTransactions.length === 1 ? '' : 's'} as CSV`
            }
            aria-label="Export transactions to CSV"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3 className="empty-title">No transactions found</h3>
          <p className="empty-desc">
            {hasActiveFilters
              ? 'No transactions match the selected filters or search criteria. Try adjusting or clearing your filters.'
              : 'There are no transactions recorded yet.'}
          </p>
          {hasActiveFilters && (
            <button className="empty-action-btn" onClick={handleResetFilters}>
              Reset All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="transactions-table-card">
          <div className="transactions-list">
            {filteredTransactions.map((tx) => {
              const isIncome = tx.type === 'income';
              const isTransfer = tx.type === 'transfer';

              const fromAccount = accounts.find((a) => a.id === tx.accountId);
              const toAccount = accounts.find((a) => a.id === tx.toAccountId);

              return (
                <div key={tx.id} className="transaction-row">
                  <div className="tx-main">
                    <div
                      className={`tx-icon-badge ${
                        isTransfer
                          ? 'transfer-badge'
                          : isIncome
                          ? 'income-badge'
                          : 'expense-badge'
                      }`}
                    >
                      <span>{getCategoryIcon(tx.category)}</span>
                    </div>
                    <div className="tx-details">
                      <div className="tx-title">{tx.title}</div>
                      <div className="tx-meta">
                        <span
                          className={`tx-type-badge ${
                            isTransfer ? 'transfer' : isIncome ? 'income' : 'expense'
                          }`}
                        >
                          {isTransfer ? 'Transfer' : isIncome ? 'Income' : 'Expense'}
                        </span>
                        <span className="tx-dot">•</span>
                        <span className="tx-category-tag">{tx.category}</span>

                        {/* Associated account name display */}
                        {isTransfer ? (
                          <>
                            <span className="tx-dot">•</span>
                            <span className="tx-account-badge transfer">
                              <span className="tx-account-icon">🔄</span>
                              {fromAccount ? fromAccount.name : tx.accountId ? 'Deleted Account' : 'Unassigned'}
                              {' → '}
                              {toAccount ? toAccount.name : tx.toAccountId ? 'Deleted Account' : 'Unassigned'}
                            </span>
                          </>
                        ) : tx.accountId ? (
                          <>
                            <span className="tx-dot">•</span>
                            {fromAccount ? (
                              <span
                                className="tx-account-badge"
                                title={`Account: ${fromAccount.name} (${fromAccount.type})`}
                              >
                                <span className="tx-account-icon">
                                  {ACCOUNT_TYPE_ICONS[fromAccount.type] || '🏦'}
                                </span>
                                {fromAccount.name}
                              </span>
                            ) : (
                              <span
                                className="tx-account-badge deleted"
                                title="Associated account has been deleted"
                              >
                                <span className="tx-account-icon">⚠️</span>{' '}Deleted Account
                              </span>
                            )}
                          </>
                        ) : null}

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
                    <div
                      className={`tx-amount ${
                        isTransfer
                          ? 'transfer-amount'
                          : isIncome
                          ? 'income-amount'
                          : 'expense-amount'
                      }`}
                    >
                      {isTransfer ? '' : isIncome ? '+' : '-'}
                      {formatCurrency(tx.amount, currency)}
                    </div>

                    {onEditTransaction && (
                      <button
                        className="budget-action-btn"
                        onClick={() => onEditTransaction(tx)}
                        title={`Edit transaction "${tx.title}"`}
                        aria-label={`Edit ${tx.title}`}
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                    )}

                    {onDeleteTransaction && (
                      <button
                        className="budget-action-btn delete"
                        onClick={() => onDeleteTransaction(tx.id)}
                        title="Delete transaction"
                        aria-label={`Delete ${tx.title}`}
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    )}
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
