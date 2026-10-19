import React, { useState } from 'react';
import type { Account, AccountType, SupportedCurrency, Transaction } from '../types';
import { formatCurrency } from '../utils/formatters';
import { calculateAccountBalance, getAccountTransactionStats } from '../utils/accountUtils';
import { AccountModal } from './AccountModal';

interface AccountsPageProps {
  accounts: Account[];
  transactions: Transaction[];
  onAddAccount: (data: Omit<Account, 'id' | 'createdAt'>) => void;
  onEditAccount: (data: Omit<Account, 'id' | 'createdAt'>, editId: string) => void;
  onDeleteAccount: (id: string) => void;
  currency?: SupportedCurrency;
}

const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  'Cash': '💵',
  'Bank Account': '🏦',
  'Mobile Wallet': '📱',
  'Credit Card': '💳',
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  'Cash': 'acct-badge-cash',
  'Bank Account': 'acct-badge-bank',
  'Mobile Wallet': 'acct-badge-wallet',
  'Credit Card': 'acct-badge-credit',
};

export const AccountsPage: React.FC<AccountsPageProps> = ({
  accounts,
  transactions,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  currency = 'USD',
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Derived: Current real-time balance = opening balance + linked income - linked expense ± transfers
  const getDisplayBalance = (account: Account): number => {
    return calculateAccountBalance(account, transactions);
  };

  // Portfolio totals across all accounts using real dynamic balances
  const totalAssets = accounts
    .filter((a) => a.type !== 'Credit Card')
    .reduce((sum, a) => sum + getDisplayBalance(a), 0);

  const totalCreditDebt = accounts
    .filter((a) => a.type === 'Credit Card')
    .reduce((sum, a) => sum + getDisplayBalance(a), 0); // may be negative

  const netWorth = totalAssets + totalCreditDebt;

  const handleOpenAdd = () => {
    setEditingAccount(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (account: Account) => {
    setEditingAccount(account);
    setIsModalOpen(true);
  };

  const handleModalSave = (data: Omit<Account, 'id' | 'createdAt'>, editId?: string) => {
    if (editId) {
      onEditAccount(data, editId);
    } else {
      onAddAccount(data);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      onDeleteAccount(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  const accountToDelete = accounts.find((a) => a.id === deleteConfirmId);
  const linkedTxCount = accountToDelete
    ? transactions.filter(
        (tx) => tx.accountId === accountToDelete.id || tx.toAccountId === accountToDelete.id
      ).length
    : 0;

  const formatDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="transactions-section">
      {/* Page header */}
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Accounts</h2>
          <span className="section-subtitle">
            {accounts.length === 0
              ? 'Add your financial accounts to start tracking'
              : `${accounts.length} account${accounts.length !== 1 ? 's' : ''} · Real-time balances`}
          </span>
        </div>
        <button className="btn-primary" onClick={handleOpenAdd} id="add-account-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add Account</span>
        </button>
      </div>

      {accounts.length === 0 ? (
        /* ── Empty state ── */
        <div className="empty-state">
          <div className="empty-icon">🏦</div>
          <h3 className="empty-title">No accounts yet</h3>
          <p className="empty-desc">
            Add a Cash account, Bank Account, Mobile Wallet, or Credit Card to start organising your finances.
            Balances are calculated live from opening balances and transactions.
          </p>
          <button className="empty-action-btn" onClick={handleOpenAdd} id="add-first-account-btn">
            + Add Your First Account
          </button>
        </div>
      ) : (
        <>
          {/* ── Portfolio summary strip ── */}
          <div className="acct-summary-strip">
            <div className="acct-summary-item">
              <span className="acct-summary-label">Total Assets</span>
              <span className="acct-summary-val income-text">{formatCurrency(totalAssets, currency)}</span>
            </div>
            <div className="acct-summary-divider" />
            <div className="acct-summary-item">
              <span className="acct-summary-label">Credit Debt</span>
              <span className={`acct-summary-val ${totalCreditDebt < 0 ? 'expense-text' : ''}`}>
                {formatCurrency(totalCreditDebt, currency)}
              </span>
            </div>
            <div className="acct-summary-divider" />
            <div className="acct-summary-item">
              <span className="acct-summary-label">Net Worth</span>
              <span className={`acct-summary-val acct-net-worth ${netWorth >= 0 ? 'income-text' : 'expense-text'}`}>
                {formatCurrency(netWorth, currency)}
              </span>
            </div>
          </div>

          {/* ── Accounts grid ── */}
          <div className="acct-grid">
            {accounts.map((account) => {
              const balance = getDisplayBalance(account);
              const isCredit = account.type === 'Credit Card';
              const balancePositive = balance >= 0;
              const stats = getAccountTransactionStats(account.id, transactions);

              return (
                <div key={account.id} className={`acct-card${isCredit ? ' acct-card-credit' : ''}`}>
                  {/* Card header */}
                  <div className="acct-card-header">
                    <div className="acct-info">
                      <div className={`acct-icon-badge ${ACCOUNT_TYPE_COLORS[account.type]}`}>
                        <span>{ACCOUNT_TYPE_ICONS[account.type]}</span>
                      </div>
                      <div className="acct-title-block">
                        <h3 className="acct-name">{account.name}</h3>
                        <span className="acct-type-pill">{account.type}</span>
                      </div>
                    </div>
                    <div className="acct-actions">
                      <button
                        className="budget-action-btn"
                        onClick={() => handleOpenEdit(account)}
                        title={`Edit ${account.name}`}
                        aria-label={`Edit ${account.name}`}
                        id={`edit-account-${account.id}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button
                        className="budget-action-btn delete"
                        onClick={() => handleDeleteRequest(account.id)}
                        title={`Delete ${account.name}`}
                        aria-label={`Delete ${account.name}`}
                        id={`delete-account-${account.id}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Balance display */}
                  <div className="acct-balance-block">
                    <div className="acct-balance-header">
                      <span className="acct-balance-label">Current Balance</span>
                      <span className="acct-opening-subtext">
                        Opening: {formatCurrency(account.openingBalance, currency)}
                      </span>
                    </div>
                    <span className={`acct-balance-amount ${balancePositive ? (isCredit ? '' : 'income-text') : 'expense-text'}`}>
                      {formatCurrency(balance, currency)}
                    </span>
                  </div>

                  {/* Footer: note + transaction count & date */}
                  <div className="acct-card-footer">
                    <div className="acct-footer-left">
                      {account.note ? (
                        <span className="acct-note">{account.note}</span>
                      ) : (
                        <span className="acct-note acct-note-empty">No note</span>
                      )}
                      <span className="acct-tx-badge">
                        {stats.count === 0
                          ? 'No transactions'
                          : `${stats.count} transaction${stats.count !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <span className="acct-created-date">Added {formatDate(account.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dynamic balance info note */}
          <p className="acct-disclaimer">
            💡 Balances shown are dynamically calculated from opening balances plus all linked income, expense, and transfer transactions.
          </p>
        </>
      )}

      {/* Add / Edit Modal */}
      <AccountModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleModalSave}
        existingAccount={editingAccount}
        currency={currency}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && accountToDelete && (
        <div className="modal-overlay" onClick={handleDeleteCancel}>
          <div className="modal-container acct-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Delete Account</h2>
                <p className="modal-subtitle">This action cannot be undone</p>
              </div>
              <button className="modal-close-btn" onClick={handleDeleteCancel} aria-label="Cancel deletion">
                ✕
              </button>
            </div>
            <div className="acct-confirm-body">
              <div className="acct-confirm-icon">🗑️</div>
              <div className="acct-confirm-text">
                <p>
                  Are you sure you want to delete <strong>"{accountToDelete.name}"</strong>?
                  The account record will be permanently removed from local storage.
                </p>
                {linkedTxCount > 0 && (
                  <p className="acct-confirm-warning">
                    ⚠️ This account has <strong>{linkedTxCount}</strong> linked transaction{linkedTxCount !== 1 ? 's' : ''}.
                    Those transactions will be preserved in your history, but will be safely labeled as associated with a deleted account.
                  </p>
                )}
              </div>
            </div>
            <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
              <button className="btn-secondary" onClick={handleDeleteCancel} id="cancel-delete-account-btn">
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDeleteConfirm} id="confirm-delete-account-btn">
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
