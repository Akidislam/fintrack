import React from 'react';
import type { SupportedCurrency } from '../types';
import { formatCurrency, CURRENCY_SYMBOLS } from '../utils/formatters';

interface SettingsPageProps {
  currency: SupportedCurrency;
  onCurrencyChange: (newCurrency: SupportedCurrency) => void;
  transactionsCount: number;
  budgetsCount: number;
  accountsCount: number;
  onResetData: () => void;
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
}) => {
  return (
    <div className="transactions-section">
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
            <span className="settings-status-badge">Active</span>
          </div>

          <p className="settings-card-desc">
            FinTrack is a personal finance tracker designed to help you track cash flow, manage category-based budgets, and analyze spending habits.
          </p>

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

          <div className="currency-options-list">
            {CURRENCY_OPTIONS.map((opt) => {
              const isSelected = currency === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  className={`currency-option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => onCurrencyChange(opt.code)}
                >
                  <div className="currency-option-main">
                    <span className="currency-symbol-circle">
                      {CURRENCY_SYMBOLS[opt.code]}
                    </span>
                    <div className="currency-text-wrap">
                      <span className="currency-option-label">{opt.label}</span>
                      <span className="currency-option-name">{opt.name}</span>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="currency-checkmark">
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
            <span className="preview-label">Live Preview:</span>
            <span className="preview-income">+{formatCurrency(1000, currency)}</span>
            <span className="preview-separator">•</span>
            <span className="preview-expense">-{formatCurrency(250, currency)}</span>
          </div>
        </div>

        {/* 3. Storage & Data Management Card */}
        <div className="settings-card settings-card-wide">
          <div className="settings-card-header">
            <div>
              <h3 className="settings-card-title">Data Storage & Status</h3>
              <p className="settings-card-subtitle">
                Information regarding data persistence and backend connectivity
              </p>
            </div>
            <span className="settings-storage-pill">PostgreSQL & Session Storage</span>
          </div>

          <div className="storage-points-list">
            <div className="storage-point-item">
              <div className="storage-point-icon">🔒</div>
              <div className="storage-point-text">
                <span className="storage-point-title">Authenticated Data Isolation</span>
                <p className="storage-point-desc">
                  Accounts and categories are synchronized with the secure PostgreSQL backend. User data is strictly isolated to your authenticated account session.
                </p>
              </div>
            </div>

            <div className="storage-point-item">
              <div className="storage-point-icon">💾</div>
              <div className="storage-point-text">
                <span className="storage-point-title">Session Persistence</span>
                <p className="storage-point-desc">
                  Your transactions and preferences are scoped to your user account and automatically cleared upon logout to prevent cross-account data leakage.
                </p>
              </div>
            </div>
          </div>

          <div className="storage-summary-strip">
            <div className="storage-stat">
              <span className="storage-stat-label">Accounts:</span>
              <span className="storage-stat-val">{accountsCount}</span>
            </div>
            <div className="storage-stat">
              <span className="storage-stat-label">Transactions:</span>
              <span className="storage-stat-val">{transactionsCount}</span>
            </div>
            <div className="storage-stat">
              <span className="storage-stat-label">Configured Budgets:</span>
              <span className="storage-stat-val">{budgetsCount}</span>
            </div>
            <div className="storage-stat">
              <span className="storage-stat-label">Saved Currency:</span>
              <span className="storage-stat-val">{currency}</span>
            </div>

            <div className="storage-reset-wrap">
              <button
                type="button"
                className="reset-data-btn"
                onClick={onResetData}
                title="Clear all local data and reset balances to zero"
              >
                Clear Local Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
