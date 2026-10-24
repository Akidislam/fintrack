import React, { useState } from 'react';
import { api } from '../services/api';
import type { SupportedCurrency, User } from '../types';

interface AuthPageProps {
  onAuthSuccess: (user: User) => void;
}

const SUPPORTED_CURRENCIES: { code: SupportedCurrency; label: string }[] = [
  { code: 'USD', label: 'USD ($) - US Dollar' },
  { code: 'BDT', label: 'BDT (৳) - Bangladeshi Taka' },
  { code: 'EUR', label: 'EUR (€) - Euro' },
  { code: 'GBP', label: 'GBP (£) - British Pound' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === 'login';

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Email address is required.');
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Password is required.');
      return;
    }

    if (!isLogin) {
      const cleanName = name.trim();
      if (!cleanName) {
        setError('Full name is required.');
        return;
      }
      if (cleanName.length > 100) {
        setError('Name must be 100 characters or fewer.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      let user: User;

      if (isLogin) {
        user = await api.login({ email: cleanEmail, password });
      } else {
        user = await api.register({
          name: name.trim(),
          email: cleanEmail,
          password,
          currency,
        });
      }

      onAuthSuccess(user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card">
        {/* Header with Brand Icon */}
        <div className="auth-header">
          <div className="auth-brand">
            <div className="brand-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2v20"></path>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <span className="brand-name">FinTrack</span>
          </div>

          <h2 className="auth-title">
            {isLogin ? 'Sign in to your account' : 'Create your account'}
          </h2>
          <p className="auth-subtitle">
            {isLogin
              ? 'Enter your credentials to access your financial dashboard'
              : 'Start tracking wealth, accounts, and budgets in real time'}
          </p>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div className="modal-error-alert" role="alert">
            ⚠️ {error}
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {!isLogin && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-name-input">
                Full Name <span className="required-star">*</span>
              </label>
              <input
                id="auth-name-input"
                type="text"
                className="form-input"
                placeholder="e.g. Alex Johnson"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSubmitting}
                autoFocus={!isLogin}
                maxLength={100}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email-input">
              Email Address <span className="required-star">*</span>
            </label>
            <input
              id="auth-email-input"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              autoFocus={isLogin}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password-input">
              Password <span className="required-star">*</span>
            </label>
            <input
              id="auth-password-input"
              type="password"
              className="form-input"
              placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-currency-select">
                Default Currency
              </label>
              <select
                id="auth-currency-select"
                className="form-input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
                disabled={isSubmitting}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary auth-submit-btn"
            disabled={isSubmitting}
            id="auth-submit-btn"
          >
            {isSubmitting
              ? isLogin
                ? 'Signing in...'
                : 'Creating account...'
              : isLogin
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        {/* Footer Toggle between Login and Register */}
        <div className="auth-switch-footer">
          {isLogin ? (
            <span>
              Don't have an account?{' '}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={handleToggleMode}
                disabled={isSubmitting}
                id="toggle-auth-mode-btn"
              >
                Sign up now
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                className="auth-switch-btn"
                onClick={handleToggleMode}
                disabled={isSubmitting}
                id="toggle-auth-mode-btn"
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
