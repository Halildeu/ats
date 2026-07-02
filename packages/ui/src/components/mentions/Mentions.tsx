import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MentionOption = {
  key: string;
  label: string;
  description?: string;
  avatar?: string;
  disabled?: boolean;
};

export interface MentionsProps extends AccessControlledProps {
  /** Current value (controlled). */
  value?: string;
  /** Default value for uncontrolled usage. */
  defaultValue?: string;
  /** Available mention options. */
  options: MentionOption[];
  /** Trigger character. @default "@" */
  trigger?: string;
  /** Placeholder text. @default "Bir sey yazin..." */
  placeholder?: string;
  /** Number of textarea rows. @default 3 */
  rows?: number;
  /** Called when value changes. */
  onValueChange?: (value: string) => void;
  /** Called when a mention option is selected. */
  onSelect?: (option: MentionOption) => void;
  /** Called when search text changes after trigger. */
  onSearch?: (text: string, trigger: string) => void;
  /** Custom filter function. */
  filterOption?: (input: string, option: MentionOption) => boolean;
  /** Label for the textarea. */
  label?: string;
  /** Error state. @default false */
  error?: boolean;
  /** Description text below the textarea. */
  description?: string;
  /** Size variant. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Additional class name for the root element. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------
   */

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "text-sm py-1.5 px-2.5",
  md: "text-sm py-2 px-3",
  lg: "text-base py-2.5 px-3.5",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ 
 * @example
 * ```tsx
 * <Mentions />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/mentions)
 */
export const Mentions = React.forwardRef<HTMLDivElement, MentionsProps>(function Mentions(
  {
    value,
    defaultValue = "",
    options,
    trigger = "@",
    placeholder = "Bir sey yazin...",
    rows = 3,
    onValueChange,
    onSelect,
    onSearch,
    filterOption,
    label,
    error = false,
    description,
    size = "md",
    className,
    access = "full",
    accessReason,
    ...rest
  },
  forwardedRef,
) {
  const accessState = resolveAccessState(access);
  const isInteractive = !accessState.isReadonly && !accessState.isDisabled;

  // Controlled vs uncontrolled
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = isControlled ? value : internalValue;

  // Dropdown state
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [mentionStartPos, setMentionStartPos] = React.useState(-1);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const dropdownRef = React.useRef<HTMLUListElement>(null);
  const labelId = React.useId();
  const descriptionId = React.useId();
  const listboxId = React.useId();

  /* ---- filter options ---- */
  const filteredOptions = React.useMemo(() => {
    if (!isOpen) return [];
    const search = searchText.toLowerCase();
    return options.filter((opt) => {
      if (filterOption) return filterOption(search, opt);
      return opt.label.toLowerCase().includes(search);
    });
  }, [isOpen, searchText, options, filterOption]);

  /* ---- reset activeIndex when filtered list changes ---- */
  React.useEffect(() => {
    setActiveIndex(0);
  }, [filteredOptions.length]);

  /* ---- update value ---- */
  const updateValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  /* ---- handle input change ---- */
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isInteractive) return;
      const newVal = e.target.value;
      updateValue(newVal);

      // Find trigger
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newVal.slice(0, cursorPos);
      const lastTriggerIdx = textBeforeCursor.lastIndexOf(trigger);

      if (lastTriggerIdx >= 0) {
        const charBefore = lastTriggerIdx > 0 ? textBeforeCursor[lastTriggerIdx - 1] : " ";
        const textAfterTrigger = textBeforeCursor.slice(lastTriggerIdx + trigger.length);
        // Only open if trigger is at start or after whitespace, and no whitespace in search
        if ((charBefore === " " || charBefore === "\n" || lastTriggerIdx === 0) && !/\s/.test(textAfterTrigger)) {
          setIsOpen(true);
          setSearchText(textAfterTrigger);
          setMentionStartPos(lastTriggerIdx);
          onSearch?.(textAfterTrigger, trigger);
          return;
        }
      }
      setIsOpen(false);
      setSearchText("");
    },
    [isInteractive, updateValue, trigger, onSearch],
  );

  /* ---- select mention ---- */
  const selectOption = React.useCallback(
    (option: MentionOption) => {
      if (option.disabled) return;
      const textarea = textareaRef.current;
      if (!textarea) return;

      const before = currentValue.slice(0, mentionStartPos);
      const after = currentValue.slice(textarea.selectionStart);
      const mention = `${trigger}${option.label} `;
      const newVal = before + mention + after;

      updateValue(newVal);
      setIsOpen(false);
      setSearchText("");
      onSelect?.(option);

      // Restore focus and cursor
      requestAnimationFrame(() => {
        textarea.focus();
        const cursorPos = before.length + mention.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [currentValue, mentionStartPos, trigger, updateValue, onSelect],
  );

  /* ---- keyboard ---- */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isOpen || filteredOptions.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => {
            let next = prev + 1;
            // Skip disabled options
            while (next < filteredOptions.length && filteredOptions[next].disabled) next++;
            return next < filteredOptions.length ? next : prev;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && filteredOptions[next].disabled) next--;
            return next >= 0 ? next : prev;
          });
          break;
        case "Enter":
          e.preventDefault();
          if (filteredOptions[activeIndex] && !filteredOptions[activeIndex].disabled) {
            selectOption(filteredOptions[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setSearchText("");
          break;
      }
    },
    [isOpen, filteredOptions, activeIndex, selectOption],
  );

  /* ---- hidden ---- */
  if (accessState.isHidden) return null;

  return (
    <div
      ref={forwardedRef}
      data-access-state={accessState.state}
      className={cn("relative w-full max-w-full", className)}
      title={accessReason}
      {...rest}
    >
      {/* Label */}
      {label && (
        <label
          id={labelId}
          className="mb-1 block text-sm font-medium text-text-primary"
        >
          {label}
        </label>
      )}

      {/* Combobox wrapper */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-owns={isOpen && filteredOptions.length > 0 ? listboxId : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : placeholder}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={currentValue}
          placeholder={placeholder}
          rows={rows}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay closing so click on dropdown option works
            setTimeout(() => setIsOpen(false), 200);
          }}
          disabled={accessState.isDisabled}
          readOnly={accessState.isReadonly}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={description ? descriptionId : undefined}
          aria-invalid={error || undefined}
          aria-autocomplete="list"
          className={cn(
            "w-full resize-y rounded-md border transition-colors duration-(--motion-duration-fast)",
            "bg-surface-default text-text-primary",
            "placeholder:text-[var(--text-disabled)]",
            "focus:outline-hidden focus:ring-2",
            SIZE_CLASSES[size],
            error
              ? "border-[var(--border-error)] focus:ring-[var(--ring-error)]"
              : "border-border-default focus:ring-[var(--ring-primary)]",
            accessState.isDisabled && "opacity-50 cursor-not-allowed bg-surface-muted",
            accessState.isReadonly && "cursor-default bg-surface-muted",
          )}
        />

        {/* Dropdown */}
        {isOpen && filteredOptions.length > 0 && (
          <ul
            ref={dropdownRef}
            id={listboxId}
            role="listbox"
            aria-label="Bahsetme onerileri"
            className={cn(
              "absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border",
              "bg-surface-default border-border-default",
              "shadow-lg",
            )}
          >
            {filteredOptions.map((option, idx) => (
              <li
                key={option.key}
                role="option"
                aria-selected={idx === activeIndex}
                aria-disabled={option.disabled || undefined}
                data-testid="mention-option"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                  "text-text-primary",
                  idx === activeIndex && "bg-[var(--surface-hover)]",
                  option.disabled && "opacity-50 cursor-not-allowed",
                )}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent textarea blur
                  if (!option.disabled) selectOption(option);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {option.avatar && (
                  <img
                    src={option.avatar}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-sm">{option.label}</div>
                  {option.description && (
                    <div className="truncate text-xs text-text-secondary">
                      {option.description}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Description */}
      {description && (
        <p
          id={descriptionId}
          className="mt-1 text-sm text-text-secondary"
        >
          {description}
        </p>
      )}
    </div>
  );
});

Mentions.displayName = "Mentions";

export default Mentions;
