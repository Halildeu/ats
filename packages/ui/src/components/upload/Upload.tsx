import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import {
  buildDescribedBy,
  FieldControlShell,
  getFieldTone,
  type FieldSize,
} from "../../primitives/_shared/FieldControlPrimitives";
import { Text } from "../../primitives/text/Text";

export type UploadFileItem = {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
};

/** Props for the Upload component. */
export interface UploadProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "children" | "value" | "defaultValue">,
    AccessControlledProps {
  /** Field label displayed above the drop zone. */
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
  /** Callback fired when selected files change. */
  onFilesChange?: (files: UploadFileItem[], event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Whether the upload zone spans the full container width. */
  fullWidth?: boolean;
  /** Controlled list of selected files. */
  files?: UploadFileItem[];
  /** Initial file list for uncontrolled mode. */
  defaultFiles?: UploadFileItem[];
  /** Maximum number of files allowed. */
  maxFiles?: number;
  /** Placeholder text shown when no files are selected. */
  emptyStateLabel?: React.ReactNode;
}

const sizeClass: Record<FieldSize, string> = {
  sm: "rounded-xl px-3 py-3",
  md: "rounded-2xl px-4 py-4",
  lg: "rounded-2xl px-5 py-5",
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
};

const normalizeFiles = (files: FileList | null, maxFiles?: number): UploadFileItem[] => {
  const nextFiles = Array.from(files ?? []).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  }));
  return maxFiles ? nextFiles.slice(0, maxFiles) : nextFiles;
};

/**
 * Drag-and-drop file upload input with file list preview, size formatting, and removal support.
 *
 * @example
 * ```tsx
 * <Upload
 *   label="Attachments"
 *   accept="image/*,.pdf"
 *   multiple
 *   onFilesChange={(files) => setAttachments(files)}
 *   maxFiles={5}
 * />
 * ```
 */
export const Upload = React.forwardRef<HTMLInputElement, UploadProps>(function Upload(
  {
    id,
    label,
    description,
    hint,
    error,
    invalid = false,
    size = "md",
    onChange,
    onFilesChange,
    disabled = false,
    required = false,
    className,
    fullWidth = true,
    access = "full",
    accessReason,
    files,
    defaultFiles = [],
    maxFiles,
    emptyStateLabel = "Dosya sec veya surukleyip birak",
    multiple = false,
    accept,
    ...props
  },
  forwardedRef,
) {
  const accessState = resolveAccessState(access);
  const generatedId = React.useId();
  const inputId = id ?? `upload-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = buildDescribedBy(descriptionId, error ? errorId : hintId);
  const isReadonly = accessState.isReadonly;
  const isDisabled = disabled || accessState.isDisabled;
  const tone = getFieldTone({ invalid: invalid || Boolean(error), disabled: isDisabled, readonly: isReadonly });
  const isControlled = files !== undefined;
  const [internalFiles, setInternalFiles] = React.useState<UploadFileItem[]>(defaultFiles);
  const currentFiles = isControlled ? files ?? [] : internalFiles;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadonly) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const nextFiles = normalizeFiles(event.target.files, maxFiles);
    if (!isControlled) {
      setInternalFiles(nextFiles);
    }
    onChange?.(event);
    onFilesChange?.(nextFiles, event);
  };

  if (accessState.isHidden) {
    return null;
  }

  return (
    <FieldControlShell
      inputId={inputId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      required={required}
      fullWidth={fullWidth}
      data-access-state={accessState.state}
    >
      <div className={cn("flex flex-col gap-3", fullWidth && "w-full")}>
        <label
          htmlFor={inputId}
          className={cn(
            "block border border-dashed shadow-xs transition",
            sizeClass[size],
            tone === "invalid"
              ? "border-state-danger-text bg-surface-muted"
              : tone === "readonly"
                ? "border-border-subtle bg-surface-muted"
                : tone === "disabled"
                  ? "border-border-subtle bg-surface-muted opacity-80"
                  : "border-border-default bg-surface-muted hover:border-accent-primary",
            isReadonly || isDisabled ? "cursor-default" : "cursor-pointer",
            fullWidth && "w-full",
            className,
          )}
          title={accessReason}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Text as="div" weight="semibold">
                {emptyStateLabel}
              </Text>
              <Text as="div" variant="secondary" className="text-sm leading-6">
                {accept ? `Izin verilen tipler: ${accept}` : "Dosya secimi forms shell kontratiyla yonetilir."}
              </Text>
            </div>
            <Text
              as="span"
              variant="muted"
              className="shrink-0 rounded-full border border-border-default bg-[var(--surface-canvas)] px-3 py-1 text-xs font-semibold tabular-nums"
            >
              {currentFiles.length}{maxFiles ? ` / ${maxFiles}` : ""}
            </Text>
          </div>
          <input
            {...props}
            ref={forwardedRef}
            id={inputId}
            type="file"
            disabled={isDisabled || isReadonly}
            required={required}
            multiple={multiple}
            accept={accept}
            aria-invalid={invalid || Boolean(error) || undefined}
            aria-readonly={isReadonly || undefined}
            aria-disabled={isDisabled || isReadonly || undefined}
            aria-describedby={describedBy}
            className="sr-only"
            onChange={handleChange}
          />
        </label>

        {currentFiles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {currentFiles.map((file) => (
              <span
                key={`${file.name}-${file.lastModified ?? "static"}`}
                className="inline-flex items-center gap-2 rounded-full border border-border-default bg-[var(--surface-canvas)] px-3 py-1 text-xs font-medium text-text-primary"
              >
                <span className="truncate">{file.name}</span>
                <span className="text-text-secondary tabular-nums">{formatFileSize(file.size)}</span>
              </span>
            ))}
          </div>
        ) : (
          <Text as="div" variant="secondary" className="text-sm leading-6">
            Henuz dosya secilmedi.
          </Text>
        )}
      </div>
    </FieldControlShell>
  );
});

Upload.displayName = "Upload";

export default Upload;
