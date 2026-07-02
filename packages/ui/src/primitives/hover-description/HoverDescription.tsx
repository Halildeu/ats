import React, { useCallback, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { cn } from '../../utils/cn';

/* ------------------------------------------------------------------ */
/*  HoverDescription — Hover ile açılan açıklama kartı                 */
/*                                                                     */
/*  Başlık veya herhangi bir element üzerine gelince altına             */
/*  açıklama kartı açılır. Portal kullanır — parent overflow:hidden     */
/*  sorunlarından etkilenmez.                                          */
/* ------------------------------------------------------------------ */

export interface HoverDescriptionProps {
  /** The content that triggers the tooltip on hover. */
  children: React.ReactNode;
  /** Description text shown in the tooltip card. */
  description: string;
  /** Optional title shown bold at the top of the card. */
  title?: string;
  /** Tooltip card width. @default 384 (w-96) */
  width?: number;
  /** Delay in ms before showing. @default 0 */
  delay?: number;
  /** Additional className for the trigger wrapper. */
  className?: string;
  /** Additional className for the tooltip card. */
  cardClassName?: string;
}

export const HoverDescription: React.FC<HoverDescriptionProps> = ({
  children,
  description,
  title,
  width = 384,
  delay = 0,
  className,
  cardClassName,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleEnter = useCallback(() => {
    const show = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 8, left: rect.left });
      }
      setOpen(true);
    };
    if (delay > 0) {
      timerRef.current = setTimeout(show, delay);
    } else {
      show();
    }
  }, [delay]);

  const handleLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  return (
    <>
      <span
        ref={ref}
        className={cn('cursor-default', className)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </span>
      {open && ReactDOM.createPortal(
        <div
          className={cn(
            'fixed z-[9999] rounded-xl border border-border-subtle bg-surface-default px-4 py-3 shadow-lg',
            'animate-in fade-in-0 slide-in-from-top-1 duration-(--motion-duration-medium)',
            cardClassName,
          )}
          style={{ top: pos.top, left: pos.left, width }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={handleLeave}
        >
          {title && (
            <div className="mb-1 text-sm font-semibold text-text-primary">{title}</div>
          )}
          <div className="text-sm text-text-secondary">{description}</div>
        </div>,
        document.body,
      )}
    </>
  );
};

HoverDescription.displayName = 'HoverDescription';
