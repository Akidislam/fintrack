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

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  const handleOpenAdd = () => {
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    if (category.isSystem) return;
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleDeleteRequest = (category: Category) => {
    if (category.isSystem) return;
    setDeleteConfirmId(category.id);
    setDeleteError(null);
  };

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
    if (!deleteConfirmId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDeleteCancel();
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (deleteModalRef.current && !deleteModalRef.current.contains(e.target as Node)) {
        handleDeleteCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
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

  return (
    <div className="transactions-section">
      {/* Header */}
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Categories</h2>
          <span className="section-subtitle">
            {categories.length} total categories • {systemCount} system defaults • {customCount} custom
          </span>
        </div>

        <button
          className="btn-primary"
          onClick={handleOpenAdd}
          id="add-category-btn"
          aria-label="Add New Category"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add Category</span>
        </button>
      </div>

      {/* Global Error Alert */}
      {error && (
        <div
          className="modal-error-alert"
          style={{
            margin: '0 0 16px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
          role="alert"
        >
          <span>⚠️ {error}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onRetry && (
              <button
                className="btn-secondary"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={onRetry}
              >
                Retry
              </button>
            )}
            {onClearError && (
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  color: 'inherit',
                }}
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
      <div className="section-controls" style={{ marginBottom: '20px' }}>
        <div className="search-box">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search categories by name"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)' }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-pills" role="group" aria-label="Filter categories by type">
          <button
            className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All ({categories.length})
          </button>
          <button
            className={`filter-pill ${filterType === 'expense' ? 'active' : ''}`}
            onClick={() => setFilterType('expense')}
          >
            Expenses ({categories.filter((c) => c.type === 'expense').length})
          </button>
          <button
            className={`filter-pill ${filterType === 'income' ? 'active' : ''}`}
            onClick={() => setFilterType('income')}
          >
            Income ({categories.filter((c) => c.type === 'income').length})
          </button>
          <button
            className={`filter-pill ${filterType === 'transfer' ? 'active' : ''}`}
            onClick={() => setFilterType('transfer')}
          >
            Transfers ({categories.filter((c) => c.type === 'transfer').length})
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-subtle)' }}>
          <p>Loading categories from server...</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏷️</div>
          <h3 className="empty-title">
            {searchQuery ? 'No matching categories found' : 'No categories available'}
          </h3>
          <p className="empty-desc">
            {searchQuery
              ? `No categories match "${searchQuery}". Try a different search term or clear the filter.`
              : 'Add your first custom category to organize expenses and income.'}
          </p>
          {searchQuery ? (
            <button className="empty-action-btn" onClick={() => setSearchQuery('')}>
              Clear Search Filter
            </button>
          ) : (
            <button className="empty-action-btn" onClick={handleOpenAdd}>
              + Create Category
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredCategories.map((category) => {
            const isExpense = category.type === 'expense';
            const isIncome = category.type === 'income';

            return (
              <div
                key={category.id}
                style={{
                  backgroundColor: 'var(--bg-surface, #1e293b)',
                  border: '1px solid var(--border-subtle, #334155)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      backgroundColor: category.color ? `${category.color}22` : 'rgba(99, 102, 241, 0.12)',
                      border: `1.5px solid ${category.color || 'var(--primary, #6366f1)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      flexShrink: 0,
                    }}
                  >
                    <span>{category.icon || '🏷️'}</span>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '1rem',
                          fontWeight: 600,
                          color: 'var(--text-main, #f8fafc)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={category.name}
                      >
                        {category.name}
                      </h3>
                      {category.isSystem && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(148, 163, 184, 0.15)',
                            color: 'var(--text-subtle, #94a3b8)',
                            fontWeight: 500,
                            letterSpacing: '0.02em',
                          }}
                          title="System default category"
                        >
                          Default
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: '4px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          backgroundColor: isExpense
                            ? 'rgba(244, 63, 94, 0.12)'
                            : isIncome
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(59, 130, 246, 0.12)',
                          color: isExpense
                            ? '#f43f5e'
                            : isIncome
                            ? '#10b981'
                            : '#3b82f6',
                        }}
                      >
                        {category.type}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions for custom categories */}
                {!category.isSystem ? (
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      className="budget-action-btn"
                      onClick={() => handleOpenEdit(category)}
                      title={`Edit ${category.name}`}
                      aria-label={`Edit ${category.name}`}
                    >
                      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button
                      className="budget-action-btn delete"
                      onClick={() => handleDeleteRequest(category)}
                      title={`Delete ${category.name}`}
                      aria-label={`Delete ${category.name}`}
                    >
                      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-subtle, #94a3b8)',
                      opacity: 0.5,
                      padding: '4px',
                    }}
                    title="System default category (protected)"
                    aria-label="System default category"
                  >
                    🔒
                  </span>
                )}
              </div>
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && categoryToDelete && (
        <div className="modal-overlay">
          <div
            ref={deleteModalRef}
            className="modal-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-cat-title"
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

            <div className="acct-confirm-body" style={{ padding: '20px 24px', display: 'flex', gap: '16px' }}>
              <div style={{ fontSize: '2rem' }}>🗑️</div>
              <div>
                <p style={{ margin: '0 0 8px 0', fontSize: '1rem', color: 'var(--text-main, #f8fafc)' }}>
                  Are you sure you want to delete category <strong>"{categoryToDelete.name}"</strong>?
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-subtle, #94a3b8)', lineHeight: 1.5 }}>
                  💡 Categories with associated transactions or budgets cannot be deleted to maintain financial history integrity.
                </p>
              </div>
            </div>

            <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
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
