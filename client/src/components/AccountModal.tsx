import React, { useState, useEffect } from 'react';
import type { Account, AccountType, SupportedCurrency } from '../types';
import { CURRENCY_SYMBOLS } from '../utils/formatters';

interface AccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Omit<Account, 'id' | 'createdAt'>, editId?: string) => void;
    existingAccount?: Account | null;
    currency?: SupportedCurrency;
}

const ACCOUNT_TYPES: AccountType[] = ['Cash', 'Bank Account', 'Mobile Wallet', 'Credit Card'];

const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
    'Cash': '💵',
    'Bank Account': '🏦',
    'Mobile Wallet': '📱',
    'Credit Card': '💳',
};

const EMPTY_FORM = {
    name: '',
    type: 'Bank Account' as AccountType,
    openingBalance: '',
    note: '',
};

export const AccountModal: React.FC<AccountModalProps> = ({
    isOpen,
    onClose,
    onSave,
    existingAccount,
    currency = 'USD',
}) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<AccountType>('Bank Account');
    const [openingBalance, setOpeningBalance] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');

    // Populate fields when editing an existing account
    useEffect(() => {
        if (existingAccount) {
            setName(existingAccount.name);
            setType(existingAccount.type);
            setOpeningBalance(existingAccount.openingBalance.toString());
            setNote(existingAccount.note ?? '');
        } else {
            setName(EMPTY_FORM.name);
            setType(EMPTY_FORM.type);
            setOpeningBalance(EMPTY_FORM.openingBalance);
            setNote(EMPTY_FORM.note);
        }
        setError('');
    }, [existingAccount, isOpen]);

    // ESC to close
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('Account name is required.');
            return;
        }
        if (trimmedName.length > 50) {
            setError('Account name must be 50 characters or fewer.');
            return;
        }

        const parsedBalance = parseFloat(openingBalance);
        if (openingBalance.trim() === '' || isNaN(parsedBalance)) {
            setError('Please enter a valid opening balance (use 0 for zero balance).');
            return;
        }

        onSave(
            { name: trimmedName, type, openingBalance: parsedBalance, note: note.trim() || undefined },
            existingAccount?.id
        );
        onClose();
    };

    const currencySymbol = CURRENCY_SYMBOLS[currency];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">
                            {existingAccount ? 'Edit Account' : 'Add New Account'}
                        </h2>
                        <p className="modal-subtitle">
                            {existingAccount
                                ? `Update details for "${existingAccount.name}"`
                                : 'Create a new account to track your funds'}
                        </p>
                    </div>
                    <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
                        ✕
                    </button>
                </div>

                {error && <div className="modal-error-alert">{error}</div>}

                <form onSubmit={handleSubmit} className="modal-form">
                    {/* Account type selector */}
                    <div className="form-group">
                        <label className="form-label">Account Type</label>
                        <div className="acct-type-grid">
                            {ACCOUNT_TYPES.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    className={`acct-type-btn${type === t ? ' selected' : ''}`}
                                    onClick={() => setType(t)}
                                    aria-pressed={type === t}
                                >
                                    <span className="acct-type-icon">{ACCOUNT_TYPE_ICONS[t]}</span>
                                    <span className="acct-type-label">{t}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Account name */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="account-name">
                            Account Name
                        </label>
                        <input
                            id="account-name"
                            type="text"
                            className="form-input"
                            placeholder={`e.g. ${type === 'Bank Account' ? 'BRAC Bank Savings' : type === 'Credit Card' ? 'Visa Platinum' : type === 'Mobile Wallet' ? 'bKash Wallet' : 'Petty Cash'}`}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={50}
                            autoFocus
                            required
                        />
                    </div>

                    {/* Opening balance */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="account-balance">
                            Opening Balance ({currencySymbol})
                        </label>
                        <div className="input-prefix-wrapper">
                            <span className="input-prefix">{currencySymbol}</span>
                            <input
                                id="account-balance"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                className="form-input with-prefix"
                                value={openingBalance}
                                onChange={(e) => setOpeningBalance(e.target.value)}
                                required
                            />
                        </div>
                        {type === 'Credit Card' && (
                            <span className="form-hint">
                                For credit cards, enter current debt as a negative number (e.g. -5000) or 0 if newly opened.
                            </span>
                        )}
                    </div>

                    {/* Optional note */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="account-note">
                            Note <span className="form-label-optional">(optional)</span>
                        </label>
                        <input
                            id="account-note"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Primary business account"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={100}
                        />
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary">
                            {existingAccount ? 'Save Changes' : 'Add Account'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
