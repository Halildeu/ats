import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Image — Smart image with preview, fallback, lazy load & gallery    */
/* ------------------------------------------------------------------ */

export type ImageRounded = boolean | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ImageObjectFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

export interface ImagePreviewConfig {
  /** Controlled visibility. */
  visible?: boolean;
  /** Visibility change handler. */
  onVisibleChange?: (visible: boolean) => void;
  /** Custom overlay mask content. */
  mask?: React.ReactNode;
  /** Max zoom scale. @default 3 */
  maxScale?: number;
}

export interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'placeholder'> {
  /** Image source URL. */
  src?: string;
  /** Alt text. */
  alt?: string;
  /** Width. */
  width?: number | string;
  /** Height. */
  height?: number | string;
  /** Fallback image source on error. */
  fallback?: string;
  /** Placeholder during loading. */
  placeholder?: React.ReactNode | 'blur';
  /** Enable click-to-preview. @default false */
  preview?: boolean | ImagePreviewConfig;
  /** Object-fit mode. @default 'cover' */
  objectFit?: ImageObjectFit;
  /** Lazy load via IntersectionObserver. @default true */
  lazy?: boolean;
  /** Border radius. @default false */
  rounded?: ImageRounded;
}

export interface ImageGroupProps {
  /** Image children. */
  children: React.ReactNode;
  /** Additional CSS class. */
  className?: string;
}

/* ---- Style maps ---- */

const objectFitMap: Record<ImageObjectFit, string> = {
  cover: 'object-cover',
  contain: 'object-contain',
  fill: 'object-fill',
  none: 'object-none',
  'scale-down': 'object-scale-down',
};

const roundedMap: Record<string, string> = {
  true: 'rounded-lg',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

/* ---- Preview overlay icon ---- */

const ZoomIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ---- Preview Modal ---- */

const PreviewModal: React.FC<{
  src: string; alt?: string; onClose: () => void; maxScale?: number;
}> = ({ src, alt, onClose, maxScale = 3 }) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => Math.max(0.5, Math.min(maxScale, prev + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, [maxScale]);

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Close preview"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        style={{ transform: `scale(${scale})` }}
        className="max-h-[90vh] max-w-[90vw] cursor-zoom-in object-contain transition-transform duration-(--motion-duration-medium)"
      />
    </div>
  );
};

/* ---- Main Component ---- */

/**
 * Smart image component with preview, fallback, lazy loading, and
 * gallery support. Click to preview with zoom via scroll wheel.
 *
 * @example
 * ```tsx
 * <Image src="/photo.jpg" width={300} preview />
 * <Image src="/photo.jpg" fallback="/placeholder.svg" rounded="lg" />
 * <Image.Group>
 *   <Image src="/1.jpg" preview />
 *   <Image src="/2.jpg" preview />
 * </Image.Group>
 * ```
 *
 * @since 1.1.0
 */
const ImageRoot = forwardRef<HTMLDivElement, ImageProps>(
  function ImageComponent(
    {
      src,
      alt = '',
      width,
      height,
      fallback,
      placeholder,
      preview = false,
      objectFit = 'cover',
      lazy = true,
      rounded = false,
      className,
      style,
      ...rest
    },
    ref,
  ) {
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [inView, setInView] = useState(!lazy);
    const imgRef = useRef<HTMLDivElement>(null);

    // Lazy loading via IntersectionObserver
    useEffect(() => {
      if (!lazy || inView) return;
      const el = imgRef.current;
      if (!el || typeof IntersectionObserver === 'undefined') {
        setInView(true);
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
        { rootMargin: '200px' },
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, [lazy, inView]);

    const previewConfig = typeof preview === 'object' ? preview : undefined;
    const showPreview = preview !== false;
    const isPreviewOpen = previewConfig?.visible ?? previewVisible;

    const handlePreviewOpen = useCallback(() => {
      if (!showPreview) return;
      previewConfig?.onVisibleChange?.(true);
      setPreviewVisible(true);
    }, [showPreview, previewConfig]);

    const handlePreviewClose = useCallback(() => {
      previewConfig?.onVisibleChange?.(false);
      setPreviewVisible(false);
    }, [previewConfig]);

    const resolvedSrc = error && fallback ? fallback : src;
    const roundedClass = rounded ? roundedMap[String(rounded)] : '';

    return (
      <>
        <div
          ref={(el) => {
            (imgRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
          }}
          {...stateAttrs({ component: 'image' })}
          className={cn(
            'relative inline-block overflow-hidden bg-surface-muted',
            roundedClass,
            showPreview && 'cursor-pointer group',
            className,
          )}
          style={{ width, height, ...style }}
          onClick={showPreview ? handlePreviewOpen : undefined}
        >
          {/* Placeholder */}
          {!loaded && placeholder && (
            <div className="absolute inset-0 flex items-center justify-center">
              {placeholder === 'blur' ? (
                <div className="h-full w-full animate-pulse bg-surface-muted" />
              ) : (
                placeholder
              )}
            </div>
          )}

          {/* Image */}
          {inView && resolvedSrc && (
            <img
              src={resolvedSrc}
              alt={alt}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
              className={cn(
                'h-full w-full transition-opacity duration-(--motion-duration-slow)',
                objectFitMap[objectFit],
                roundedClass,
                loaded ? 'opacity-100' : 'opacity-0',
              )}
              loading={lazy ? 'lazy' : undefined}
              {...rest}
            />
          )}

          {/* Preview mask */}
          {showPreview && loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
              <ZoomIcon className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          )}
        </div>

        {/* Preview modal */}
        {isPreviewOpen && resolvedSrc && (
          <PreviewModal
            src={resolvedSrc}
            alt={alt}
            onClose={handlePreviewClose}
            maxScale={previewConfig?.maxScale}
          />
        )}
      </>
    );
  },
);

ImageRoot.displayName = 'Image';

/* ---- Image.Group ---- */

/**
 * Groups multiple Image components for gallery-style layout.
 */
const ImageGroup: React.FC<ImageGroupProps> = ({ children, className }) => (
  <div
    {...stateAttrs({ component: 'image-group' })}
    className={cn('flex flex-wrap gap-2', className)}
  >
    {children}
  </div>
);

ImageGroup.displayName = 'Image.Group';

/* ---- Compound assembly ---- */

type CompoundImage = typeof ImageRoot & {
  Group: typeof ImageGroup;
};

export const Image = ImageRoot as CompoundImage;
Image.Group = ImageGroup;
