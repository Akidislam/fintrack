import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Category, TransactionType } from '../types';
import type { CreateCategoryInput } from '../services/api';
import { CategoryModal } from './CategoryModal';

interface CategoriesPageProps {
  categories: Category[];
  onSaveCategory: (data: CreateCategoryInput, editId?: string) => Promise<void> | void;
  onDeleteCategory: (id: string) => Promise<void> | void;
  isLoading?: boolean;
  error?: string | null;
  onClearError?: () => void;
  onRetry?: () => void;
}

export const CategoriesPage: React.FC<CategoriesPageProps> = ({
  categories,
  onSaveCategory,
  onDeleteCategory,
  isLoading = false,
  error = null,
  onClearError,
  onRetry,
}) => {
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);
  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const addCategoryButtonRef = useRef<HTMLButtonElement>(null);
  const editCategoriesButtonRef = useRef<HTMLButtonElement>(null);
  const categoryFocusReturnRef = useRef<HTMLElement | null>(null);
  const deleteFocusReturnRef = useRef<HTMLElement | null>(null);

  const handleOpenAdd = (event: React.MouseEvent<HTMLButtonElement>) => {
    categoryFocusReturnRef.current = event.currentTarget;
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    if (category.isSystem) return;
    setEditingCategory(category);
    setIsCategoryPickerOpen(false);
    setIsModalOpen(true);
  };

  const handleOpenCategoryPicker = (event: React.MouseEvent<HTMLButtonElement>) => {
    categoryFocusReturnRef.current = event.currentTarget;
    setIsCategoryPickerOpen(true);
  };

  const handleDeleteRequest = (category: Category, event: React.MouseEvent<HTMLButtonElement>) => {
    if (category.isSystem) return;
    deleteFocusReturnRef.current = event.currentTarget;
    setDeleteConfirmId(category.id);
    setDeleteError(null);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterType('all');
  };

  useEffect(() => {
    if (!isModalOpen && !isCategoryPickerOpen && categoryFocusReturnRef.current) {
      categoryFocusReturnRef.current.focus();
      categoryFocusReturnRef.current = null;
    }
  }, [isModalOpen, isCategoryPickerOpen]);

  useEffect(() => {
    if (!isCategoryPickerOpen || deleteConfirmId) return;
    const picker = categoryPickerRef.current;
    const focusable = () => picker?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    focusable()?.[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCategoryPickerOpen(false);
      if (event.key !== 'Tab' || !picker) return;
      const items = focusable();
      if (!items?.length) {
        event.preventDefault();
        picker.focus();
      } else if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === picker)) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault();
        items[0].focus();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (picker && !picker.contains(event.target as Node)) setIsCategoryPickerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isCategoryPickerOpen, deleteConfirmId, categories]);

  const handleDeleteCancel = useCallback(() => {
    if (!isDeleting) {
      setDeleteConfirmId(null);
      setDeleteError(null);
    }
  }, [isDeleting]);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await onDeleteCategory(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  // Close delete modal on Escape or outside click
  useEffect(() => {
    if (!deleteConfirmId) {
      const focusTarget = deleteFocusReturnRef.current;
      if (focusTarget?.isConnected) focusTarget.focus();
      else if (focusTarget) addCategoryButtonRef.current?.focus();
      deleteFocusReturnRef.current = null;
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDeleteCancel();
      if (e.key === 'Tab' && deleteModalRef.current) {
        const focusable = Array.from(
          deleteModalRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) {
          e.preventDefault();
          deleteModalRef.current.focus();
        } else if (document.activeElement === deleteModalRef.current) {
          e.preventDefault();
          (e.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
        } else if (e.shiftKey && document.activeElement === focusable[0]) {
          e.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          e.preventDefault();
          focusable[0].focus();
        }
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (deleteModalRef.current && !deleteModalRef.current.contains(e.target as Node)) {
        handleDeleteCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    deleteModalRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [deleteConfirmId, handleDeleteCancel]);

  // Filter categories by type and search query
  const filteredCategories = categories.filter((cat) => {
    if (filterType !== 'all' && cat.type !== filterType) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      return cat.name.toLowerCase().includes(query);
    }
    return true;
  });

  const categoryToDelete = categories.find((c) => c.id === deleteConfirmId);
  const customCount = categories.filter((c) => !c.isSystem).length;
  const systemCount = categories.filter((c) => c.isSystem).length;
  const hasActiveFilters = searchQuery.trim().length > 0 || filterType !== 'all';

  return (
    <div className="transactions-section categories-page">
      {/* Header */}
      <div className="section-header categories-page-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Categories</h2>
          <span className="section-subtitle">
            Organize income, expenses, and transfers · {categories.length} total
            <span className="categories-header-counts">{systemCount} defaults · {customCount} custom</span>
          </span>
        </div>

        <div className="categories-header-actions">
          <button
            ref={editCategoriesButtonRef}
            className="btn-secondary category-edit-action"
            onClick={handleOpenCategoryPicker}
            aria-label="Edit Categories"
            aria-haspopup="dialog"
            aria-expanded={isCategoryPickerOpen}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
            </svg>
            <span>Edit Categories</span>
          </button>
          <button
            ref={addCategoryButtonRef}
            className="btn-primary category-add-action"
            onClick={handleOpenAdd}
            id="add-category-btn"
            aria-label="Add New Category"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add Category</span>
          </button>
        </div>
      </div>

      {/* Global Error Alert */}
      {error && (
        <div className="categories-page-error" role="alert">
          <span>⚠️ {error}</span>
          <div className="categories-error-actions">
            {onRetry && (
              <button
                className="btn-secondary"
                onClick={onRetry}
              >
                Retry
              </button>
            )}
            {onClearError && (
              <button
                className="categories-error-dismiss"
                onClick={onClearError}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="section-controls categories-toolbar">
        <div className="search-box categories-search-box">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search categories..."
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search categories by name"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="search-clear"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-pills" role="group" aria-label="Filter categories by type">
          <button
            className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
            aria-pressed={filterType === 'all'}
            onClick={() => setFilterType('all')}
          >
            All ({categories.length})
          </button>
          <button
            className={`filter-pill ${filterType === 'expense' ? 'active' : ''}`}
            aria-pressed={filterType === 'expense'}
            onClick={() => setFilterType('expense')}
          >
            Expenses ({categories.filter((c) => c.type === 'expense').length})
          </button>
          <button
            className={`filter-pill ${filterType === 'income' ? 'active' : ''}`}
            aria-pressed={filterType === 'income'}
            onClick={() => setFilterType('income')}
          >
            Income ({categories.filter((c) => c.type === 'income').length})
          </button>
          <button
            className={`filter-pill ${filterType === 'transfer' ? 'active' : ''}`}
            aria-pressed={filterType === 'transfer'}
            onClick={() => setFilterType('transfer')}
          >
            Transfers ({categories.filter((c) => c.type === 'transfer').length})
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && categories.length === 0 ? (
        <div className="categories-loading-state" role="status" aria-live="polite">
          <span className="categories-loading-spinner" aria-hidden="true" />
          <span>Loading your categories…</span>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="categories-empty-state">
          <span className="categories-empty-icon" aria-hidden="true">
            {hasActiveFilters ? '⌕' : '◇'}
          </span>
          <h3>
            {hasActiveFilters ? 'No matching categories' : 'No categories yet'}
          </h3>
          <p>
            {hasActiveFilters
              ? 'No categories match the current search or type filter. Clear the filters to see all categories.'
              : 'Add a custom category to organize your income, expenses, and transfers.'}
          </p>
          {hasActiveFilters ? (
            <button className="btn-secondary" onClick={handleClearFilters}>
              Clear filters
            </button>
          ) : (
            <button className="btn-primary" onClick={handleOpenAdd}>
              Create category
            </button>
          )}
        </div>
      ) : (
        <div className="category-card-grid">
          {filteredCategories.map((category) => {
            return (
              <article key={category.id} className="category-card">
                <div className="category-card-content">
                  <span
                    className="category-card-icon"
                    style={{
                      color: category.color || 'var(--primary)',
                      backgroundColor: category.color ? `${category.color}20` : 'var(--primary-light)',
                      borderColor: category.color || 'var(--border-subtle)',
                    }}
                    aria-hidden="true"
                  >
                    {category.icon || '🏷️'}
                  </span>

                  <div className="category-card-details">
                    <div className="category-card-title-row">
                      <h3 className="category-card-name" title={category.name}>{category.name}</h3>
                      {category.isSystem && (
                        <span className="category-system-badge" title="System default category">
                          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
                            <path d="m9 12 2 2 4-4" />
                          </svg>
                          Default
                        </span>
                      )}
                    </div>
                    <span className={`category-type-badge ${category.type}`}>
                      {category.type === 'expense' ? 'Expense' : category.type === 'income' ? 'Income' : 'Transfer'}
                    </span>
                  </div>
                </div>

                {category.isSystem && (
                  <span
                    className="category-protected-indicator"
                    title="System default category (protected)"
                    aria-label="System category; editing and deletion are protected"
                  >
                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Category Modal */}
      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onSaveCategory}
        existingCategory={editingCategory}
      />

      {isCategoryPickerOpen && (
        <div className="modal-overlay">
          <div
            ref={categoryPickerRef}
            className="modal-container category-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-picker-title"
            aria-describedby="category-picker-description"
            tabIndex={-1}
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title" id="category-picker-title">Edit Categories</h2>
                <p className="modal-subtitle" id="category-picker-description">
                  Choose a custom category to edit. Default categories are protected by the current API.
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setIsCategoryPickerOpen(false)} aria-label="Close category selection">
                ✕
              </button>
            </div>
            <div className="category-picker-list" role="list" aria-label="All categories">
              {categories.map((category) => (
                <div className={`category-picker-row ${category.isSystem ? 'protected' : ''}`} key={category.id} role="listitem">
                  <button
                    type="button"
                    className="category-picker-select"
                    onClick={() => handleOpenEdit(category)}
                    disabled={category.isSystem}
                    aria-label={category.isSystem ? `${category.name}, ${category.type}, system category; editing unavailable` : `Edit ${category.name}, ${category.type}`}
                    title={category.isSystem ? 'System categories cannot be modified by the current API' : `Edit ${category.name}`}
                  >
                    <span
                      className="category-picker-icon"
                      style={{ color: category.color || 'var(--primary)', backgroundColor: category.color ? `${category.color}20` : 'var(--primary-light)' }}
                      aria-hidden="true"
                    >{category.icon || '🏷️'}</span>
                    <span className="category-picker-details">
                      <span className="category-picker-name">{category.name}</span>
                      <span className={`category-type-badge ${category.type}`}>
                        {category.type === 'expense' ? 'Expense' : category.type === 'income' ? 'Income' : 'Transfer'}
                      </span>
                    </span>
                    {category.isSystem ? <span className="category-picker-system">Default · protected</span> : <span className="category-picker-edit-hint">Edit</span>}
                  </button>
                  {!category.isSystem && (
                    <button
                      type="button"
                      className="category-picker-delete"
                      onClick={(event) => handleDeleteRequest(category, event)}
                      aria-label={`Delete ${category.name}`}
                      title={`Delete ${category.name}`}
                    >
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {categories.length === 0 && <p className="category-picker-empty">No categories available.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && categoryToDelete && (
        <div className="modal-overlay">
          <div
            ref={deleteModalRef}
            className="modal-container category-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-cat-title"
            tabIndex={-1}
          >
            <div className="modal-header">
              <div>
                <h2 className="modal-title" id="delete-cat-title">Delete Category</h2>
                <p className="modal-subtitle">This action cannot be undone</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={handleDeleteCancel}
                aria-label="Cancel deletion"
                disabled={isDeleting}
              >
                ✕
              </button>
            </div>

            {deleteError && (
              <div className="modal-error-alert" role="alert">
                ⚠️ {deleteError}
              </div>
            )}

            <div className="category-delete-body">
              <span className="category-delete-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
                </svg>
              </span>
              <div className="category-delete-copy">
                <p className="category-delete-question">
                  Are you sure you want to delete category <strong>"{categoryToDelete.name}"</strong>?
                </p>
                <p className="category-delete-note">
                  Categories used by transactions or budgets cannot be deleted, preserving your financial history.
                </p>
              </div>
            </div>

            <div className="modal-actions category-delete-actions">
              <button
                className="btn-secondary"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
