import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CreatePersonInput, Person, UpdatePersonInput } from '../types';

interface PersonModalProps {
  person?: Person | null;
  onClose: () => void;
  onSave: (data: CreatePersonInput | UpdatePersonInput, personId?: string) => Promise<void>;
}

export function PersonModal({ person, onClose, onSave }: PersonModalProps) {
  const [name, setName] = useState(person?.name ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [note, setNote] = useState(person?.note ?? '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('input')?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], select:not([disabled])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const trimmedNote = note.trim();

    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Name must be 100 characters or fewer.');
      return;
    }
    if (trimmedPhone.length > 30) {
      setError('Phone must be 30 characters or fewer.');
      return;
    }
    if (trimmedEmail.length > 255) {
      setError('Email must be 255 characters or fewer.');
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (trimmedNote.length > 5000) {
      setError('Note must be 5,000 characters or fewer.');
      return;
    }

    try {
      setIsSaving(true);
      await onSave(
        {
          name: trimmedName,
          phone: trimmedPhone || null,
          email: trimmedEmail || null,
          note: trimmedNote || null,
        },
        person?.id
      );
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this person. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay person-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-container person-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-modal-title"
        aria-describedby="person-modal-description"
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="person-modal-title">{person ? 'Edit Person' : 'Add Person'}</h2>
            <p className="modal-subtitle" id="person-modal-description">
              {person ? 'Update this contact’s details.' : 'Add someone to use in your lending and borrowing records.'}
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} disabled={isSaving} aria-label="Close person dialog">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {error && <div className="modal-error-alert" role="alert">{error}</div>}

        <form className="modal-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="person-name">Name <span className="required-star">*</span></label>
            <input
              id="person-name"
              className="form-input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              disabled={isSaving}
            />
            <span className="form-help-text">{name.length}/100 characters</span>
          </div>
          <div className="person-modal-fields">
            <div className="form-group">
              <label className="form-label" htmlFor="person-phone">Phone <span className="optional-tag">(optional)</span></label>
              <input
                id="person-phone"
                className="form-input"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={30}
                disabled={isSaving}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="person-email">Email <span className="optional-tag">(optional)</span></label>
              <input
                id="person-email"
                className="form-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={255}
                disabled={isSaving}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="person-note">Note <span className="optional-tag">(optional)</span></label>
            <textarea
              id="person-note"
              className="form-input person-note-input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={5000}
              rows={4}
              disabled={isSaving}
            />
            <span className="form-help-text">Private details to help you identify this person.</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : person ? 'Save Changes' : 'Add Person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
