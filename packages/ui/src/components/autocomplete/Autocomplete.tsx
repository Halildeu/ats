import React from "react";
import { cn } from "../../utils/cn";
import {
  FieldControlShell,
  buildDescribedBy,
  getFieldFrameClass,
  getFieldInputClass,
  getFieldSlotClass,
  getFieldTone,
  type FieldSize,
} from "../../primitives/_shared/FieldControlPrimitives";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Autocomplete — Input with dropdown suggestions                     */
/*                                                                     */
/*  Fusion of Input + Combobox: type-ahead filtering, async search,   */
/*  keyboard navigation, ARIA combobox pattern.                        */
/* ------------------------------------------------------------------ */

export type AutocompleteOption = {
  value: string;
  label: string;
};

export interface AutocompleteProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "size" | "onChange" | "value" | "defaultValue" | "children"
  >,
    AccessControlledProps {
  /** Controlled input value. */
  value?: string;
  /** Initial value for uncontrolled mode. */
  defaultValue?: string;
  /** Callback fired when the value changes. */
  onChange?: (value: string) => void;
  /** Available suggestion options. */
  options: AutocompleteOption[];
  /** Async search handler — called on input change with debounce */
  onSearch?: (query: string) => void;
  /** Whether a loading spinner is shown in the dropdown. */
  loading?: boolean;
  /** Size variant of the field control. */
  size?: FieldSize;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Whether the input is in an invalid state. */
  invalid?: boolean;
  /** Error message that activates the invalid state. */
  error?: React.ReactNode;
  /** Field label displayed above the input. */
  label?: React.ReactNode;
  /** Descriptive text below the label. */
  description?: React.ReactNode;
  /** Help text displayed below the input. */
  hint?: React.ReactNode;
  /** Placeholder text shown when empty. */
  placeholder?: string;
  /** Additional CSS class name. */
  className?: string;
  /** Whether the input spans the full container width. */
  fullWidth?: boolean;
  /** If true, allows freeform text; if false, only options can be selected */
  allowCustomValue?: boolean;
  /** Max number of suggestions shown */
  maxSuggestions?: number;
}

const matchesQuery = (option: AutocompleteOption, query: string): boolean => {
  if (!query.trim()) return true;
  return option.label.toLowerCase().includes(query.trim().toLowerCase());
};

/** Input with dropdown suggestions supporting type-ahead filtering, async search, and keyboard navigation.
   * @example
   * ```tsx
   * <Autocomplete />
   * ```
   * @since 1.0.0
   * @see [Docs](https://design.mfe.dev/components/autocomplete)
   */
