import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';
import type { AccessLevel } from '../../internal/access-controller';

/* ------------------------------------------------------------------ */
/*  TreeSelect — Hierarchical dropdown selection                       */
/* ------------------------------------------------------------------ */

export interface TreeSelectNode {
  value: string;
  label: React.ReactNode;
  children?: TreeSelectNode[];
  disabled?: boolean;
  selectable?: boolean;
  icon?: React.ReactNode;
}

export type TreeSelectSize = 'sm' | 'md' | 'lg';

export interface TreeSelectProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  /** Tree data source. */
  data: TreeSelectNode[];
  /** Selected value(s). */
  value?: string | string[];
  /** Default value (uncontrolled). */
  defaultValue?: string | string[];
  /** Change handler. */
  onChange?: (value: string | string[], node: TreeSelectNode | TreeSelectNode[]) => void;
  /** Allow multiple selection. @default false */
  multiple?: boolean;
  /** Show search input. @default false */
  searchable?: boolean;
  /** Placeholder text. @default 'Select...' */
  placeholder?: string;
  /** Show checkboxes. @default false */
  treeCheckable?: boolean;
  /** Expand all nodes by default. @default false */
  treeDefaultExpandAll?: boolean;
  /** Max visible selected tags (multiple mode). @default 3 */
  maxTagCount?: number;
  /** Size preset. @default 'md' */
  size?: TreeSelectSize;
  /** Loading state. @default false */
  loading?: boolean;
  /** Disabled state. @default false */
  disabled?: boolean;
  /** Access level. */
  access?: AccessLevel;
  /** Allow clearing selection. @default true */
  allowClear?: boolean;
}

/* ---- Icons ---- */

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ---- Helpers ---- */

function flattenNodes(nodes: TreeSelectNode[]): TreeSelectNode[] {
  const result: TreeSelectNode[] = [];
  const walk = (list: TreeSelectNode[]) => {
    for (const node of list) {
      result.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function findNode(nodes: TreeSelectNode[], value: string): TreeSelectNode | undefined {
  for (const node of nodes) {
    if (node.value === value) return node;
    if (node.children) {
      const found = findNode(node.children, value);
      if (found) return found;
    }
  }
  return undefined;
}

function filterNodes(nodes: TreeSelectNode[], query: string): TreeSelectNode[] {
  const q = query.toLowerCase();
  return nodes.reduce<TreeSelectNode[]>((acc, node) => {
    const labelText = typeof node.label === 'string' ? node.label : String(node.label);
    const childrenMatch = node.children ? filterNodes(node.children, query) : [];
    if (labelText.toLowerCase().includes(q) || childrenMatch.length > 0) {
      acc.push({ ...node, children: childrenMatch.length > 0 ? childrenMatch : node.children });
    }
    return acc;
  }, []);
}

/* ---- Size maps ---- */

const sizeMap: Record<TreeSelectSize, { trigger: string; text: string; tag: string }> = {
  sm: { trigger: 'min-h-8 text-xs', text: 'text-xs', tag: 'text-[10px] px-1.5 py-0.5' },
  md: { trigger: 'min-h-9 text-sm', text: 'text-sm', tag: 'text-xs px-2 py-0.5' },
  lg: { trigger: 'min-h-10 text-sm', text: 'text-sm', tag: 'text-xs px-2 py-1' },
};

/* ---- Tree Node Renderer ---- */

const TreeNode: React.FC<{
  node: TreeSelectNode;
  depth: number;
  selectedValues: Set<string>;
  expandedValues: Set<string>;
  onToggleExpand: (v: string) => void;
  onSelect: (node: TreeSelectNode) => void;
  treeCheckable: boolean;
}> = ({ node, depth, selectedValues, expandedValues, onToggleExpand, onSelect, treeCheckable }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedValues.has(node.value);
  const isSelected = selectedValues.has(node.value);
  const isDisabled = node.disabled ?? false;
  const isSelectable = node.selectable !== false;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
          isSelected
            ? 'bg-action-primary/10 text-action-primary font-medium'
            : 'text-text-primary hover:bg-surface-muted',
          isDisabled && 'pointer-events-none opacity-40',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggleExpand(node.value);
          if (isSelectable && !isDisabled) onSelect(node);
        }}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-disabled={isDisabled}
      >
        {hasChildren ? (
          <span
            className="shrink-0 text-text-secondary cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onToggleExpand(node.value);
              }
            }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {treeCheckable && (
          <span
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              isSelected
                ? 'border-action-primary bg-action-primary'
                : 'border-border-default bg-surface-default',
            )}
          >
            {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
          </span>
        )}
        {node.icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{node.icon}</span>}
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        {!treeCheckable && isSelected && (
          <CheckIcon className="h-4 w-4 shrink-0 text-action-primary" />
        )}
      </div>
      {hasChildren &&
        isExpanded &&
        node.children!.map((child) => (
          <TreeNode
            key={child.value}
            node={child}
            depth={depth + 1}
            selectedValues={selectedValues}
            expandedValues={expandedValues}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            treeCheckable={treeCheckable}
          />
        ))}
    </div>
  );
};

/* ---- Main Component ---- */

