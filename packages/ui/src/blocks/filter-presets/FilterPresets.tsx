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

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  isDefault?: boolean;
  isShared?: boolean;
}

export interface FilterPresetsLocaleText {
  savePlaceholder?: string;
  saveButton?: string;
  cancelButton?: string;
  deleteConfirm?: (name: string) => React.ReactNode;
  deleteButton?: string;
  addPresetButton?: string;
}

/** Toolbar for managing saved filter presets with save, delete, and default actions. */
export interface FilterPresetsProps extends AccessControlledProps {
  /** Available filter presets to display */
  presets: FilterPreset[];
  /** ID of the currently active preset, or null if none */
  activePresetId?: string | null;
  /** Called when a preset chip is clicked */
  onSelect: (preset: FilterPreset) => void;
  /** Called to save the current filters as a new preset */
  onSave?: (name: string, filters: Record<string, unknown>) => void;
  /** Called to delete a preset by its ID */
  onDelete?: (presetId: string) => void;
  /** Called to mark a preset as the default */
  onSetDefault?: (presetId: string) => void;
  /** Current active filter values used when saving a new preset */
  currentFilters?: Record<string, unknown>;
  /** Localized labels — Turkish defaults are used when omitted */
  localeText?: FilterPresetsLocaleText;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={filled ? 'var(--state-warning-text)' : 'none'}
      stroke={filled ? 'var(--state-warning-text)' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function TrashIcon() {
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
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Save popover
// ---------------------------------------------------------------------------

function SavePopover({
  onSave,
  onCancel,
  localeText,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
  localeText?: FilterPresetsLocaleText;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  }, [name, onSave]);

  return (
    <div className="absolute top-full left-0 z-20 mt-1 flex items-center gap-1.5 rounded-lg border border-border-default bg-[var(--surface-primary)] p-2 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={localeText?.savePlaceholder ?? 'Preset ad\u0131...'}
        className="rounded-xs border border-border-default bg-[var(--surface-primary)] px-2 py-1 text-xs text-text-primary outline-hidden focus:border-action-primary w-36"
      />
      <button
        type="button"
        className="rounded-xs bg-action-primary px-2 py-1 text-xs font-medium text-text-inverse hover:opacity-90 transition-colors"
        onClick={handleSubmit}
      >
        {localeText?.saveButton ?? 'Kaydet'}
      </button>
      <button
        type="button"
        className="rounded-xs px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
        onClick={onCancel}
      >
        {localeText?.cancelButton ?? '\u0130ptal'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

function DeleteConfirmation({
  presetName,
  onConfirm,
  onCancel,
  localeText,
}: {
  presetName: string;
  onConfirm: () => void;
  onCancel: () => void;
  localeText?: FilterPresetsLocaleText;
}) {
  return (
    <div className="absolute top-full right-0 z-20 mt-1 rounded-lg border border-border-default bg-[var(--surface-primary)] p-3 shadow-lg min-w-[200px]">
      <p className="text-xs text-text-primary mb-2">
        {localeText?.deleteConfirm?.(presetName) ?? (
          <>
            <strong>&quot;{presetName}&quot;</strong> silinsin mi?
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-xs bg-state-danger-text px-2 py-1 text-xs font-medium text-text-inverse hover:opacity-90 transition-colors"
          onClick={onConfirm}
        >
          {localeText?.deleteButton ?? 'Sil'}
        </button>
        <button
          type="button"
          className="rounded-xs px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
          onClick={onCancel}
        >
          {localeText?.cancelButton ?? 'Vazge\u00e7'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterPresets component
// ---------------------------------------------------------------------------

/**
 * Toolbar for managing saved filter presets with save, delete, and default actions.
 *
 * @example
 * ```tsx
 * <FilterPresets
 *   presets={[{ id: 'active', name: 'Active Only', filters: { status: 'active' } }]}
 *   activePresetId="active"
 *   onSelect={(preset) => applyFilters(preset.filters)}
 *   onSave={(name, filters) => savePreset(name, filters)}
 * />
 * ```
 */
export function FilterPresets({
  presets,
  activePresetId,
  onSelect,
  onSave,
  onDelete,
  onSetDefault,
  currentFilters = {},
  localeText,
  access,
  accessReason,
  className,
}: FilterPresetsProps) {
  const { state, isHidden, isDisabled } = resolveAccessState(access);
  const [showSave, setShowSave] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSave = useCallback(
    (name: string) => {
      onSave?.(name, currentFilters);
      setShowSave(false);
    },
    [onSave, currentFilters],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete?.(id);
      setDeletingId(null);
    },
    [onDelete],
  );

  if (isHidden) return null;

  return (
    <div
      ref={containerRef}
      className={cn('relative flex flex-wrap items-center gap-1.5', accessStyles(state), className)}
      role="toolbar"
      aria-label="Filter presets"
      data-access-state={state}
      title={accessReason}
    >
      {presets.map((preset) => {
        const isActive = preset.id === activePresetId;
        return (
          <div key={preset.id} className="group relative flex items-center">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'border-action-primary bg-state-info-bg text-action-primary'
                  : 'border-border-default bg-[var(--surface-primary)] text-text-primary hover:bg-surface-muted',
              )}
              disabled={isDisabled}
              onClick={() => onSelect(preset)}
            >
              {preset.isDefault && <StarIcon filled />}
              {preset.isShared && <LockIcon />}
              {preset.name}
            </button>

            {/* Delete button on hover */}
            {onDelete && !preset.isShared && (
              <button
                type="button"
                className="invisible group-hover:visible ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-text-secondary hover:text-state-danger-text hover:bg-state-danger-bg transition-colors"
                disabled={isDisabled}
                aria-label={`Delete preset ${preset.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingId(preset.id);
                }}
              >
                <TrashIcon />
              </button>
            )}

            {/* Set default on hover */}
            {onSetDefault && !preset.isDefault && (
              <button
                type="button"
                className="invisible group-hover:visible ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-text-secondary hover:text-state-warning-text transition-colors"
                disabled={isDisabled}
                aria-label={`Set ${preset.name} as default`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDefault(preset.id);
                }}
              >
                <StarIcon filled={false} />
              </button>
            )}

            {/* Delete confirmation popover */}
            {deletingId === preset.id && (
              <DeleteConfirmation
                presetName={preset.name}
                onConfirm={() => handleDelete(preset.id)}
                onCancel={() => setDeletingId(null)}
                localeText={localeText}
              />
            )}
          </div>
        );
      })}

      {/* Save current button */}
      {onSave && (
        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-default px-3 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
            disabled={isDisabled}
            onClick={() => setShowSave(true)}
          >
            <PlusIcon />
            {localeText?.addPresetButton ?? 'Kaydet'}
          </button>
          {showSave && (
            <SavePopover
              onSave={handleSave}
              onCancel={() => setShowSave(false)}
              localeText={localeText}
            />
          )}
        </div>
      )}
    </div>
  );
}

FilterPresets.displayName = 'FilterPresets';
