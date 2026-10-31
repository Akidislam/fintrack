import React, { useEffect, useRef, useState } from 'react';
import type { SupportedCurrency } from '../types';
import { formatCurrency, CURRENCY_SYMBOLS } from '../utils/formatters';

interface SettingsPageProps {
  currency: SupportedCurrency;
  onCurrencyChange: (newCurrency: SupportedCurrency) => void;
  transactionsCount: number;
  budgetsCount: number;
  accountsCount: number;
  onResetData: () => void;
  transactionsLoading?: boolean;
  transactionsError?: string | null;
  budgetsLoading?: boolean;
  budgetsError?: string | null;
  accountsLoading?: boolean;
  accountsError?: string | null;
}

interface CurrencyOption {
  code: SupportedCurrency;
  label: string;
  name: string;
}

const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', label: 'USD ($)', name: 'United States Dollar' },
  { code: 'BDT', label: 'BDT (৳)', name: 'Bangladeshi Taka' },
  { code: 'EUR', label: 'EUR (€)', name: 'Euro' },
  { code: 'GBP', label: 'GBP (£)', name: 'British Pound' },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currency,
  onCurrencyChange,
  transactionsCount,
  budgetsCount,
  accountsCount,
  onResetData,
  transactionsLoading = false,
  transactionsError = null,
  budgetsLoading = false,
  budgetsError = null,
  accountsLoading = false,
  accountsError = null,
}) => {
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);
  const clearDataButtonRef = useRef<HTMLButtonElement>(null);
  const resetDialogRef = useRef<HTMLDivElement>(null);
  const cancelResetButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isResetConfirmationOpen) return;
    const dialog = resetDialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelResetButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsResetConfirmationOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
      } else if (document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
      } else if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isResetConfirmationOpen]);

  const storageStats = [
    { label: 'Accounts', count: accountsCount, isLoading: accountsLoading, error: accountsError },
    { label: 'Transactions', count: transactionsCount, isLoading: transactionsLoading, error: transactionsError },
    { label: 'Configured budgets', count: budgetsCount, isLoading: budgetsLoading, error: budgetsError },
  ];

  return (
    <div className="transactions-section settings-page">
      {/* Header */}
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Settings & Preferences</h2>
          <span className="section-subtitle">
            Configure application display preferences and view storage status
          </span>
        </div>
      </div>

      <div className="settings-cards-grid">
        {/* 1. App Information Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="settings-brand-info">
              <div className="brand-icon">
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20"></path>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">FinTrack</h3>
                <span className="settings-version-tag">v1.0 • Web Frontend</span>
              </div>
            </div>
            <span className="settings-status-badge">Web app</span>
          </div>

          <p className="settings-card-desc">
            FinTrack is a personal finance tracker designed to help you track cash flow, manage category-based budgets, and analyze spending habits.
          </p>

          <div className="settings-theme-note">
            <span className="settings-theme-note-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
              </svg>
            </span>
            <span>Appearance follows the Day/Night control in the top bar.</span>
          </div>

          <div className="settings-info-box">
            <div className="settings-info-item">
              <span className="settings-info-label">Architecture</span>
              <span className="settings-info-val">React + TypeScript + Vite</span>
            </div>
            <div className="settings-info-item">
              <span className="settings-info-label">Backend</span>
              <span className="settings-info-val">Node.js + PostgreSQL</span>
            </div>
          </div>
        </div>

        {/* 2. Currency Preference Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h3 className="settings-card-title">Display Currency</h3>
              <p className="settings-card-subtitle">
                Select your preferred currency symbol for formatting monetary amounts
              </p>
            </div>
            <span className="settings-active-currency-pill">
              {CURRENCY_SYMBOLS[currency]} {currency}
            </span>
          </div>

          <div className="currency-options-list" role="group" aria-label="Select display currency">
            {CURRENCY_OPTIONS.map((opt) => {
              const isSelected = currency === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  className={`currency-option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onCurrencyChange(opt.code)}
                  aria-pressed={isSelected}
                  aria-label={`${opt.label} — ${opt.name}`}
                >
                  <div className="currency-option-main">
                    <span className="currency-symbol-circle" aria-hidden="true">
                      {CURRENCY_SYMBOLS[opt.code]}
                    </span>
                    <div className="currency-text-wrap">
                      <span className="currency-option-label">{opt.label}</span>
                      <span className="currency-option-name">{opt.name}</span>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="currency-checkmark" aria-hidden="true">
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="currency-preview-box">
            <span className="currency-preview-heading">Display formatting preview</span>
            <span className="preview-label">Live Preview:</span>
            <span className="preview-income">+{formatCurrency(1000, currency)}</span>
            <span className="preview-separator">•</span>
            <span className="preview-expense">-{formatCurrency(250, currency)}</span>
          </div>
          <p className="currency-preference-note">
            Currency changes only how amounts are displayed; they do not convert balances. This choice is saved in this browser. The currency returned by your account at sign-in may take precedence after reload.
          </p>
        </div>

        {/* 3. Storage & Data Management Card */}
        <div className="settings-card settings-card-wide">
          <div className="settings-card-header">
            <div>
              <h3 className="settings-card-title">Data Storage & Status</h3>
              <p className="settings-card-subtitle">
                How account data and local display preferences are handled
              </p>
            </div>
            <span className="settings-storage-pill">Account data · browser preferences</span>
          </div>

          <div className="storage-points-list">
            <div className="storage-point-item">
              <div className="storage-point-icon" aria-hidden="true">🔒</div>
              <div className="storage-point-text">
                <span className="storage-point-title">Authenticated Data Isolation</span>
                <p className="storage-point-desc">
                  Financial records are synchronized with your authenticated account. Profile details are shown in the sidebar; profile editing and security controls are not available on this page.
                </p>
              </div>
            </div>

            <div className="storage-point-item">
              <div className="storage-point-icon" aria-hidden="true">💾</div>
              <div className="storage-point-text">
                <span className="storage-point-title">Browser Preferences & Local Cache</span>
                <p className="storage-point-desc">
                  Theme and display-currency choices are stored in this browser. The Clear Local Data action removes legacy cache keys and reloads account data; it does not delete your server records.
                </p>
              </div>
            </div>
          </div>

          <div className="storage-summary-strip">
            {storageStats.map((stat) => {
              const unavailable = Boolean(stat.error && stat.count === 0 && !stat.isLoading);
              const loadingEmpty = stat.isLoading && stat.count === 0;
              return (
                <div className="storage-stat" key={stat.label} aria-live="polite">
                  <span className="storage-stat-label">{stat.label}</span>
                  <strong className="storage-stat-val">
                    {loadingEmpty ? 'Loading…' : unavailable ? 'Unavailable' : stat.count}
                  </strong>
                  {stat.isLoading && stat.count > 0 && <span className="storage-stat-state">Refreshing</span>}
                  {stat.error && stat.count > 0 && (
                    <span className="storage-stat-state warning" title={stat.error}>Refresh failed</span>
                  )}
                  {unavailable && <span className="storage-stat-state warning" title={stat.error || undefined}>Could not load</span>}
                </div>
              );
            })}
            <div className="storage-stat">
              <span className="storage-stat-label">Display currency</span>
              <span className="storage-stat-val">{currency}</span>
            </div>

            <div className="storage-reset-wrap">
              <button
                ref={clearDataButtonRef}
                type="button"
                className="settings-clear-data-btn"
                onClick={() => setIsResetConfirmationOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isResetConfirmationOpen}
              >
                Clear Local Data
              </button>
            </div>
          </div>
        </div>
      </div>

      {isResetConfirmationOpen && (
        <div
          className="modal-overlay settings-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsResetConfirmationOpen(false);
          }}
        >
          <div
            ref={resetDialogRef}
            className="modal-container settings-reset-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="settings-reset-title"
            aria-describedby="settings-reset-description"
            tabIndex={-1}
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title" id="settings-reset-title">Clear local cache?</h2>
                <p className="modal-subtitle">Your account records remain on the server.</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setIsResetConfirmationOpen(false)} aria-label="Close confirmation">
                ✕
              </button>
            </div>
            <p className="settings-reset-description" id="settings-reset-description">
              This removes legacy browser cache entries, then reloads accounts, transactions, and budgets from your signed-in account. It does not delete server records or reset account balances.
            </p>
            <div className="modal-actions settings-reset-actions">
              <button ref={cancelResetButtonRef} type="button" className="btn-secondary" onClick={() => setIsResetConfirmationOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setIsResetConfirmationOpen(false);
                  onResetData();
                }}
              >
                Clear local cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
