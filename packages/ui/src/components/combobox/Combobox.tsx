import React from 'react';
import { createPortal } from 'react-dom';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import { stateAttrs } from '../../internal/interaction-core';
import { useOutsideClick } from '../../internal/overlay-engine';
import {
  FieldControlShell,
  buildDescribedBy,
  getFieldFrameClass,
  getFieldInputClass,
  getFieldSlotClass,
  getFieldTone,
  type FieldSize,
} from '../../primitives/_shared/FieldControlPrimitives';

export type ComboboxOption = {
  label: string;
  value: string;
  description?: string;
  keywords?: string[];
  disabled?: boolean;
  disabledReason?: string;
};

export type ComboboxOptionGroup = {
  label: string;
  options: ComboboxOption[];
  disabled?: boolean;
};

export type ComboboxResolvedOption = ComboboxOption & {
  groupLabel?: string;
  effectiveDisabled?: boolean;
  created?: boolean;
};

export type ComboboxSelectionMode = 'single' | 'multiple' | 'tags';
export type ComboboxDisabledItemFocusPolicy = 'skip' | 'allow';
export type ComboboxPopupSide = 'bottom' | 'top';
export type ComboboxPopupAlign = 'start' | 'end';
export type ComboboxPopupStrategy = 'inline' | 'portal';

export type ComboboxRenderOptionState = {
  highlighted: boolean;
  selected: boolean;
  disabled: boolean;
  query: string;
  index: number;
};

type FilteredComboboxGroup = {
  key: string;
  label?: string;
  options: ComboboxResolvedOption[];
};

const POPUP_MAX_HEIGHT = 288;

const isComboboxGroup = (option: ComboboxOption | ComboboxOptionGroup): option is ComboboxOptionGroup => 'options' in option;

const flattenOptions = (options: Array<ComboboxOption | ComboboxOptionGroup>): ComboboxResolvedOption[] =>
  options.flatMap((option) =>
    isComboboxGroup(option)
      ? option.options.map((groupOption) => ({
          ...groupOption,
          groupLabel: option.label,
          effectiveDisabled: option.disabled || groupOption.disabled,
        }))
      : [{ ...option, effectiveDisabled: option.disabled }],
  );

const matchesOption = (option: ComboboxOption, query: string) => {
  if (!query.trim()) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  const haystack = [option.label, option.description ?? '', ...(option.keywords ?? [])].join(' ').toLowerCase();
  return haystack.includes(normalized);
};

const buildFilteredGroups = (
  options: Array<ComboboxOption | ComboboxOptionGroup>,
  query: string,
): FilteredComboboxGroup[] =>
  options.flatMap((option) => {
    if (isComboboxGroup(option)) {
      const matchedOptions = option.options
        .filter((groupOption) => matchesOption(groupOption, query))
        .map((groupOption) => ({
          ...groupOption,
          groupLabel: option.label,
          effectiveDisabled: option.disabled || groupOption.disabled,
        }));

      return matchedOptions.length
        ? [
            {
              key: `group-${option.label}`,
              label: option.label,
              options: matchedOptions,
            },
          ]
        : [];
    }

    if (!matchesOption(option, query)) {
      return [];
    }

    return [
      {
        key: `option-${option.value}`,
        options: [{ ...option, effectiveDisabled: option.disabled }],
      },
    ];
  });

const findOptionByValue = (options: ComboboxResolvedOption[], value?: string | null) =>
  value ? options.find((option) => option.value === value) ?? null : null;

const buildCreatedOption = (value: string): ComboboxResolvedOption => ({
  label: value,
  value,
  created: true,
  effectiveDisabled: false,
});

const dedupeValues = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim())));

const resolveSelectedOptions = (
  options: ComboboxResolvedOption[],
  values: string[],
  allowFreeSolo: boolean,
) =>
  dedupeValues(values)
    .map((value) => findOptionByValue(options, value) ?? (allowFreeSolo ? buildCreatedOption(value) : null))
    .filter((option): option is ComboboxResolvedOption => Boolean(option));

const isOptionNavigable = (
  option: ComboboxResolvedOption | undefined,
  disabledItemFocusPolicy: ComboboxDisabledItemFocusPolicy,
) => Boolean(option) && (disabledItemFocusPolicy === 'allow' || !option?.effectiveDisabled);

