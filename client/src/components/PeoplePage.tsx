import { useState, type FormEvent } from 'react';
import type { CreatePersonInput, Person, UpdatePersonInput } from '../types';
import { PersonModal } from './PersonModal';

interface PeoplePageProps {
  people: Person[];
  isLoading: boolean;
  error: string | null;
  search: string;
  offset: number;
  pageSize: number;
  onSearch: (search: string) => void;
  onRetry: () => void;
  onPageChange: (offset: number) => void;
  onSave: (data: CreatePersonInput | UpdatePersonInput, personId?: string) => Promise<void>;
  onDelete: (person: Person) => Promise<void>;
}

export function PeoplePage({
  people,
  isLoading,
  error,
  search,
  offset,
  pageSize,
  onSearch,
  onRetry,
  onPageChange,
  onSave,
  onDelete,
}: PeoplePageProps) {
  const [searchDraft, setSearchDraft] = useState(search);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentPage = Math.floor(offset / pageSize) + 1;
  const canGoBack = offset > 0;
  const canGoForward = people.length === pageSize;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = searchDraft.trim();
    if (normalized !== search) onSearch(normalized);
  }

  async function handleSave(data: CreatePersonInput | UpdatePersonInput, personId?: string) {
    setActionError(null);
    await onSave(data, personId);
    if (!personId) setSearchDraft('');
    setIsAddingPerson(false);
    setEditingPerson(null);
  }

  async function handleDelete(person: Person) {
    const confirmed = window.confirm(`Delete ${person.name}? This person can’t be deleted if any loan records reference them.`);
    if (!confirmed) return;

    setActionError(null);
    try {
      await onDelete(person);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Could not delete this person. Please try again.');
    }
  }

  function openAddModal() {
    setActionError(null);
    setIsAddingPerson(true);
  }

  return (
    <section className="people-page" aria-labelledby="people-page-title">
      <div className="people-page-heading">
        <div>
          <span className="people-eyebrow">Loan contacts</span>
          <h2 id="people-page-title">People</h2>
          <p>Manage the people connected to your lending and borrowing records.</p>
        </div>
        <button type="button" className="btn-primary people-add-button" onClick={openAddModal}>
          <span aria-hidden="true">＋</span> Add Person
        </button>
      </div>

      <section className="people-list-section" aria-label="People list">
        <div className="people-toolbar">
          <form className="people-search-form" role="search" onSubmit={submitSearch}>
            <label className="people-search-field">
              <span className="people-search-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </span>
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search name, phone, or email"
                aria-label="Search people by name, phone, or email"
              />
            </label>
            <button type="submit" className="btn-secondary">Search</button>
            {search && (
              <button type="button" className="people-clear-search" onClick={() => { setSearchDraft(''); onSearch(''); }}>
                Clear
              </button>
            )}
          </form>
        </div>

        {actionError && (
          <div className="people-error-state" role="alert">
            <div>
              <strong>Action could not be completed</strong>
              <p>{actionError}</p>
            </div>
            <button type="button" className="people-error-dismiss" onClick={() => setActionError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        {error && (
          <div className="people-error-state" role="alert" aria-live="assertive">
            <div>
              <strong>People could not be loaded</strong>
              <p>{error}</p>
            </div>
            <button type="button" className="btn-secondary" onClick={onRetry}>Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="people-loading-state" role="status" aria-live="polite">
            <span className="people-loading-spinner" aria-hidden="true" />
            <span>Loading people…</span>
          </div>
        ) : error ? null : people.length === 0 ? (
          <div className="people-empty-state">
            <span className="people-empty-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="4" />
                <path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6m3-3h-6" />
              </svg>
            </span>
            <h3>{offset > 0 ? 'No more people on this page' : search ? 'No people found' : 'No people yet'}</h3>
            <p>
              {offset > 0
                ? 'Return to the previous page to see the people already loaded.'
                : search
                  ? 'Try another name, phone number, or email address.'
                  : 'Add a person to connect them with your lending and borrowing records.'}
            </p>
            {!search && offset === 0 && <button type="button" className="btn-primary" onClick={openAddModal}>Add Person</button>}
          </div>
        ) : (
          <div className="people-grid">
            {people.map((person) => (
              <article className="person-card" key={person.id}>
                <div className="person-card-main">
                  <span className="person-avatar" aria-hidden="true">
                    {person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || '?'}
                  </span>
                  <div className="person-card-identity">
                    <h3>{person.name}</h3>
                    <span>Person</span>
                  </div>
                  <div className="person-card-actions">
                    <button type="button" className="person-action-button" onClick={() => { setActionError(null); setEditingPerson(person); }} aria-label={`Edit ${person.name}`} title="Edit person">
                      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button type="button" className="person-action-button person-delete-button" onClick={() => void handleDelete(person)} aria-label={`Delete ${person.name}`} title="Delete person">
                      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="person-card-details">
                  {person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : <span className="person-detail-muted">No phone added</span>}
                  {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : <span className="person-detail-muted">No email added</span>}
                </div>
                {person.note && <p className="person-card-note">{person.note}</p>}
              </article>
            ))}
          </div>
        )}

        {!isLoading && !error && (canGoBack || canGoForward) && (
          <nav className="people-pagination" aria-label="People list pagination">
            <button type="button" className="btn-secondary" onClick={() => onPageChange(Math.max(0, offset - pageSize))} disabled={!canGoBack}>Previous</button>
            <span aria-live="polite">Page {currentPage}</span>
            <button type="button" className="btn-secondary" onClick={() => onPageChange(offset + pageSize)} disabled={!canGoForward}>Next</button>
          </nav>
        )}
      </section>

      {(isAddingPerson || editingPerson) && (
        <PersonModal
          key={editingPerson?.id ?? 'new-person'}
          person={editingPerson}
          onClose={() => { setIsAddingPerson(false); setEditingPerson(null); }}
          onSave={handleSave}
        />
      )}
    </section>
  );
}
