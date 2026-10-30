import React, { useState, useEffect, useRef } from 'react';
import type { Account, AccountType, SupportedCurrency } from '../types';
import { CURRENCY_SYMBOLS } from '../utils/formatters';

interface AccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Omit<Account, 'id' | 'createdAt'>, editId?: string) => Promise<void> | void;
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
    const [isSaving, setIsSaving] = useState(false);

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
        setIsSaving(false);
    }, [existingAccount, isOpen]);

    const modalRef = useRef<HTMLDivElement>(null);

    // ESC to close
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && !isSaving) onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, isSaving, onClose]);

    // Click outside to close
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            if (!isSaving && isOpen && modalRef.current && !modalRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [isOpen, isSaving, onClose]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
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

        const parsedBalance = Number.parseFloat(openingBalance);
        if (openingBalance.trim() === '' || Number.isNaN(parsedBalance)) {
            setError('Please enter a valid opening balance (use 0 for zero balance).');
            return;
        }

        try {
            setIsSaving(true);
            await onSave(
                { name: trimmedName, type, openingBalance: parsedBalance, note: note.trim() || undefined },
                existingAccount?.id
            );
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save account');
        } finally {
            setIsSaving(false);
        }
    };

    const currencySymbol = CURRENCY_SYMBOLS[currency];

    return (
        <div className="modal-overlay">
            <div ref={modalRef} className="modal-container acct-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
                {/* Header */}
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title" id="account-modal-title">
                            {existingAccount ? 'Edit Account' : 'Add New Account'}
                        </h2>
                        <p className="modal-subtitle">
                            {existingAccount
                                ? `Update details for "${existingAccount.name}"`
                                : 'Create a new account to track your funds'}
                        </p>
                    </div>
                    <button
                        className="modal-close-btn"
                        onClick={onClose}
                        aria-label="Close modal"
                        id="close-account-modal-btn"
                        disabled={isSaving}
                    >
                        ✕
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="modal-error-alert" role="alert">
                        ⚠️ {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="modal-form" noValidate>
                    {/* Account Name */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="account-name-input">
                            Account Name <span className="required-star">*</span>
                        </label>
                        <input
                            id="account-name-input"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Chase Total Checking, Cash Wallet, Amex Gold"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (error) setError('');
                            }}
                            maxLength={50}
                            disabled={isSaving}
                        />
                    </div>

                    {/* Account Type */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="account-type-select">
                            Account Type <span className="required-star">*</span>
                        </label>
                        <div className="custom-select-wrap">
                            <select
                                id="account-type-select"
                                className="form-input"
                                value={type}
                                onChange={(e) => setType(e.target.value as AccountType)}
                                disabled={isSaving}
                            >
                                {ACCOUNT_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {ACCOUNT_TYPE_ICONS[t]} {t}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Opening Balance */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="account-opening-balance-input">
                            Opening Balance ({currencySymbol}) <span className="required-star">*</span>
                        </label>
                        <input
                            id="account-opening-balance-input"
                            type="number"
                            step="0.01"
                            className="form-input"
                            placeholder="0.00"
                            value={openingBalance}
                            onChange={(e) => {
                                setOpeningBalance(e.target.value);
                                if (error) setError('');
                            }}
                            disabled={isSaving}
                        />
                        <span className="form-help-text">
                            Starting amount. Use a negative value for Credit Card debt.
                        </span>
                    </div>

                    {/* Note / Description */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="account-note-input">
                            Note <span className="optional-tag">(optional)</span>
                        </label>
                        <input
                            id="account-note-input"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Emergency fund, Primary daily card"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={100}
                            disabled={isSaving}
                        />
                    </div>

                    {/* Action buttons */}
                    <div className="modal-actions">
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onClose}
                            id="cancel-account-btn"
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            id="save-account-btn"
                            disabled={isSaving}
                        >
                            {isSaving
                                ? 'Saving...'
                                : existingAccount
                                  ? 'Save Changes'
                                  : 'Create Account'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
