import React, { useEffect, useRef, useState } from 'react';
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const previousModeRef = useRef(mode);

  const isLogin = mode === 'login';

  useEffect(() => {
    if (previousModeRef.current !== mode) {
      firstFieldRef.current?.focus();
      previousModeRef.current = mode;
    }
  }, [mode]);

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setError(null);
    setFieldErrors({});
    setShowPassword(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFieldErrors({ email: 'Email address is required.' });
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setFieldErrors({ email: 'Please enter a valid email address.' });
      return;
    }

    if (!password) {
      setFieldErrors({ password: 'Password is required.' });
      return;
    }

    if (!isLogin) {
      const cleanName = name.trim();
      if (!cleanName) {
        setFieldErrors({ name: 'Full name is required.' });
        return;
      }
      if (cleanName.length > 100) {
        setFieldErrors({ name: 'Name must be 100 characters or fewer.' });
        return;
      }
      if (password.length < 8) {
        setFieldErrors({ password: 'Password must be at least 8 characters long.' });
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
    <main className="auth-page-wrapper">
      <div className="auth-ambient auth-ambient-one" aria-hidden="true" />
      <div className="auth-ambient auth-ambient-two" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="auth-title">
        {/* Header with Brand Icon */}
        <div className="auth-header">
          <div className="auth-brand">
            <div className="brand-icon">
              <svg
                aria-hidden="true"
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

          <h1 className="auth-title" id="auth-title">
            {isLogin ? 'Welcome Back' : 'Create Your Account'}
          </h1>
          <p className="auth-subtitle">
            {isLogin
              ? 'Sign in to continue managing your finances.'
              : 'Start taking control of your finances today.'}
          </p>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div className="auth-api-error" role="alert">
            <span aria-hidden="true">!</span> {error}
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
                ref={!isLogin ? firstFieldRef : undefined}
                type="text"
                className="form-input"
                placeholder="e.g. Alex Johnson"
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSubmitting}
                maxLength={100}
                required
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
              />
              {fieldErrors.name && <p className="auth-field-error" id="auth-name-error">{fieldErrors.name}</p>}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email-input">
              Email Address <span className="required-star">*</span>
            </label>
            <input
              id="auth-email-input"
              ref={isLogin ? firstFieldRef : undefined}
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
                if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: '' }));
              }}
              disabled={isSubmitting}
              autoComplete="email"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
            />
            {fieldErrors.email && <p className="auth-field-error" id="auth-email-error">{fieldErrors.email}</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password-input">
              Password <span className="required-star">*</span>
            </label>
            <div className="auth-password-wrap">
              <input
                id="auth-password-input"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                  if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: '' }));
                }}
                disabled={isSubmitting}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={[!isLogin ? 'auth-password-hint' : '', fieldErrors.password ? 'auth-password-error' : ''].filter(Boolean).join(' ') || undefined}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={isSubmitting}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {!isLogin && <p className="auth-field-hint" id="auth-password-hint">Use at least 8 characters.</p>}
            {fieldErrors.password && <p className="auth-field-error" id="auth-password-error">{fieldErrors.password}</p>}
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
            {isSubmitting && <span className="auth-submit-spinner" aria-hidden="true" />}
            {isSubmitting
              ? isLogin
                ? 'Signing in...'
                : 'Creating account...'
              : isLogin
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
        <span className="auth-sr-only" role="status" aria-live="polite">{isSubmitting ? (isLogin ? 'Signing in…' : 'Creating account…') : ''}</span>

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
      </section>
    </main>
  );
};
