import React, { useState, useEffect, useRef } from 'react';
import type { Category, TransactionType } from '../types';
import type { CreateCategoryInput } from '../services/api';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateCategoryInput, editId?: string) => Promise<void> | void;
  existingCategory?: Category | null;
}

const PRESET_ICONS: Record<TransactionType, string[]> = {
  expense: ['🛒', '🍔', '🏠', '⚡', '🚗', '🎬', '🏥', '🛍️', '✈️', '📚', '🎁', '🐾', '🏋️', '☕', '🏷️'],
  income: ['💰', '💼', '📈', '💵', '🪙', '🏆', '🎁', '🏦', '🏷️'],
  transfer: ['🔄', '💳', '🏛️', '🔁', '🏷️'],
};

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Amber
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#64748b', // Slate
];

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingCategory,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [icon, setIcon] = useState('🏷️');
  const [color, setColor] = useState('#3b82f6');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (existingCategory) {
      setName(existingCategory.name);
      setType(existingCategory.type);
      setIcon(existingCategory.icon || '🏷️');
      setColor(existingCategory.color || '#3b82f6');
    } else {
      setName('');
      setType('expense');
      setIcon('🛒');
      setColor('#3b82f6');
    }
    setError('');
  }, [existingCategory, isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (isOpen && modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please provide a category name.');
      return;
    }
    if (trimmedName.length > 50) {
      setError('Category name cannot exceed 50 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(
        {
          name: trimmedName,
          type,
          icon: icon.trim() || undefined,
          color: color || undefined,
        },
        existingCategory?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentPresetIcons = PRESET_ICONS[type] || PRESET_ICONS.expense;

  return (
    <div className="modal-overlay">
      <div ref={modalRef} className="modal-container" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {existingCategory ? 'Edit Category' : 'Create Category'}
            </h2>
            <p className="modal-subtitle">
              {existingCategory
                ? `Update details for "${existingCategory.name}"`
                : 'Add a custom category to organize your finances'}
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && <div className="modal-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Type Selector Toggle */}
          <div className="form-group">
            <span id="cat-type-label" className="form-label">Category Type</span>
            <div className="type-toggle-group" role="group" aria-labelledby="cat-type-label">
              <button
                type="button"
                className={`type-toggle-btn expense ${type === 'expense' ? 'selected' : ''}`}
                onClick={() => {
                  setType('expense');
                  if (!existingCategory) setIcon('🛒');
                }}
              >
                🔴 Expense
              </button>
              <button
                type="button"
                className={`type-toggle-btn income ${type === 'income' ? 'selected' : ''}`}
                onClick={() => {
                  setType('income');
                  if (!existingCategory) setIcon('💰');
                }}
              >
                🟢 Income
              </button>
              <button
                type="button"
                className={`type-toggle-btn transfer ${type === 'transfer' ? 'selected' : ''}`}
                onClick={() => {
                  setType('transfer');
                  if (!existingCategory) setIcon('🔄');
                }}
              >
                🔄 Transfer
              </button>
            </div>
          </div>

          {/* Category Name */}
          <div className="form-group">
            <label htmlFor="category-name" className="form-label">
              Category Name *
            </label>
            <input
              id="category-name"
              type="text"
              placeholder="e.g. Subscriptions, Pet Care, Side Hustle"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              maxLength={50}
              autoFocus
              required
            />
          </div>

          {/* Icon Selection */}
          <div className="form-group">
            <label htmlFor="category-icon" className="form-label">
              Icon / Emoji
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <input
                id="category-icon"
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="form-input"
                style={{ width: '80px', textAlign: 'center', fontSize: '1.25rem' }}
                maxLength={4}
              />
              <span className="form-hint" style={{ margin: 0 }}>
                Pick from quick suggestions below or type an emoji
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {currentPresetIcons.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setIcon(preset)}
                  style={{
                    background: icon === preset ? 'var(--primary-subtle, rgba(99, 102, 241, 0.15))' : 'var(--bg-card, #1e293b)',
                    border: icon === preset ? '2px solid var(--primary, #6366f1)' : '1px solid var(--border-subtle, #334155)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title={`Use ${preset}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="form-group">
            <label htmlFor="category-color" className="form-label">
              Badge Color
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <input
                id="category-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: '42px',
                  height: '36px',
                  border: '1px solid var(--border-subtle, #334155)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '2px',
                  backgroundColor: 'transparent',
                }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-subtle, #94a3b8)', fontFamily: 'monospace' }}>
                {color}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  style={{
                    backgroundColor: preset,
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: color === preset ? '2px solid #fff' : '2px solid transparent',
                    boxShadow: color === preset ? '0 0 0 2px var(--primary, #6366f1)' : 'none',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                  title={preset}
                />
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : existingCategory
                ? 'Save Changes'
                : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