/**
 * Hierarchical dropdown selection with tree structure.
 * Supports multiple selection, search, checkboxes, and keyboard navigation.
 *
 * @example
 * ```tsx
 * <TreeSelect
 *   data={[{ value: 'eng', label: 'Engineering', children: [
 *     { value: 'fe', label: 'Frontend' },
 *     { value: 'be', label: 'Backend' },
 *   ]}]}
 *   placeholder="Select department"
 *   searchable
 *   multiple
 * />
 * ```
 *
 * @since 1.1.0
 */
export const TreeSelect = forwardRef<HTMLDivElement, TreeSelectProps>(function TreeSelect(
  {
    data,
    value: controlledValue,
    defaultValue,
    onChange,
    multiple = false,
    searchable = false,
    placeholder = 'Select...',
    treeCheckable = false,
    treeDefaultExpandAll = false,
    maxTagCount = 3,
    size = 'md',
    loading: _loading = false,
    disabled = false,
    allowClear = true,
    className,
    ...rest
  },
  ref,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Selection state
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState<string[]>(() => {
    const dv = defaultValue;
    if (!dv) return [];
    return Array.isArray(dv) ? dv : [dv];
  });
  const selectedValues = useMemo(() => {
    const cv = controlledValue;
    if (cv !== undefined) return new Set(Array.isArray(cv) ? cv : [cv]);
    return new Set(internalValue);
  }, [controlledValue, internalValue]);

  // Expansion state
  const [expandedValues, setExpandedValues] = useState<Set<string>>(() => {
    if (!treeDefaultExpandAll) return new Set();
    const all = flattenNodes(data)
      .filter((n) => n.children?.length)
      .map((n) => n.value);
    return new Set(all);
  });

  const onToggleExpand = useCallback((value: string) => {
    setExpandedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const onSelect = useCallback(
    (node: TreeSelectNode) => {
      const newValues = (() => {
        if (multiple || treeCheckable) {
          const current = new Set(selectedValues);
          if (current.has(node.value)) current.delete(node.value);
          else current.add(node.value);
          return Array.from(current);
        }
        return [node.value];
      })();

      if (!isControlled) setInternalValue(newValues);

      if (multiple || treeCheckable) {
        const nodes = newValues.map((v) => findNode(data, v)).filter(Boolean) as TreeSelectNode[];
        onChange?.(newValues, nodes);
      } else {
        onChange?.(newValues[0], node);
        setIsOpen(false);
      }
    },
    [selectedValues, multiple, treeCheckable, isControlled, onChange, data],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isControlled) setInternalValue([]);
      onChange?.(multiple ? [] : '', multiple ? [] : (undefined as unknown as TreeSelectNode));
    },
    [isControlled, onChange, multiple],
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const filteredData = searchQuery ? filterNodes(data, searchQuery) : data;
  const styles = sizeMap[size];
  const selectedNodes = useMemo(
    () =>
      Array.from(selectedValues)
        .map((v) => findNode(data, v))
        .filter(Boolean) as TreeSelectNode[],
    [selectedValues, data],
  );

  return (
    <div
      ref={ref}
      {...stateAttrs({ component: 'tree-select' })}
      className={cn('relative w-full', className)}
      {...rest}
    >
      {/* Trigger */}
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={isOpen}
        aria-haspopup="tree"
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
          if (e.key === 'Escape' && isOpen) {
            e.preventDefault();
            setIsOpen(false);
          }
        }}
        className={cn(
          'flex w-full cursor-pointer items-center gap-1.5 rounded-lg border px-3 transition-colors',
          styles.trigger,
          isOpen ? 'border-action-primary ring-2 ring-action-primary/20' : 'border-border-default',
          'bg-surface-default hover:border-border-strong',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1">
          {selectedNodes.length === 0 && <span className="text-text-secondary">{placeholder}</span>}
          {multiple && selectedNodes.length > 0 ? (
            <>
              {selectedNodes.slice(0, maxTagCount).map((node) => (
                <span
                  key={node.value}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md bg-surface-muted font-medium',
                    styles.tag,
                  )}
                >
                  {node.label}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(node);
                    }}
                    className="hover:text-state-danger-text"
                    aria-label={`Remove ${node.label}`}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {selectedNodes.length > maxTagCount && (
                <span className={cn('rounded-md bg-surface-muted font-medium', styles.tag)}>
                  +{selectedNodes.length - maxTagCount}
                </span>
              )}
            </>
          ) : selectedNodes.length === 1 ? (
            <span className="truncate">{selectedNodes[0].label}</span>
          ) : null}
        </div>
        {allowClear && selectedNodes.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 text-text-secondary hover:text-text-primary"
            aria-label="Clear"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 shrink-0 text-text-secondary transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-border-subtle bg-surface-panel p-1 shadow-xl"
        >
          {searchable && (
            <div className="mb-1 px-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-md border border-border-subtle bg-surface-default px-2 py-1.5 text-sm outline-none focus:border-action-primary"
                autoFocus
              />
            </div>
          )}
          <div role="tree" aria-multiselectable={multiple || treeCheckable}>
            {filteredData.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-text-secondary">
                No results found
              </div>
            ) : (
              filteredData.map((node) => (
                <TreeNode
                  key={node.value}
                  node={node}
                  depth={0}
                  selectedValues={selectedValues}
                  expandedValues={expandedValues}
                  onToggleExpand={onToggleExpand}
                  onSelect={onSelect}
                  treeCheckable={treeCheckable}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

TreeSelect.displayName = 'TreeSelect';
