import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a single comment in a discussion thread.
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/comment-thread)
 */
export interface Comment {
  /** Unique identifier */
  id: string;
  /** Comment author information */
  author: { name: string; avatar?: string };
  /** Comment body text */
  content: string;
  /** ISO timestamp string */
  timestamp: string;
  /** Nested replies to this comment */
  replies?: Comment[];
  /** Whether the comment has been edited */
  edited?: boolean;
}

/**
 * Props for the CommentThread component.
 *
 * @example
 * ```tsx
 * <CommentThread
 *   comments={[
 *     { id: '1', author: { name: 'Alice' }, content: 'Looks great!', timestamp: '2025-03-20T10:00:00Z' },
 *   ]}
 *   currentUser={{ name: 'Bob' }}
 *   onReply={(parentId, content) => console.log('Reply:', parentId, content)}
 * />
 * ```
 *
 * @since 1.0.0
 * @see Comment
 */
export interface CommentThreadProps extends AccessControlledProps {
  /** Array of top-level comments */
  comments: Comment[];
  /** Callback when a reply is submitted */
  onReply?: (parentId: string, content: string) => void;
  /** Callback when a comment is edited */
  onEdit?: (id: string, content: string) => void;
  /** Callback when a comment is deleted */
  onDelete?: (id: string) => void;
  /** The currently logged-in user */
  currentUser?: { name: string; avatar?: string };
  /** Maximum nesting depth for replies (default: 3) */
  maxDepth?: number;
  /** Show the reply form for top-level comments (default: true) */
  showReplyForm?: boolean;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return 'az once';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk once`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat once`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} gun once`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} ay once`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface AvatarProps {
  name: string;
  avatar?: string;
  size?: number;
}

const Avatar: React.FC<AvatarProps> = ({ name, avatar, size = 32 }) => {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-xs font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: 'var(--surface-muted)',
        color: 'var(--text-secondary)',
      }}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  );
};

interface ReplyFormProps {
  onSubmit: (content: string) => void;
  currentUser?: { name: string; avatar?: string };
  placeholder?: string;
  disabled?: boolean;
}

