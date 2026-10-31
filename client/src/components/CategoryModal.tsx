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

  useEffect(() => {
    if (!isOpen) return;
    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current.focus();
      } else if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

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
      <div
        ref={modalRef}
        className="modal-container category-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-modal-title"
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="category-modal-title">
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

        {error && <div className="modal-error-alert" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Type Selector Toggle */}
          <div className="form-group">
            <span id="cat-type-label" className="form-label">Category Type</span>
            <div className="type-toggle-group" role="group" aria-labelledby="cat-type-label">
              <button
                type="button"
                className={`type-toggle-btn expense ${type === 'expense' ? 'selected' : ''}`}
                aria-pressed={type === 'expense'}
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
                aria-pressed={type === 'income'}
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
                aria-pressed={type === 'transfer'}
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
            <div className="category-icon-input-row">
              <input
                id="category-icon"
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="form-input category-icon-input"
                maxLength={4}
              />
              <span className="form-hint">
                Pick from quick suggestions below or type an emoji
              </span>
            </div>
            <div className="category-icon-presets" role="group" aria-label="Choose an icon">
              {currentPresetIcons.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`category-icon-preset ${icon === preset ? 'selected' : ''}`}
                  onClick={() => setIcon(preset)}
                  aria-label={`Select icon ${preset}`}
                  aria-pressed={icon === preset}
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
            <div className="category-color-input-row">
              <input
                id="category-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="category-native-color-input"
                aria-label="Choose custom category color"
              />
              <span className="category-color-value">
                {color}
              </span>
            </div>
            <div className="category-color-presets" role="group" aria-label="Choose a preset color">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`category-color-preset ${color.toLowerCase() === preset ? 'selected' : ''}`}
                  onClick={() => setColor(preset)}
                  style={{ backgroundColor: preset }}
                  aria-label={`Select color ${preset}`}
                  aria-pressed={color.toLowerCase() === preset}
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
