import React, { useState } from 'react';
import type { Transaction, TransactionType, SupportedCurrency, Account, AccountType } from '../types';
import { formatCurrency } from '../utils/formatters';

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  onDeleteTransaction: (id: string) => void;
  onEditTransaction: (tx: Transaction) => void;
  onOpenAddModal: () => void;
  currency?: SupportedCurrency;
}

const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  'Cash': '💵',
  'Bank Account': '🏦',
  'Mobile Wallet': '📱',
  'Credit Card': '💳',
};

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  accounts,
  onDeleteTransaction,
  onEditTransaction,
  onOpenAddModal,
  currency = 'USD',
}) => {
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
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
      default:
        return '💳';
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    const matchesFilter = filterType === 'all' || tx.type === filterType;

    let matchesAccount = true;
    if (filterAccount === 'unassigned') {
      matchesAccount = !tx.accountId && !tx.toAccountId;
    } else if (filterAccount !== 'all') {
      matchesAccount = tx.accountId === filterAccount || tx.toAccountId === filterAccount;
    }

    const fromAccount = accounts.find((a) => a.id === tx.accountId);
    const toAccount = accounts.find((a) => a.id === tx.toAccountId);
    const accountNames = `${fromAccount?.name || ''} ${toAccount?.name || ''}`;

    const matchesSearch =
      tx.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.note && tx.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
      accountNames.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesAccount && matchesSearch;
  });

  return (
    <div className="transactions-section">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Recent Transactions</h2>
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
              placeholder="Search transactions, accounts..."
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

          {/* Account Filter Dropdown */}
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
            <button
              className={`filter-pill ${filterType === 'transfer' ? 'active' : ''}`}
              onClick={() => setFilterType('transfer')}
            >
              Transfers
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
              ? `No transactions matched "${searchQuery}". Try a different search term.`
              : 'There are no transactions recorded for this filter category.'}
          </p>
          <button className="empty-action-btn" onClick={onOpenAddModal}>
            + Add New Transaction
          </button>
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
                        <span className="tx-category-tag">{tx.category}</span>

                        {/* Account display */}
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
                                <span className="tx-account-icon">⚠️</span>
                                Deleted Account
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

                    <button
                      className="budget-action-btn"
                      onClick={() => onEditTransaction(tx)}
                      title={`Edit transaction "${tx.title}"`}
                      aria-label={`Edit ${tx.title}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>

                    <button
                      className="budget-action-btn delete"
                      onClick={() => onDeleteTransaction(tx.id)}
                      title="Delete transaction"
                      aria-label={`Delete ${tx.title}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
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