const findNextNavigableIndex = (
  options: ComboboxResolvedOption[],
  startIndex: number,
  direction: 1 | -1,
  disabledItemFocusPolicy: ComboboxDisabledItemFocusPolicy,
) => {
  if (options.length === 0) {
    return -1;
  }

  let index = startIndex;
  for (let attempt = 0; attempt < options.length; attempt += 1) {
    index = (index + direction + options.length) % options.length;
    if (isOptionNavigable(options[index], disabledItemFocusPolicy)) {
      return index;
    }
  }

  return -1;
};

const findFirstNavigableIndex = (
  options: ComboboxResolvedOption[],
  disabledItemFocusPolicy: ComboboxDisabledItemFocusPolicy,
) => options.findIndex((option) => isOptionNavigable(option, disabledItemFocusPolicy));

const getInitialInputValue = ({
  defaultInputValue,
  defaultValue,
  defaultSelectedOption,
  allowFreeSolo,
  selectionMode,
}: {
  defaultInputValue?: string;
  defaultValue?: string | null;
  defaultSelectedOption: ComboboxResolvedOption | null;
  allowFreeSolo: boolean;
  selectionMode: ComboboxSelectionMode;
}) => {
  if (defaultInputValue !== undefined) {
    return defaultInputValue;
  }
  if (selectionMode !== 'single') {
    return '';
  }
  if (defaultSelectedOption?.label) {
    return defaultSelectedOption.label;
  }
  if (allowFreeSolo && defaultValue) {
    return defaultValue;
  }
  return '';
};

/** Props for the Combobox component.
 * @example
 * ```tsx
 * <Combobox />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/combobox)
 */
export interface ComboboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'defaultValue' | 'onChange' | 'children' | 'onSelect'>,
    AccessControlledProps {
  /** Field label displayed above the input. */
  label?: React.ReactNode;
  /** Descriptive text below the label. */
  description?: React.ReactNode;
  /** Help text displayed below the input. */
  hint?: React.ReactNode;
  /** Error message that activates the invalid state. */
  error?: React.ReactNode;
  /** Whether the input is in an invalid state. */
  invalid?: boolean;
  /** Size variant of the field control. */
  size?: FieldSize;
  /** Selection behavior: single value, multiple values, or free-form tags. */
  selectionMode?: ComboboxSelectionMode;
  /** Controlled selected value for single mode. */
  value?: string | null;
  /** Initial selected value for uncontrolled single mode. */
  defaultValue?: string | null;
  /** Controlled selected values for multiple/tag mode. */
  values?: string[];
  /** Initial selected values for uncontrolled multiple/tag mode. */
  defaultValues?: string[];
  /** Controlled text in the search input. */
  inputValue?: string;
  /** Initial search text for uncontrolled mode. */
  defaultInputValue?: string;
  /** Available options or option groups. */
  options: Array<ComboboxOption | ComboboxOptionGroup>;
  /** Whether freeform text can be committed as a value. */
  freeSolo?: boolean;
  onInputChange?: (inputValue: string, event?: React.ChangeEvent<HTMLInputElement>) => void;
  onQueryRequest?: (query: string) => void;
  queryDebounceMs?: number;
  onValueChange?: (value: string | null, option: ComboboxOption | null) => void;
  onValuesChange?: (values: string[], options: ComboboxResolvedOption[]) => void;
  onSelect?: (value: string, option: ComboboxOption) => void;
  onTagRemove?: (value: string, option: ComboboxResolvedOption | null) => void;
  onFreeSoloCommit?: (value: string) => void;
  onHighlightChange?: (value: string | null, option: ComboboxOption | null) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  loading?: boolean;
  loadingText?: React.ReactNode;
  noOptionsText?: React.ReactNode;
  clearable?: boolean;
  clearLabel?: string;
  emptyStateLabel?: React.ReactNode;
  showAccessReasonHint?: boolean;
  fullWidth?: boolean;
  renderOption?: (option: ComboboxResolvedOption, state: ComboboxRenderOptionState) => React.ReactNode;
  disabledItemFocusPolicy?: ComboboxDisabledItemFocusPolicy;
  popupStrategy?: ComboboxPopupStrategy;
  popupSide?: ComboboxPopupSide;
  popupAlign?: ComboboxPopupAlign;
  portalTarget?: HTMLElement | null;
  popupClassName?: string;
  listboxClassName?: string;
  flipOnCollision?: boolean;
  popupCollisionPadding?: number;
  tagRemoveLabel?: string;
}

