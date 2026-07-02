import React, { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InlineEditType = 'text' | 'number' | 'select';

export interface SelectOption {
  value: string;
  label: string;
}

/** Click-to-edit field supporting text, number, and select input types. */
export interface InlineEditProps extends AccessControlledProps {
  /** Current display value */
  value: string;
  /** Input type rendered in edit mode */
  type?: InlineEditType;
  /** Options list for select type */
  options?: SelectOption[];
  /** Placeholder text shown when value is empty */
  placeholder?: string;
  /** Validation function returning an error message or null if valid */
  validate?: (value: string) => string | null;
  /** Called with the new value when the user confirms the edit */
  onSave: (value: string) => void | Promise<void>;
  /** Formats the value for display mode (e.g., adding currency symbols) */
  formatDisplay?: (value: string) => string;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Pencil icon
// ---------------------------------------------------------------------------

function PencilIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-0 group-hover:opacity-60 transition-opacity"
    >
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Save / Cancel icons
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// InlineEdit component
// ---------------------------------------------------------------------------

/**
 * Click-to-edit field supporting text, number, and select input types.
 *
 * @example
 * ```tsx
 * <InlineEdit
 *   value={title}
 *   onSave={(newValue) => updateTitle(newValue)}
 *   placeholder="Click to edit"
 * />
 * ```
 */
export function InlineEdit({
  value,
  type = 'text',
  options = [],
  placeholder = 'Click to edit',
  validate,
  onSave,
  formatDisplay,
  access,
  accessReason,
  className,
}: InlineEditProps) {
  const { state, isHidden, isReadonly, isDisabled } = resolveAccessState(access);
  const canEdit = !isReadonly && !isDisabled;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-focus on edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const enterEdit = useCallback(() => {
    if (!canEdit) return;
    setDraft(value);
    setError(null);
    setEditing(true);
  }, [canEdit, value]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraft(value);
    setError(null);
  }, [value]);

  const saveEdit = useCallback(async () => {
    if (saving) return;
    // Validate
    if (validate) {
      const errMsg = validate(draft);
      if (errMsg) {
        setError(errMsg);
        return;
      }
    }
    // No change? Just close
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydetme hatası');
    } finally {
      setSaving(false);
    }
  }, [draft, value, validate, onSave, saving]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit],
  );

  if (isHidden) return null;

  // ----- Display mode -----
  if (!editing) {
    const displayText = formatDisplay ? formatDisplay(value) : value;
    return (
      <span
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.5 transition-colors',
          canEdit && 'cursor-pointer hover:bg-surface-muted',
          accessStyles(state),
          className,
        )}
        data-access-state={state}
        onDoubleClick={enterEdit}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        aria-label={canEdit ? `Edit: ${displayText}` : displayText}
        title={accessReason ?? (canEdit ? 'Double-click to edit' : undefined)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canEdit) enterEdit();
        }}
      >
        <span className={cn('text-sm', !value && 'text-text-secondary italic')}>
          {displayText || placeholder}
        </span>
        {canEdit && <PencilIcon />}
      </span>
    );
  }

  // ----- Edit mode -----
  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      <div className="inline-flex items-center gap-1">
        {type === 'select' ? (
          <select
            ref={inputRef as React.Ref<HTMLSelectElement>}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className={cn(
              'rounded-xs border bg-[var(--surface-primary)] px-2 py-1 text-sm text-text-primary outline-hidden transition-colors',
              error
                ? 'border-state-danger-border focus:ring-1 focus:ring-state-danger-border'
                : 'border-border-default focus:border-action-primary focus:ring-1 focus:ring-accent-soft',
            )}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            type={type === 'number' ? 'number' : 'text'}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={saving}
            placeholder={placeholder}
            className={cn(
              'rounded-xs border bg-[var(--surface-primary)] px-2 py-1 text-sm text-text-primary outline-hidden transition-colors',
              error
                ? 'border-state-danger-border focus:ring-1 focus:ring-state-danger-border'
                : 'border-border-default focus:border-action-primary focus:ring-1 focus:ring-accent-soft',
            )}
          />
        )}

        {/* Save button */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-xs p-1 text-state-success-text hover:bg-state-success-bg transition-colors disabled:opacity-50"
          onClick={saveEdit}
          disabled={saving}
          aria-label="Save"
        >
          {saving ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              className="animate-spin"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          ) : (
            <CheckIcon />
          )}
        </button>

        {/* Cancel button */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-xs p-1 text-state-danger-text hover:bg-state-danger-bg transition-colors disabled:opacity-50"
          onClick={cancelEdit}
          disabled={saving}
          aria-label="Cancel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Error message */}
      {error && <span className="text-xs text-state-danger-text px-1">{error}</span>}
    </div>
  );
}

InlineEdit.displayName = 'InlineEdit';
