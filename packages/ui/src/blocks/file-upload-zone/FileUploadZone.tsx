import React, { useMemo, useCallback, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  progress?: number;
  status: 'uploading' | 'complete' | 'error';
  error?: string;
}

/** Props for the FileUploadZone component.
 * @example
 * ```tsx
 * <FileUploadZone files={[]} onFilesAdd={fn} />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/file-upload-zone)
 */
export interface FileUploadZoneProps extends AccessControlledProps {
  /** Uploaded / uploading file entries */
  files?: UploadedFile[];
  /** Called when new files are added via drop or file browser */
  onFilesAdd?: (files: File[]) => void;
  /** Called when a file remove button is clicked */
  onFileRemove?: (id: string) => void;
  /** Accepted file type filter (e.g. ".pdf,.xlsx") */
  accept?: string;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Allow multiple file selection */
  multiple?: boolean;
  /** Disable the upload zone */
  disabled?: boolean;
  /** Main label text */
  label?: string;
  /** Description text shown below label */
  description?: string;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${Math.round(val * 10) / 10} ${units[i]}`;
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '\uD83D\uDDBC\uFE0F';
  if (type.includes('pdf')) return '\uD83D\uDCC4';
  if (type.includes('spreadsheet') || type.includes('csv') || type.includes('excel'))
    return '\uD83D\uDCCA';
  if (type.includes('presentation') || type.includes('powerpoint')) return '\uD83D\uDCBB';
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed'))
    return '\uD83D\uDDC4\uFE0F';
  if (type.includes('text/') || type.includes('document') || type.includes('word'))
    return '\uD83D\uDCC3';
  return '\uD83D\uDCC1';
}

function getStatusColor(status: UploadedFile['status']): string {
  switch (status) {
    case 'complete':
      return 'var(--state-success-text)';
    case 'error':
      return 'var(--state-error-text)';
    default:
      return 'var(--state-info-text)';
  }
}

// ---------------------------------------------------------------------------
// File item sub-component
// ---------------------------------------------------------------------------

interface FileItemProps {
  file: UploadedFile;
  canInteract: boolean;
  onRemove?: (id: string) => void;
}

const FileItem: React.FC<FileItemProps> = ({ file, canInteract, onRemove }) => {
  const statusColor = getStatusColor(file.status);
  const icon = getFileIcon(file.type);

  const handleRemove = useCallback(() => {
    if (canInteract && onRemove) {
      onRemove(file.id);
    }
  }, [canInteract, onRemove, file.id]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md border transition-colors',
        file.status === 'error'
          ? 'border-[var(--state-error-border))] bg-[var(--state-error-bg)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-default)]',
      )}
      role="listitem"
      aria-label={`${file.name}, ${formatFileSize(file.size)}, ${file.status}`}
    >
      {/* Icon */}
      <span className="text-base shrink-0" aria-hidden="true">
        {icon}
      </span>

      {/* Name + size + error */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-primary)] truncate">{file.name}</span>
          <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
            {formatFileSize(file.size)}
          </span>
        </div>

        {/* Progress bar */}
        {file.status === 'uploading' && file.progress != null && (
          <div className="mt-1.5">
            <div className="h-1 rounded-full bg-[var(--surface-muted)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-(--motion-duration-slow)"
                style={{
                  width: `${Math.min(100, file.progress)}%`,
                  backgroundColor: statusColor,
                }}
                role="progressbar"
                aria-valuenow={file.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <span className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5">
              {file.progress}%
            </span>
          </div>
        )}

        {/* Error message */}
        {file.status === 'error' && file.error && (
          <span className="text-[10px] text-[var(--state-error-text)] mt-0.5 block">
            {file.error}
          </span>
        )}
      </div>

      {/* Status indicator */}
      <span className="text-[10px] font-medium capitalize shrink-0" style={{ color: statusColor }}>
        {file.status === 'complete' ? '\u2713' : file.status === 'error' ? '\u2717' : ''}
      </span>

      {/* Remove button */}
      {canInteract && onRemove && (
        <button
          type="button"
          className={cn(
            'shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-md',
            'text-[var(--text-tertiary)] hover:text-[var(--state-error-text)] hover:bg-[var(--state-error-bg)]',
            'transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]',
          )}
          onClick={handleRemove}
          aria-label={`Remove ${file.name}`}
        >
          <span aria-hidden="true" className="text-sm">
            &times;
          </span>
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Drag & drop file upload zone with file list, progress indicators, and validation. */
export function FileUploadZone({
  files = [],
  onFilesAdd,
  onFileRemove,
  accept,
  maxSize,
  maxFiles,
  multiple = true,
  disabled = false,
  label = 'Drop files here or click to browse',
  description,
  className,
  access,
  accessReason,
}: FileUploadZoneProps) {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const canInteract = !accessState.isDisabled && !accessState.isReadonly && !disabled;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const isMaxReached = maxFiles != null && files.length >= maxFiles;

  // Handle file selection
  const handleFiles = useCallback(
    (fileList: FileList) => {
      if (!canInteract || !onFilesAdd) return;
      const newFiles = Array.from(fileList);

      // Validate
      const validated = newFiles.filter((file) => {
        if (maxSize && file.size > maxSize) return false;
        if (accept) {
          const accepted = accept.split(',').map((a) => a.trim().toLowerCase());
          const ext = '.' + file.name.split('.').pop()?.toLowerCase();
          const mime = file.type.toLowerCase();
          const matchesAccept = accepted.some(
            (a) =>
              a === ext ||
              a === mime ||
              (a.endsWith('/*') && mime.startsWith(a.replace('/*', '/'))),
          );
          if (!matchesAccept) return false;
        }
        return true;
      });

      // Limit
      const remaining = maxFiles != null ? maxFiles - files.length : validated.length;
      const limited = validated.slice(0, Math.max(0, remaining));

      if (limited.length > 0) {
        onFilesAdd(limited);
      }
    },
    [canInteract, onFilesAdd, maxSize, accept, maxFiles, files.length],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    if (canInteract && !isMaxReached && inputRef.current) {
      inputRef.current.click();
    }
  }, [canInteract, isMaxReached]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        // Reset so same file can be selected again
        e.target.value = '';
      }
    },
    [handleFiles],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && canInteract && !isMaxReached) {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [canInteract, isMaxReached],
  );

  // Max size display
  const maxSizeLabel = useMemo(() => {
    if (!maxSize) return null;
    return formatFileSize(maxSize);
  }, [maxSize]);

  return (
    <div
      className={cn('w-full', accessStyles(accessState.state), className)}
      data-component="file-upload-zone"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      {/* Drop zone area */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 text-center transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
          isDragOver
            ? 'border-[var(--state-info-text)] bg-[var(--state-info-bg)]'
            : 'border-[var(--border-default)] bg-[var(--surface-default)]',
          canInteract && !isMaxReached
            ? 'cursor-pointer hover:border-[var(--state-info-text)] hover:bg-[var(--surface-muted)]'
            : 'cursor-not-allowed opacity-60',
        )}
        role="button"
        tabIndex={canInteract && !isMaxReached ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        aria-label={label}
      >
        {/* Cloud icon */}
        <div className="text-3xl mb-2 text-[var(--text-tertiary)]" aria-hidden="true">
          {'\u2601\uFE0F'}
        </div>

        {/* Label */}
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{label}</p>

        {/* Description */}
        {description && <p className="text-xs text-[var(--text-tertiary)]">{description}</p>}

        {/* Constraints info */}
        <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-[var(--text-tertiary)]">
          {maxSizeLabel && <span>Max: {maxSizeLabel}</span>}
          {maxFiles != null && (
            <span>
              Files: {files.length}/{maxFiles}
            </span>
          )}
          {accept && <span>Types: {accept}</span>}
        </div>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          disabled={!canInteract || isMaxReached}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-3 flex flex-col gap-2" role="list" aria-label="Uploaded files">
          {files.map((file) => (
            <FileItem key={file.id} file={file} canInteract={canInteract} onRemove={onFileRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

FileUploadZone.displayName = 'FileUploadZone';
export default FileUploadZone;
