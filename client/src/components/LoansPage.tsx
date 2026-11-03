import type { LoanListItem } from '../types';

interface LoansPageProps {
  loans: LoanListItem[];
  isLoading: boolean;
  error: string | null;
  offset: number;
  pageSize: number;
  onRetry: () => void;
  onPageChange: (offset: number) => void;
}

function formatPrincipal(amount: string, currency: string): string {
  const [whole, fraction] = amount.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${groupedWhole}${fraction !== undefined ? `.${fraction}` : ''}`;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function LoansPage({
  loans,
  isLoading,
  error,
  offset,
  pageSize,
  onRetry,
  onPageChange,
}: LoansPageProps) {
  const currentPage = Math.floor(offset / pageSize) + 1;
  const canGoBack = offset > 0;
  const canGoForward = loans.length === pageSize;

  return (
    <section className="loans-page" aria-labelledby="loans-page-title">
      <div className="loans-page-intro">
        <div>
          <span className="loans-page-eyebrow">Loan portfolio</span>
          <h2 id="loans-page-title">Your lending and borrowing</h2>
          <p>Review the people, principal, status, and dates recorded for each loan.</p>
        </div>
      </div>

      <div className="loans-direction-guide" aria-label="Loan directions">
        <article className="loan-direction-card loan-direction-lent">
          <span className="loan-direction-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </span>
          <div>
            <h3>Money lent</h3>
            <p>Loans where you are the lender</p>
          </div>
        </article>
        <article className="loan-direction-card loan-direction-borrowed">
          <span className="loan-direction-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 7 17 17M17 7v10H7" />
            </svg>
          </span>
          <div>
            <h3>Money borrowed</h3>
            <p>Loans where you are the borrower</p>
          </div>
        </article>
      </div>

      <section className="loans-list-section" aria-labelledby="loan-list-heading">
        <div className="loans-list-heading">
          <div>
            <h2 id="loan-list-heading">All loans</h2>
            <p>Principal amounts and dates are shown as recorded.</p>
          </div>
        </div>

        {error && (
          <div className="loans-error-state" role="alert" aria-live="assertive">
            <div>
              <strong>Loans could not be loaded</strong>
              <p>{error}</p>
            </div>
            <button type="button" className="btn-secondary" onClick={onRetry}>Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="loans-loading-state" role="status" aria-live="polite">
            <span className="loans-loading-spinner" aria-hidden="true" />
            <span>Loading your loans…</span>
          </div>
        ) : error ? null : loans.length === 0 && offset === 0 ? (
          <div className="loans-empty-state">
            <span className="loans-empty-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18M7 15h3" />
              </svg>
            </span>
            <h3>No loans yet</h3>
            <p>Loans you create will appear here, with their person, direction, principal, status, and dates.</p>
          </div>
        ) : loans.length === 0 ? (
          <div className="loans-empty-state loans-empty-page">
            <h3>No more loans on this page</h3>
            <p>Return to the previous page to see the loans already loaded.</p>
          </div>
        ) : (
          <div className="loans-list" aria-label="Loan records">
            {loans.map((loan) => (
              <article
                className={`loan-row ${loan.type === 'lent' ? 'loan-row-lent' : 'loan-row-borrowed'}`}
                key={loan.id}
              >
                <span className="loan-row-icon" aria-hidden="true">
                  {loan.type === 'lent' ? '↗' : '↙'}
                </span>
                <div className="loan-row-person">
                  <h3>{loan.person.name}</h3>
                  <span>{loan.account?.name ?? 'Account unavailable'}</span>
                </div>
                <div className="loan-row-direction">
                  <span className={`loan-direction-badge ${loan.type}`}>
                    {loan.type === 'lent' ? 'You lent' : 'You borrowed'}
                  </span>
                </div>
                <div className="loan-row-principal">
                  <span className="loan-row-label">Principal</span>
                  <strong>{formatPrincipal(loan.amount, loan.currency)}</strong>
                </div>
                <div className="loan-row-status">
                  <span className="loan-row-label">Status</span>
                  <span className={`loan-status-badge status-${loan.status.toLowerCase()}`}>
                    {formatStatus(loan.status)}
                  </span>
                </div>
                <div className="loan-row-dates">
                  <span className="loan-row-label">Start · Due</span>
                  <span>{formatDate(loan.startDate)} · {formatDate(loan.dueDate)}</span>
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && !error && (canGoBack || canGoForward) && (
          <nav className="loans-pagination" aria-label="Loan list pagination">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onPageChange(Math.max(0, offset - pageSize))}
              disabled={!canGoBack}
            >
              Previous
            </button>
            <span aria-live="polite">Page {currentPage}</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onPageChange(offset + pageSize)}
              disabled={!canGoForward}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </section>
  );
}