const ReplyForm: React.FC<ReplyFormProps> = ({
  onSubmit,
  currentUser,
  placeholder = 'Yanit yaz...',
  disabled,
}) => {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  }, [text, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex gap-2 mt-3">
      {currentUser && <Avatar name={currentUser.name} avatar={currentUser.avatar} size={28} />}
      <div className="flex-1 flex flex-col gap-2">
        <textarea
          className={cn(
            'w-full rounded-md border px-3 py-2 text-sm resize-none',
            'bg-[var(--surface-default)] text-[var(--text-primary)]',
            'border-[var(--border-default)]',
            'placeholder:text-[var(--text-tertiary)]',
            'focus:outline-hidden focus:ring-2 focus:ring-[var(--ring-primary)]',
          )}
          rows={2}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label="Reply text"
        />
        <div className="flex justify-end">
          <button
            type="button"
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md',
              'bg-[var(--surface-accent)] text-[var(--text-on-accent)]',
              'hover:opacity-90 transition-opacity',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
            aria-label="Submit reply"
          >
            Gonder
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single Comment
// ---------------------------------------------------------------------------

interface SingleCommentProps {
  comment: Comment;
  depth: number;
  maxDepth: number;
  currentUser?: { name: string; avatar?: string };
  canInteract: boolean;
  onReply?: (parentId: string, content: string) => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
}

const SingleComment: React.FC<SingleCommentProps> = ({
  comment,
  depth,
  maxDepth,
  currentUser,
  canInteract,
  onReply,
  onEdit,
  onDelete,
}) => {
  const [showReply, setShowReply] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const isOwn = currentUser?.name === comment.author.name;

  const handleReplySubmit = useCallback(
    (content: string) => {
      if (onReply) onReply(comment.id, content);
      setShowReply(false);
    },
    [comment.id, onReply],
  );

  const handleEditSave = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed && onEdit) {
      onEdit(comment.id, trimmed);
    }
    setIsEditing(false);
  }, [comment.id, editText, onEdit]);

  const handleDelete = useCallback(() => {
    if (onDelete) onDelete(comment.id);
  }, [comment.id, onDelete]);

  const indentPx = depth * 24;

  return (
    <div
      className="relative"
      style={{ marginLeft: indentPx }}
      data-comment-id={comment.id}
      data-depth={depth}
    >
      {/* Connector line */}
      {depth > 0 && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-[var(--border-subtle)]"
          style={{ left: -12 }}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          'flex gap-3 py-3 px-2 rounded-md',
          'hover:bg-[var(--surface-hover)] transition-colors',
        )}
        role="article"
        aria-label={`Comment by ${comment.author.name}`}
      >
        <Avatar name={comment.author.name} avatar={comment.author.avatar} />
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {comment.author.name}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {relativeTime(comment.timestamp)}
            </span>
            {comment.edited && (
              <span className="text-xs italic text-[var(--text-tertiary)]" aria-label="Edited">
                (duzenlendi)
              </span>
            )}
          </div>

          {/* Body */}
          {isEditing ? (
            <div className="mt-1">
              <textarea
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-sm resize-none',
                  'bg-[var(--surface-default)] text-[var(--text-primary)]',
                  'border-[var(--border-default)]',
                  'focus:outline-hidden focus:ring-2 focus:ring-[var(--ring-primary)]',
                )}
                rows={3}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                aria-label="Edit comment"
              />
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--text-accent)] hover:underline"
                  onClick={handleEditSave}
                >
                  Kaydet
                </button>
                <button
                  type="button"
                  className="text-xs text-[var(--text-tertiary)] hover:underline"
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(comment.content);
                  }}
                >
                  Iptal
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">
              {comment.content}
            </p>
          )}

          {/* Actions */}
          {canInteract && !isEditing && (
            <div className="flex gap-3 mt-2">
              {depth < maxDepth && onReply && (
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--text-accent)] hover:underline"
                  onClick={() => setShowReply((v) => !v)}
                  aria-label="Reply"
                >
                  Yanit
                </button>
              )}
              {isOwn && onEdit && (
                <button
                  type="button"
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:underline"
                  onClick={() => setIsEditing(true)}
                  aria-label="Edit"
                >
                  Duzenle
                </button>
              )}
              {isOwn && onDelete && (
                <button
                  type="button"
                  className="text-xs text-[var(--state-error-text)] hover:underline"
                  onClick={handleDelete}
                  aria-label="Delete"
                >
                  Sil
                </button>
              )}
            </div>
          )}

          {/* Reply form */}
          {showReply && canInteract && (
            <ReplyForm
              onSubmit={handleReplySubmit}
              currentUser={currentUser}
              placeholder="Yanit yaz..."
              disabled={!canInteract}
            />
          )}
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && depth < maxDepth && (
        <div className="mt-1">
          {comment.replies.map((reply) => (
            <SingleComment
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              maxDepth={maxDepth}
              currentUser={currentUser}
              canInteract={canInteract}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Collaborative discussion thread component supporting nested replies,
 * inline editing, and user-scoped actions. Suitable for Jira/GitHub-style
 * comment interactions within enterprise dashboards.
 *
 * @example
 * ```tsx
 * <CommentThread
 *   comments={threadData}
 *   currentUser={{ name: 'Ali' }}
 *   onReply={(parentId, text) => addReply(parentId, text)}
 *   onEdit={(id, text) => updateComment(id, text)}
 *   onDelete={(id) => removeComment(id)}
 *   maxDepth={3}
 * />
 * ```
 *
 * @since 1.0.0
 * @see Comment
 */
export const CommentThread: React.FC<CommentThreadProps> = ({
  comments,
  onReply,
  onEdit,
  onDelete,
  currentUser,
  maxDepth = 3,
  showReplyForm = true,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const canInteract = !accessState.isDisabled && !accessState.isReadonly;

  const totalComments = useMemo(() => {
    let count = 0;
    const walk = (items: Comment[]) => {
      items.forEach((c) => {
        count += 1;
        if (c.replies) walk(c.replies);
      });
    };
    walk(comments);
    return count;
  }, [comments]);

  if (comments.length === 0) {
    return (
      <div
        className={cn(
          'p-6 text-center text-sm text-[var(--text-tertiary)]',
          'border border-[var(--border-default)] rounded-lg',
          className,
        )}
        data-component="comment-thread"
      >
        Henuz yorum yok
        {showReplyForm && canInteract && currentUser && (
          <ReplyForm
            onSubmit={(content) => onReply?.('root', content)}
            currentUser={currentUser}
            placeholder="Ilk yorumu yaz..."
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border border-[var(--border-default)] rounded-lg',
        'bg-[var(--surface-default)] p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="comment-thread"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
      role="region"
      aria-label={`Comment thread (${totalComments} comments)`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-subtle)]">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Yorumlar</span>
        <span className="text-xs text-[var(--text-tertiary)]">({totalComments})</span>
      </div>

      {/* Comment list */}
      <div className="space-y-1">
        {comments.map((comment) => (
          <SingleComment
            key={comment.id}
            comment={comment}
            depth={0}
            maxDepth={maxDepth}
            currentUser={currentUser}
            canInteract={canInteract}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Top-level reply form */}
      {showReplyForm && canInteract && currentUser && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
          <ReplyForm
            onSubmit={(content) => onReply?.('root', content)}
            currentUser={currentUser}
            placeholder="Yorum yaz..."
          />
        </div>
      )}
    </div>
  );
};

CommentThread.displayName = 'CommentThread';
export default CommentThread;
