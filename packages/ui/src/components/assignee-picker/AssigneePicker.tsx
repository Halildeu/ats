import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import { AvatarGroup, type AvatarGroupItem } from '../avatar-group';
import { Badge } from '../../primitives/badge/Badge';
import { Text } from '../../primitives/text/Text';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import type { ApprovalActor } from '../../types/approval';

export type AssigneePickerSize = 'sm' | 'md' | 'lg';

interface AssigneePickerBaseProps extends AccessControlledProps {
  /** Pool of selectable actors. */
  candidates: ApprovalActor[];
  /** Placeholder for the search input. */
  placeholder?: string;
  /** Distinct search-mode placeholder (defaults to `placeholder`). */
  searchPlaceholder?: string;
  /** Message shown when nothing is selected. */
  emptyMessage?: string;
  /** Disable all interaction. */
  disabled?: boolean;
  /** Visual size variant. @default 'md' */
  size?: AssigneePickerSize;
  /** Max avatars visible in the avatar group cluster (multi mode). @default 3 */
  maxVisible?: number;
  /** Render role label next to actor name. @default true */
  showRole?: boolean;
  /**
   * Actor IDs filtered out of the candidate list. Use for 4-eyes governance
   * (e.g. exclude the proposer from the approver list). Excluded IDs are
   * hidden from suggestions; if a value happens to contain an excluded id
   * it is still rendered with a blocked indicator so consumers can detect
   * stale state instead of silently dropping data.
   */
  excludeIds?: string[];
  className?: string;
}

export interface AssigneePickerSingleProps extends AssigneePickerBaseProps {
  mode?: 'single';
  value: ApprovalActor | null;
  onChange: (next: ApprovalActor | null) => void;
}

export interface AssigneePickerMultiProps extends AssigneePickerBaseProps {
  mode: 'multi';
  value: ApprovalActor[];
  onChange: (next: ApprovalActor[]) => void;
}

export type AssigneePickerProps = AssigneePickerSingleProps | AssigneePickerMultiProps;

function actorToAvatarItem(actor: ApprovalActor): AvatarGroupItem {
  return {
    key: actor.id,
    src: actor.avatarUrl,
    name: actor.name,
  };
}

function matchesQuery(actor: ApprovalActor, query: string): boolean {
  if (!query) return true;
  const lower = query.toLowerCase();
  return (
    actor.name.toLowerCase().includes(lower) ||
    (actor.role ?? '').toLowerCase().includes(lower) ||
    (actor.email ?? '').toLowerCase().includes(lower)
  );
}

const inputSizeClass: Record<AssigneePickerSize, string> = {
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-10 px-3 text-sm',
  lg: 'h-12 px-4 text-base',
};

const inputBaseClass =
  'w-full rounded-lg border border-border-subtle bg-surface-canvas text-text-primary placeholder:text-text-secondary focus:outline-hidden focus:border-action-primary focus:ring-2 focus:ring-action-primary/30 disabled:opacity-60 disabled:cursor-not-allowed transition';