export const Autocomplete = React.forwardRef<HTMLInputElement, AutocompleteProps>(
  function Autocomplete(
    {
      id,
      value,
      defaultValue = "",
      onChange,
      options,
      onSearch,
      loading = false,
      size = "md",
      disabled = false,
      invalid = false,
      error,
      label,
      description,
      hint,
      placeholder,
      className,
      fullWidth = true,
      allowCustomValue = true,
      maxSuggestions = 10,
      onFocus,
      onBlur,
      onKeyDown,
      access,
      accessReason,
      ...props
    },
    forwardedRef,
  ) {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;
    const generatedId = React.useId();
    const inputId = id ?? `autocomplete-${generatedId}`;
    const listboxId = `${inputId}-listbox`;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = buildDescribedBy(
      descriptionId,
      error ? errorId : hintId,
    );

    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const currentValue = isControlled ? value : internalValue;

    const [isOpen, setIsOpen] = React.useState(false);
    const [highlightedIndex, setHighlightedIndex] = React.useState(-1);

    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const listboxRef = React.useRef<HTMLDivElement | null>(null);
    const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const assignRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const filteredOptions = React.useMemo(() => {
      const matched = onSearch
        ? options // when onSearch is provided, filtering is external
        : options.filter((opt) => matchesQuery(opt, currentValue));
      return matched.slice(0, maxSuggestions);
    }, [options, currentValue, maxSuggestions, onSearch]);

    const tone = getFieldTone({
      invalid: invalid || Boolean(error),
      disabled,
    });

    const updateValue = React.useCallback(
      (next: string) => {
        if (!isControlled) {
          setInternalValue(next);
        }
        onChange?.(next);
      },
      [isControlled, onChange],
    );

    // Outside click handler
    React.useEffect(() => {
      if (!isOpen) return undefined;

      const handleClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (
          rootRef.current &&
          !rootRef.current.contains(target)
        ) {
          setIsOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, [isOpen]);

    // Trigger onSearch with debounce
    React.useEffect(() => {
      if (!onSearch) return undefined;
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        onSearch(currentValue);
      }, 250);
      return () => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      };
    }, [currentValue, onSearch]);

    // Reset highlight when filtered options change
    React.useEffect(() => {
      setHighlightedIndex(-1);
    }, [filteredOptions.length]);

    const selectOption = React.useCallback(
      (option: AutocompleteOption) => {
        updateValue(option.value);
        setIsOpen(false);
        setHighlightedIndex(-1);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
      [updateValue],
    );

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      updateValue(event.target.value);
      setIsOpen(true);
    };

    const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsOpen(true);
      onFocus?.(event);
    };

    const handleInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      // If not allowCustomValue, revert to last valid option or clear
      if (!allowCustomValue) {
        const match = options.find(
          (opt) => opt.value === currentValue || opt.label === currentValue,
        );
        if (!match && currentValue) {
          updateValue("");
        }
      }
      onBlur?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        setHighlightedIndex((prev) => {
          const next = prev < filteredOptions.length - 1 ? prev + 1 : 0;
          return next;
        });
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        setHighlightedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : filteredOptions.length - 1;
          return next;
        });
      }

      if (event.key === "Enter" && isOpen && highlightedIndex >= 0) {
        event.preventDefault();
        const option = filteredOptions[highlightedIndex];
        if (option) {
          selectOption(option);
        }
      }

      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }

      onKeyDown?.(event);
    };

    const activeDescendantId =
      isOpen && highlightedIndex >= 0
        ? `${listboxId}-option-${highlightedIndex}`
        : undefined;

    const showDropdown = isOpen && (filteredOptions.length > 0 || loading);

    return (
      <div className={cn(accessState.isDisabled && "pointer-events-none opacity-50")} title={accessReason}>
      <FieldControlShell
        inputId={inputId}
        label={label}
        description={
          description ? (
            <span id={descriptionId}>{description}</span>
          ) : undefined
        }
        hint={
          !error && hint ? <span id={hintId}>{hint}</span> : undefined
        }
        error={
          error ? <span id={errorId}>{error}</span> : undefined
        }
        fullWidth={fullWidth}
        data-access-state={accessState.state}
      >
        <div ref={rootRef} className={cn(fullWidth ? "relative w-full" : "relative")}>
          <div
            className={cn(getFieldFrameClass(size, tone, fullWidth, className), "focus-within:ring-2 focus-within:ring-focus-outline")}
            data-field-tone={tone}
            data-size={size}
            data-field-type="autocomplete"
          >
            <input
              {...props}
              ref={assignRef}
              id={inputId}
              type="text"
              value={currentValue}
              disabled={disabled}
              placeholder={placeholder}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-controls={listboxId}
              aria-activedescendant={activeDescendantId}
              aria-invalid={invalid || Boolean(error) || undefined}
              aria-disabled={disabled || undefined}
              aria-describedby={describedBy}
              aria-label={!label && placeholder ? placeholder : typeof label === 'string' ? label : undefined}
              autoComplete="off"
              className={getFieldInputClass(size)}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
            />
            <span aria-hidden="true" className={getFieldSlotClass(size)}>
              &#9662;
            </span>
          </div>

          {showDropdown ? (
            <div
              ref={listboxRef}
              className="absolute start-0 z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted shadow-xl"
              role="presentation"
            >
              <div
                id={listboxId}
                role="listbox"
                className="max-h-72 overflow-y-auto p-2"
              >
                {loading ? (
                  <div className="rounded-xl px-3 py-2 text-sm text-text-secondary">
                    Loading...
                  </div>
                ) : (
                  filteredOptions.map((option, index) => {
                    const isHighlighted = index === highlightedIndex;
                    return (
                      <div
                        key={option.value}
                        id={`${listboxId}-option-${index}`}
                        role="option"
                        aria-selected={isHighlighted}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectOption(option)}
                        className={cn(
                          "cursor-pointer rounded-2xl border px-3 py-2 text-sm font-medium transition",
                          "text-text-primary",
                          isHighlighted
                            ? "border-action-primary-border bg-action-primary-soft"
                            : "border-transparent hover:bg-surface-muted",
                        )}
                      >
                        {option.label}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      </FieldControlShell>
      </div>
    );
  },
);

Autocomplete.displayName = "Autocomplete";