/** Searchable selection input supporting single, multiple, and tag modes with grouped options. */
export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    id,
    label,
    description,
    hint,
    error,
    invalid = false,
    size = 'md',
    selectionMode = 'single',
    value,
    defaultValue = null,
    values,
    defaultValues,
    inputValue,
    defaultInputValue,
    options,
    freeSolo = false,
    onInputChange,
    onQueryRequest,
    queryDebounceMs = 250,
    onValueChange,
    onValuesChange,
    onSelect,
    onTagRemove,
    onFreeSoloCommit,
    onHighlightChange,
    open,
    defaultOpen = false,
    onOpenChange,
    onClose,
    loading = false,
    loadingText = 'Yukleniyor...',
    noOptionsText = 'Sonuc bulunamadi.',
    clearable = false,
    clearLabel = 'Secimi temizle',
    emptyStateLabel,
    showAccessReasonHint = true,
    renderOption,
    placeholder,
    disabled = false,
    className,
    fullWidth = true,
    required = false,
    disabledItemFocusPolicy = 'skip',
    popupStrategy = 'inline',
    popupSide = 'bottom',
    popupAlign = 'start',
    portalTarget,
    popupClassName,
    listboxClassName,
    flipOnCollision = true,
    popupCollisionPadding = 8,
    tagRemoveLabel = 'Etiketi kaldir',
    access = 'full',
    accessReason,
    onFocus,
    onBlur,
    onKeyDown,
    autoComplete = 'off',
    ...props
  },
  forwardedRef,
) {
  if (process.env.NODE_ENV !== 'production' && invalid !== undefined && invalid !== false) {
    console.warn(
      '[DesignSystem] "Combobox" prop "invalid" is deprecated. Use "error" instead. "invalid" will be removed in v3.0.0.',
    );
  }

  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  const allowFreeSolo = freeSolo || selectionMode === 'tags';
  const isMultiMode = selectionMode !== 'single';
  const generatedId = React.useId();
  const inputId = id ?? `combobox-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const hintId = !error && (hint || emptyStateLabel || accessReason) ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = buildDescribedBy(descriptionId, error ? errorId : hintId);
  const allOptions = React.useMemo(() => flattenOptions(options), [options]);
  const isValueControlled = value !== undefined;
  const isValuesControlled = values !== undefined;
  const isInputControlled = inputValue !== undefined;
  const initialSelectedOption = findOptionByValue(allOptions, defaultValue);
  const [internalValue, setInternalValue] = React.useState<string | null>(defaultValue);
  const [internalValues, setInternalValues] = React.useState<string[]>(() => dedupeValues(defaultValues ?? []));
  const [internalInputValue, setInternalInputValue] = React.useState(() =>
    getInitialInputValue({
      defaultInputValue,
      defaultValue,
      defaultSelectedOption: initialSelectedOption,
      allowFreeSolo,
      selectionMode,
    }),
  );
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const [portalStyle, setPortalStyle] = React.useState<React.CSSProperties | undefined>(undefined);
  const [resolvedPopupSide, setResolvedPopupSide] = React.useState<ComboboxPopupSide>(popupSide);
  const currentValue = !isMultiMode ? (isValueControlled ? value ?? null : internalValue) : null;
  const currentValues = React.useMemo(
    () => (isMultiMode ? dedupeValues(isValuesControlled ? values ?? [] : internalValues) : currentValue ? [currentValue] : []),
    [currentValue, internalValues, isMultiMode, isValuesControlled, values],
  );
  const selectedOptions = React.useMemo(
    () => resolveSelectedOptions(allOptions, currentValues, allowFreeSolo),
    [allOptions, allowFreeSolo, currentValues],
  );
  const selectedOption = !isMultiMode ? selectedOptions[0] ?? null : null;
  const currentInputValue = isInputControlled ? inputValue ?? '' : internalInputValue;
  const filteredGroups = React.useMemo(
    () => buildFilteredGroups(options, currentInputValue),
    [options, currentInputValue],
  );
  const filteredOptions = React.useMemo(
    () => filteredGroups.flatMap((group) => group.options),
    [filteredGroups],
  );
  const isOpenControlled = open !== undefined;
  const isOpen = isOpenControlled ? Boolean(open) : internalOpen;
  const isReadonly = accessState.isReadonly;
  const resolvedDisabled = disabled || accessState.isDisabled;
  const tone = getFieldTone({
    invalid: invalid || Boolean(error),
    disabled: resolvedDisabled,
    readonly: isReadonly,
  });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const hasQueryRequestMountedRef = React.useRef(false);

  const assignRef = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  };

  const setOpenState = React.useCallback(
    (nextOpen: boolean) => {
      const currentOpen = isOpenControlled ? Boolean(open) : internalOpen;
      if (!isOpenControlled) {
        setInternalOpen(nextOpen);
      }
      if (currentOpen !== nextOpen) {
        onOpenChange?.(nextOpen);
        if (!nextOpen) {
          onClose?.();
        }
      }
    },
    [internalOpen, isOpenControlled, onClose, onOpenChange, open],
  );

  const updateSelectedValue = React.useCallback(
    (nextValue: string | null, option: ComboboxOption | null) => {
      if (!isValueControlled) {
        setInternalValue(nextValue);
      }
      onValueChange?.(nextValue, option);
    },
    [isValueControlled, onValueChange],
  );

  const updateSelectedValues = React.useCallback(
    (nextValues: string[]) => {
      const normalizedValues = dedupeValues(nextValues);
      if (!isValuesControlled) {
        setInternalValues(normalizedValues);
      }
      onValuesChange?.(normalizedValues, resolveSelectedOptions(allOptions, normalizedValues, allowFreeSolo));
    },
    [allOptions, allowFreeSolo, isValuesControlled, onValuesChange],
  );

  const updateInput = React.useCallback(
    (nextInputValue: string, event?: React.ChangeEvent<HTMLInputElement>) => {
      if (!isInputControlled) {
        setInternalInputValue(nextInputValue);
      }
      onInputChange?.(nextInputValue, event);
    },
    [isInputControlled, onInputChange],
  );

  const notifyHighlightChange = React.useCallback(
    (index: number) => {
      const option = index >= 0 ? filteredOptions[index] ?? null : null;
      onHighlightChange?.(option?.value ?? null, option);
    },
    [filteredOptions, onHighlightChange],
  );

  React.useEffect(() => {
    if (isMultiMode || !isValueControlled || isInputControlled) {
      return;
    }
    setInternalInputValue(selectedOption?.label ?? (allowFreeSolo ? currentValue ?? '' : ''));
  }, [allowFreeSolo, currentValue, isInputControlled, isMultiMode, isValueControlled, selectedOption]);

  React.useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
      return;
    }

    const selectedIndex = filteredOptions.findIndex(
      (option) => currentValues.includes(option.value) && isOptionNavigable(option, disabledItemFocusPolicy),
    );
    const firstNavigableIndex = findFirstNavigableIndex(filteredOptions, disabledItemFocusPolicy);
    const nextIndex = selectedIndex >= 0 ? selectedIndex : firstNavigableIndex;

    setHighlightedIndex(nextIndex);
    notifyHighlightChange(nextIndex);
  }, [currentValues, disabledItemFocusPolicy, filteredOptions, isOpen, notifyHighlightChange]);

  /* ---- overlay-engine: outside click ---- */
  useOutsideClick({
    active: isOpen,
    onOutsideClick: () => setOpenState(false),
    excludeRefs: [rootRef, popupRef],
  });

  React.useEffect(() => {
    if (!onQueryRequest) {
      return undefined;
    }
    if (!hasQueryRequestMountedRef.current) {
      hasQueryRequestMountedRef.current = true;
      return undefined;
    }
    if (resolvedDisabled || isReadonly) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onQueryRequest(currentInputValue);
    }, Math.max(queryDebounceMs, 0));

    return () => window.clearTimeout(timeoutId);
  }, [currentInputValue, isReadonly, onQueryRequest, queryDebounceMs, resolvedDisabled]);

  const updatePopupPlacement = React.useCallback(() => {
    if (!rootRef.current) {
      return;
    }

    const rect = rootRef.current.getBoundingClientRect();
    const collisionPadding = Math.max(0, popupCollisionPadding);
    const estimatedPopupHeight = loading || filteredOptions.length === 0
      ? 80
      : Math.min(POPUP_MAX_HEIGHT, filteredOptions.length * 56 + filteredGroups.length * 28);
    const spaceBelow = window.innerHeight - rect.bottom - collisionPadding;
    const spaceAbove = rect.top - collisionPadding;

    let nextSide = popupSide;
    if (flipOnCollision) {
      if (popupSide === 'bottom' && spaceBelow < estimatedPopupHeight && spaceAbove > spaceBelow) {
        nextSide = 'top';
      }
      if (popupSide === 'top' && spaceAbove < estimatedPopupHeight && spaceBelow > spaceAbove) {
        nextSide = 'bottom';
      }
    }

    setResolvedPopupSide(nextSide);

    if (popupStrategy !== 'portal') {
      setPortalStyle(undefined);
      return;
    }

    const desiredLeft = popupAlign === 'end' ? rect.right - rect.width : rect.left;
    const safeLeft = Math.min(
      Math.max(collisionPadding, desiredLeft),
      Math.max(collisionPadding, window.innerWidth - rect.width - collisionPadding),
    );

    setPortalStyle({
      position: 'fixed',
      top: nextSide === 'top' ? Math.max(collisionPadding, rect.top - 8) : rect.bottom + 8,
      left: safeLeft,
      width: rect.width,
      zIndex: 60,
      transform: nextSide === 'top' ? 'translateY(-100%)' : undefined,
    });
  }, [
    filteredGroups.length,
    filteredOptions.length,
    flipOnCollision,
    loading,
    popupAlign,
    popupCollisionPadding,
    popupSide,
    popupStrategy,
  ]);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      setResolvedPopupSide(popupSide);
      return undefined;
    }

    updatePopupPlacement();
    window.addEventListener('resize', updatePopupPlacement);
    window.addEventListener('scroll', updatePopupPlacement, true);
    return () => {
      window.removeEventListener('resize', updatePopupPlacement);
      window.removeEventListener('scroll', updatePopupPlacement, true);
    };
  }, [isOpen, popupSide, updatePopupPlacement]);

  const resolvedHint =
    error
      ? undefined
      : hint ??
        (!currentValues.length && !currentInputValue ? emptyStateLabel : selectedOptions.length === 1 ? selectedOptions[0]?.description : undefined) ??
        (showAccessReasonHint && accessReason && (isReadonly || resolvedDisabled) ? accessReason : undefined);

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    setOpenState(true);
    onFocus?.(event);
  };

  const handleInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(event);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (resolvedDisabled || isReadonly) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const nextInputValue = event.target.value;
    updateInput(nextInputValue, event);
    if (!isMultiMode && selectedOption && nextInputValue !== selectedOption.label) {
      updateSelectedValue(null, null);
    }
    setOpenState(true);
  };

  const removeTag = React.useCallback(
    (valueToRemove: string) => {
      if (!isMultiMode || resolvedDisabled || isReadonly) {
        return;
      }

      const removedOption = selectedOptions.find((option) => option.value === valueToRemove) ?? null;
      updateSelectedValues(currentValues.filter((valueItem) => valueItem !== valueToRemove));
      onTagRemove?.(valueToRemove, removedOption);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [currentValues, isMultiMode, isReadonly, onTagRemove, resolvedDisabled, selectedOptions, updateSelectedValues],
  );

  const selectOption = React.useCallback(
    (option: ComboboxResolvedOption) => {
      if (option.effectiveDisabled || resolvedDisabled || isReadonly) {
        return;
      }

      if (isMultiMode) {
        if (currentValues.includes(option.value)) {
          updateInput('');
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
          return;
        }

        updateSelectedValues([...currentValues, option.value]);
        updateInput('');
        onSelect?.(option.value, option);
        setOpenState(true);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
        return;
      }

      updateSelectedValue(option.value, option);
      updateInput(option.label);
      onSelect?.(option.value, option);
      setOpenState(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [
      currentValues,
      isMultiMode,
      isReadonly,
      onSelect,
      resolvedDisabled,
      setOpenState,
      updateInput,
      updateSelectedValue,
      updateSelectedValues,
    ],
  );

  const commitFreeSoloValue = React.useCallback(() => {
    const nextValue = currentInputValue.trim();
    if (!allowFreeSolo || !nextValue || resolvedDisabled || isReadonly) {
      return;
    }

    if (isMultiMode) {
      if (currentValues.includes(nextValue)) {
        updateInput('');
        return;
      }

      updateSelectedValues([...currentValues, nextValue]);
      updateInput('');
      onFreeSoloCommit?.(nextValue);
      setOpenState(true);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return;
    }

    updateSelectedValue(nextValue, null);
    updateInput(nextValue);
    onFreeSoloCommit?.(nextValue);
    setOpenState(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [
    allowFreeSolo,
    currentInputValue,
    currentValues,
    isMultiMode,
    isReadonly,
    onFreeSoloCommit,
    resolvedDisabled,
    setOpenState,
    updateInput,
    updateSelectedValue,
    updateSelectedValues,
  ]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setOpenState(true);
        return;
      }
      const nextIndex = findNextNavigableIndex(
        filteredOptions,
        highlightedIndex < 0 ? -1 : highlightedIndex,
        1,
        disabledItemFocusPolicy,
      );
      setHighlightedIndex(nextIndex);
      notifyHighlightChange(nextIndex);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setOpenState(true);
        return;
      }
      const nextIndex = findNextNavigableIndex(
        filteredOptions,
        highlightedIndex < 0 ? 0 : highlightedIndex,
        -1,
        disabledItemFocusPolicy,
      );
      setHighlightedIndex(nextIndex);
      notifyHighlightChange(nextIndex);
    }

    if (event.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0) {
        event.preventDefault();
        const option = filteredOptions[highlightedIndex];
        if (option) {
          selectOption(option);
        }
      } else if (allowFreeSolo && currentInputValue.trim()) {
        event.preventDefault();
        commitFreeSoloValue();
      }
    }

    if (event.key === 'Backspace' && isMultiMode && !currentInputValue && currentValues.length > 0) {
      event.preventDefault();
      removeTag(currentValues[currentValues.length - 1] ?? '');
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setOpenState(false);
    }

    onKeyDown?.(event);
  };

  const handleClear = () => {
    if (resolvedDisabled || isReadonly) {
      return;
    }

    if (isMultiMode) {
      updateSelectedValues([]);
    } else {
      updateSelectedValue(null, null);
    }
    updateInput('');
    setOpenState(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const activeDescendantId =
    isOpen && highlightedIndex >= 0 ? `${listboxId}-option-${filteredOptions[highlightedIndex]?.value ?? highlightedIndex}` : undefined;

  const popupNode = isOpen ? (
    <div
      ref={popupRef}
      className={[
        popupStrategy === 'portal'
          ? 'overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted shadow-xl'
          : 'absolute z-30 w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted shadow-xl',
        popupClassName ?? '',
        popupStrategy === 'inline' && popupAlign === 'end' ? 'end-0' : '',
        popupStrategy === 'inline' && popupAlign === 'start' ? 'start-0' : '',
        popupStrategy === 'inline' && resolvedPopupSide === 'top' ? 'bottom-full mb-2 mt-0' : '',
        popupStrategy === 'inline' && resolvedPopupSide === 'bottom' ? 'start-0 mt-2' : '',
      ]
        .join(' ')
        .trim()}
      role="presentation"
      data-popup-strategy={popupStrategy}
      data-popup-side={resolvedPopupSide}
      data-popup-align={popupAlign}
      data-popup-flipped={resolvedPopupSide !== popupSide ? 'true' : 'false'}
      style={popupStrategy === 'portal' ? portalStyle : undefined}
    >
      <div
        id={listboxId}
        role="listbox"
        aria-multiselectable={isMultiMode || undefined}
        className={['max-h-72 overflow-y-auto p-2', listboxClassName ?? ''].join(' ').trim()}
      >
        {loading ? (
          <div className="rounded-xl px-3 py-2 text-sm text-text-secondary">{loadingText}</div>
        ) : filteredOptions.length === 0 ? (
          <div className="rounded-xl px-3 py-2 text-sm text-text-secondary">{noOptionsText}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredGroups.map((group) => (
              <section
                key={group.key}
                className="flex flex-col gap-1"
                role={group.label ? 'group' : undefined}
                aria-label={group.label}
              >
                {group.label ? (
                  <div className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                    {group.label}
                  </div>
                ) : null}
                <div className="flex flex-col gap-1">
                  {group.options.map((option) => {
                    const optionIndex = filteredOptions.findIndex((candidate) => candidate.value === option.value);
                    const isHighlighted = optionIndex === highlightedIndex;
                    const isSelected = currentValues.includes(option.value);
                    const optionState: ComboboxRenderOptionState = {
                      highlighted: isHighlighted,
                      selected: isSelected,
                      disabled: Boolean(option.effectiveDisabled),
                      query: currentInputValue,
                      index: optionIndex,
                    };

                    return (
                      <div
                        key={`${group.key}-${option.value}`}
                        id={`${listboxId}-option-${option.value}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.effectiveDisabled || undefined}
                        onMouseEnter={() => {
                          setHighlightedIndex(optionIndex);
                          notifyHighlightChange(optionIndex);
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectOption(option)}
                        className={`rounded-2xl border px-3 py-2 transition ${
                          isHighlighted
                            ? 'border-action-primary-border bg-action-primary-soft'
                            : 'border-transparent bg-surface-muted'
                        } ${option.effectiveDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-muted'}`}
                        title={option.effectiveDisabled ? option.disabledReason : undefined}
                      >
                        {renderOption ? (
                          renderOption(option, optionState)
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-text-primary">{option.label}</div>
                              {option.description ? (
                                <div className="mt-1 text-sm leading-6 text-text-secondary">{option.description}</div>
                              ) : option.effectiveDisabled && option.disabledReason ? (
                                <div className="mt-1 text-sm leading-6 text-text-secondary">{option.disabledReason}</div>
                              ) : null}
                            </div>
                            {isSelected ? (
                              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                                Secili
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const resolvedPortalTarget =
    popupStrategy === 'portal'
      ? (portalTarget ?? (typeof document !== 'undefined' ? document.body : null))
      : null;

  const hasSelection = isMultiMode ? currentValues.length > 0 : Boolean(currentValue);

  return (
    <FieldControlShell
      inputId={inputId}
      label={label}
      description={
        description ? (
          <span id={descriptionId}>
            {description}
          </span>
        ) : undefined
      }
      hint={
        !error && resolvedHint ? (
          <span id={hintId}>
            {resolvedHint}
          </span>
        ) : undefined
      }
      error={
        error ? (
          <span id={errorId}>
            {error}
          </span>
        ) : undefined
      }
      required={required}
      fullWidth={fullWidth}
    >
      <div ref={rootRef} className={fullWidth ? 'relative w-full' : 'relative'}>
        <div
          className={getFieldFrameClass(size, tone, fullWidth, className)}
          {...stateAttrs({
            component: "combobox",
            state: isOpen ? "open" : "closed",
            disabled: resolvedDisabled,
            loading,
            error: invalid || Boolean(error),
          })}
          data-access-state={accessState.state}
          data-field-tone={tone}
          data-size={size}
          data-field-type="combobox"
          title={accessReason}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {isMultiMode
              ? selectedOptions.map((option) => (
                  <span
                    key={`tag-${option.value}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary"
                    data-created-tag={option.created ? 'true' : 'false'}
                  >
                    <span className="truncate">{option.label}</span>
                    {!resolvedDisabled && !isReadonly ? (
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
                        aria-label={`${tagRemoveLabel}: ${option.label}`}
                        title={`${tagRemoveLabel}: ${option.label}`}
                        onClick={() => removeTag(option.value)}
                      >
                        &times;
                      </button>
                    ) : null}
                  </span>
                ))
              : null}
            <input
              {...props}
              ref={assignRef}
              id={inputId}
              type="text"
              value={currentInputValue}
              autoComplete={autoComplete}
              disabled={resolvedDisabled}
              readOnly={isReadonly}
              required={required}
              placeholder={placeholder}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={activeDescendantId}
              aria-invalid={invalid || Boolean(error) || undefined}
              aria-readonly={isReadonly || undefined}
              aria-disabled={resolvedDisabled || isReadonly || undefined}
              aria-describedby={describedBy}
              className={getFieldInputClass(size, isMultiMode ? 'min-w-[8ch]' : undefined)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
          </div>
          {clearable && (currentInputValue || hasSelection) && !resolvedDisabled && !isReadonly ? (
            <button
              type="button"
              onClick={handleClear}
              className={`${getFieldSlotClass(size)} transition hover:text-text-primary`}
              aria-label={clearLabel}
              title={clearLabel}
            >
              &times;
            </button>
          ) : null}
          <span aria-hidden="true" className={getFieldSlotClass(size)}>
            &#9662;
          </span>
        </div>

        {popupStrategy === 'portal' && resolvedPortalTarget && popupNode
          ? createPortal(popupNode, resolvedPortalTarget)
          : popupNode}
      </div>
    </FieldControlShell>
  );
});

Combobox.displayName = "Combobox";

export default Combobox;