export const AssigneePicker = React.forwardRef<HTMLDivElement, AssigneePickerProps>(
  (props, ref) => {
    const {
      candidates,
      placeholder = 'Onaylayan ekle...',
      searchPlaceholder,
      emptyMessage,
      disabled = false,
      size = 'md',
      maxVisible = 3,
      showRole = true,
      excludeIds = [],
      className = '',
      access = 'full',
      accessReason,
    } = props;

    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const interactionBlocked = disabled || accessState.isDisabled || accessState.isReadonly;

    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const inputId = useId();
    const listboxId = useId();
    const listRef = useRef<HTMLUListElement>(null);

    const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
    const isMulti = props.mode === 'multi';

    const selectedIds = useMemo(() => {
      if (isMulti) {
        return new Set((props as AssigneePickerMultiProps).value.map((actor) => actor.id));
      }
      const single = (props as AssigneePickerSingleProps).value;
      return single ? new Set([single.id]) : new Set<string>();
    }, [isMulti, props]);

    const visibleCandidates = useMemo(() => {
      return candidates.filter(
        (actor) =>
          !excludeSet.has(actor.id) && !selectedIds.has(actor.id) && matchesQuery(actor, query),
      );
    }, [candidates, excludeSet, selectedIds, query]);

    const handleSelect = useCallback(
      (actor: ApprovalActor) => {
        if (interactionBlocked) return;
        if (isMulti) {
          const current = (props as AssigneePickerMultiProps).value;
          if (current.some((a) => a.id === actor.id)) return;
          (props as AssigneePickerMultiProps).onChange([...current, actor]);
        } else {
          (props as AssigneePickerSingleProps).onChange(actor);
        }
        setQuery('');
        setOpen(false);
      },
      [interactionBlocked, isMulti, props],
    );

    const handleRemove = useCallback(
      (id: string) => {
        if (interactionBlocked) return;
        if (isMulti) {
          const current = (props as AssigneePickerMultiProps).value;
          (props as AssigneePickerMultiProps).onChange(current.filter((a) => a.id !== id));
        } else {
          (props as AssigneePickerSingleProps).onChange(null);
        }
      },
      [interactionBlocked, isMulti, props],
    );

    const handleInputKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (!open) setOpen(true);
          const firstOption = listRef.current?.querySelector<HTMLLIElement>(
            '[role="option"]:not([data-blocked="true"])',
          );
          firstOption?.focus();
        } else if (event.key === 'Escape') {
          setOpen(false);
        } else if (event.key === 'Backspace' && !query && isMulti) {
          const current = (props as AssigneePickerMultiProps).value;
          if (current.length > 0) {
            (props as AssigneePickerMultiProps).onChange(current.slice(0, -1));
          }
        }
      },
      [isMulti, open, props, query],
    );

    const handleOptionKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLLIElement>, actor: ApprovalActor) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect(actor);
        } else if (event.key === 'Escape') {
          setOpen(false);
        }
      },
      [handleSelect],
    );

    // Render selected chips (multi) or selected actor (single)
    const renderSelection = () => {
      if (isMulti) {
        const value = (props as AssigneePickerMultiProps).value;
        if (value.length === 0) return null;
        const avatarItems = value.map(actorToAvatarItem);
        return (
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="Secilen onaylayanlar"
            data-slot="selection"
          >
            <AvatarGroup items={avatarItems} size={size} max={maxVisible} shape="circle" />
            <div className="flex flex-wrap gap-1.5">
              {value.map((actor) => {
                const blocked = excludeSet.has(actor.id);
                return (
                  <span
                    key={actor.id}
                    data-blocked={blocked ? 'true' : 'false'}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-default px-2.5 py-1 text-xs text-text-primary ${
                      blocked ? 'opacity-60' : ''
                    }`}
                  >
                    <span>{actor.name}</span>
                    {showRole && actor.role ? (
                      <Text as="span" variant="secondary" className="text-xs">
                        · {actor.role}
                      </Text>
                    ) : null}
                    {blocked ? (
                      <Badge variant="warning" size="sm">
                        Uygun degil
                      </Badge>
                    ) : null}
                    {!interactionBlocked && (
                      <button
                        type="button"
                        aria-label={`${actor.name} kaldir`}
                        onClick={() => handleRemove(actor.id)}
                        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-muted"
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      }
      const single = (props as AssigneePickerSingleProps).value;
      if (!single) return null;
      const blocked = excludeSet.has(single.id);
      return (
        <div
          className="flex items-center gap-2"
          aria-label="Secilen onaylayan"
          data-slot="selection"
        >
          <AvatarGroup
            items={[actorToAvatarItem(single)]}
            size={size}
            max={1}
            shape="circle"
            aria-label={single.name}
          />
          <Text className="font-medium">{single.name}</Text>
          {showRole && single.role ? (
            <Text variant="secondary" className="text-sm">
              · {single.role}
            </Text>
          ) : null}
          {blocked ? (
            <Badge variant="warning" size="sm">
              Uygun degil
            </Badge>
          ) : null}
          {!interactionBlocked && (
            <button
              type="button"
              aria-label={`${single.name} temizle`}
              onClick={() => handleRemove(single.id)}
              className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-muted"
            >
              ×
            </button>
          )}
        </div>
      );
    };

    return (
      <div
        ref={ref}
        className={`flex flex-col gap-2 ${className}`.trim()}
        data-component="assignee-picker"
        data-mode={isMulti ? 'multi' : 'single'}
        data-access-state={accessState.state}
        title={accessReason}
      >
        {renderSelection()}

        <div className="relative">
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            value={query}
            placeholder={searchPlaceholder ?? placeholder}
            disabled={interactionBlocked}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // delay close to allow option click
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={handleInputKeyDown}
            className={`${inputBaseClass} ${inputSizeClass[size]}`}
          />

          {open && visibleCandidates.length > 0 ? (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Aday onaylayanlar"
              className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-border-subtle bg-surface-default shadow-md focus:outline-hidden"
            >
              {visibleCandidates.map((actor) => (
                <li
                  key={actor.id}
                  role="option"
                  aria-selected={selectedIds.has(actor.id)}
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    // prevent input blur firing before click
                    event.preventDefault();
                  }}
                  onClick={() => handleSelect(actor)}
                  onKeyDown={(event) => handleOptionKeyDown(event, actor)}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted focus:bg-surface-muted focus:outline-hidden"
                >
                  <AvatarGroup
                    items={[actorToAvatarItem(actor)]}
                    size="sm"
                    max={1}
                    shape="circle"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-text-primary">{actor.name}</span>
                    {showRole && actor.role ? (
                      <Text variant="secondary" className="text-xs">
                        {actor.role}
                      </Text>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {open && query && visibleCandidates.length === 0 ? (
            <div
              className="absolute z-10 mt-1 w-full rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-secondary shadow-md"
              role="status"
            >
              {emptyMessage ?? 'Eslesen aday yok'}
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);

AssigneePicker.displayName = 'AssigneePicker';

export default AssigneePicker;
