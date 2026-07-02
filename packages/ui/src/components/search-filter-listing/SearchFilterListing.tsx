import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { PageHeader } from "../../patterns/page-header";
import { FilterBar } from "../../patterns/filter-bar";
import { SummaryStrip, type SummaryStripItem } from "../../patterns/summary-strip";
import { EmptyState } from "../empty-state";

/* ------------------------------------------------------------------ */
/*  SearchFilterListing — World-class search, filter & result recipe   */
/*                                                                     */
/*  Combines the best of Ant ProTable, MUI DataGrid, Shadcn DataTable  */
/*  and Mantine React Table into a lean, user-friendly composition.    */
/* ------------------------------------------------------------------ */

/* ---- Types ---- */

export type ActiveFilter = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

export type SortOption = {
  key: string;
  label: string;
};

export type SortState = {
  key: string;
  direction: "asc" | "desc";
};

export interface SearchFilterListingProps extends AccessControlledProps {
  /** Baslik ustundeki kategori/context etiketi */
  eyebrow?: React.ReactNode;
  /** Ana baslik (zorunlu) */
  title: React.ReactNode;
  /** Baslik altindaki aciklama metni */
  description?: React.ReactNode;
  /** Header sag tarafindaki meta bilgisi */
  meta?: React.ReactNode;
  /** Header sag tarafindaki durum badge'i */
  status?: React.ReactNode;
  /** Header aksiyonlari (butonlar vb.) */
  actions?: React.ReactNode;

  /* ---- Filter Bar ---- */
  /** FilterBar icerigi */
  filters?: React.ReactNode;
  /** Filtre sifirlama handler'i */
  onReset?: () => void;
  /** Gorunum kaydetme handler'i */
  onSaveView?: () => void;
  /** FilterBar ek aksiyonlari */
  filterExtra?: React.ReactNode;
  /** Toolbar aksiyonlari — FilterBar'in sag tarafina eklenir (reload, density vb.) */
  toolbar?: React.ReactNode;
  /** Yeniden yukleme handler'i — verildiginde FilterBar'da reload ikonu gosterilir */
  onReload?: () => void;

  /* ---- Active Filter Chips (Ant ProTable + MUI DataGrid pattern) ---- */
  /** Uygulanmis filtre chip'leri */
  activeFilters?: ActiveFilter[];
  /** Tum filtreleri temizle handler'i */
  onClearAllFilters?: () => void;

  /* ---- Summary Strip ---- */
  /** SummaryStrip KPI verileri */
  summaryItems?: SummaryStripItem[];

  /* ---- Results ---- */
  /** Sonuc listesi basligi */
  listTitle?: React.ReactNode;
  /** Sonuc listesi aciklamasi */
  listDescription?: React.ReactNode;
  /** Sonuc ogeleri listesi */
  items?: React.ReactNode[];
  /** Bos durum mesaji */
  emptyStateLabel?: React.ReactNode;
  /** Tamamen ozel sonuc yuzeyi (items yerine kullanilir) */
  results?: React.ReactNode;
  /** Toplam sonuc sayisi — gosterildiginde "X sonuc" etiketi render edilir */
  totalCount?: number;

  /* ---- Sort (MUI + Mantine pattern) ---- */
  /** Siralama secenekleri */
  sortOptions?: SortOption[];
  /** Aktif siralama durumu */
  activeSort?: SortState;
  /** Siralama degistiginde */
  onSortChange?: (key: string, direction: "asc" | "desc") => void;

  /* ---- Selection & Batch Actions (Ant ProTable pattern) ---- */
  /** Secim modunu etkinlestir */
  selectable?: boolean;
  /** Secili oge key'leri */
  selectedKeys?: React.Key[];
  /** Secim degistiginde */
  onSelectionChange?: (keys: React.Key[]) => void;
  /** Toplu aksiyon butonlari — secim aktifken gosterilir */
  batchActions?: React.ReactNode;

  /* ---- Layout & UX ---- */
  /** Ek CSS siniflari */
  className?: string;
  /** Section elementine erisilebilirlik etiketi */
  "aria-label"?: string;
  /** Section elementinin ARIA rolu */
  role?: string;
  /** Yukleniyor durumunda iskelet placeholder gosterir */
  loading?: boolean;
  /** Yogunluk modu: default veya compact */
  size?: "default" | "compact";
}

/* ---- Style constants ----
   */

const panelBase =
  "relative overflow-hidden rounded-[28px] border border-border-subtle/80 bg-[var(--surface-card))] shadow-[0_22px_48px_-34px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs transition-all duration-(--motion-duration-medium)";

const SKELETON_PULSE = "animate-pulse rounded-lg bg-surface-muted";

/* ---- Sub-components ---- */

const FilterChips: React.FC<{
  filters: ActiveFilter[];
  onClearAll?: () => void;
  compact?: boolean;
}> = ({ filters, onClearAll, compact }) => {
  if (filters.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-all duration-(--motion-duration-medium)",
        compact ? "px-3 py-2" : "px-5 py-3",
      )}
      role="status"
      aria-label={`${filters.length} aktif filtre`}
    >
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 text-xs text-text-primary transition-colors hover:bg-[var(--surface-hover)]"
        >
          <span className="font-medium text-text-secondary">{f.label}:</span>
          <span>{f.value}</span>
          <button
            type="button"
            onClick={f.onRemove}
            className="ms-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-[var(--action-primary-bg))] hover:text-text-inverse"
            aria-label={`${f.label} filtresini kaldir`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
              <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}
      {onClearAll && filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-[var(--action-primary-bg))] transition-colors hover:underline"
        >
          Tumunu temizle
        </button>
      )}
    </div>
  );
};

const SelectionBar: React.FC<{
  count: number;
  onClear: () => void;
  children?: React.ReactNode;
  compact?: boolean;
}> = ({ count, onClear, children, compact }) => {
  if (count === 0) return null;
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-2xl border border-[color-mix(in_oklab,var(--selection-outline))_40%,transparent)] bg-[var(--selection-bg)] transition-all duration-(--motion-duration-medium)",
        compact ? "px-3 py-2" : "px-5 py-3",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--action-primary-bg))] text-[10px] font-bold text-text-inverse">
          {count}
        </span>
        <span className="text-sm font-medium text-text-primary">
          {count} oge secildi
        </span>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          Secimi temizle
        </button>
      </div>
    </div>
  );
};

const SortDropdown: React.FC<{
  options: SortOption[];
  active?: SortState;
  onChange?: (key: string, direction: "asc" | "desc") => void;
}> = ({ options, active, onChange }) => {
  if (options.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={active?.key ?? ""}
        onChange={(e) => {
          const key = e.target.value;
          if (key && onChange) onChange(key, active?.direction ?? "asc");
        }}
        className="rounded-lg border border-border-subtle bg-transparent px-2 py-1 text-xs text-text-secondary outline-hidden focus:border-[var(--selection-outline))]"
        aria-label="Siralama"
      >
        <option value="">Siralama</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      {active && onChange && (
        <button
          type="button"
          onClick={() => onChange(active.key, active.direction === "asc" ? "desc" : "asc")}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-muted"
          aria-label={active.direction === "asc" ? "Azalan sirala" : "Artan sirala"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            {active.direction === "asc" ? (
              <path d="M6 2L6 10M6 2L3 5M6 2L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M6 10L6 2M6 10L3 7M6 10L9 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
};

/* ---- Main Component ---- 
 * @example
 * ```tsx
 * <SearchFilterListing />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/search-filter-listing)
 */
export const SearchFilterListing = React.forwardRef<HTMLElement, SearchFilterListingProps>(({
  eyebrow,
  title,
  description,
  meta,
  status,
  actions,
  filters,
  onReset,
  onSaveView,
  filterExtra,
  toolbar,
  onReload,
  activeFilters = [],
  onClearAllFilters,
  summaryItems = [],
  listTitle = "Sonuclar",
  listDescription,
  items = [],
  emptyStateLabel = "Eslesen sonuc bulunamadi.",
  results,
  totalCount,
  sortOptions = [],
  activeSort,
  onSortChange,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  batchActions,
  className = "",
  "aria-label": ariaLabel,
  role,
  loading = false,
  size = "default",
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  const isCompact = size === "compact";
  const panelClass = cn(panelBase, isCompact ? "p-3" : "p-5");
  const sectionGap = isCompact ? "flex flex-col gap-2" : "flex flex-col gap-4";
  const itemsGap = isCompact ? "flex flex-col gap-2" : "flex flex-col gap-3";
  const hasActiveFilters = activeFilters.length > 0;
  const hasSelection = selectable && selectedKeys.length > 0;

  /* ---- Loading skeleton ---- */
  if (loading) {
    return (
      <section
        ref={ref}
        className={cn(sectionGap, className)}
        data-access-state={accessState.state}
        data-component="search-filter-listing"
        aria-label={ariaLabel}
        role={role}
        aria-busy="true"
        title={accessReason}
      >
        <div className="flex flex-col gap-2">
          <div className={cn(SKELETON_PULSE, "h-4 w-24")} />
          <div className={cn(SKELETON_PULSE, "h-7 w-64")} />
          <div className={cn(SKELETON_PULSE, "h-4 w-96")} />
        </div>
        <div className={panelClass}>
          <div className="flex gap-3">
            <div className={cn(SKELETON_PULSE, "h-9 w-48")} />
            <div className={cn(SKELETON_PULSE, "h-9 w-36")} />
          </div>
        </div>
        <div className={panelClass}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className={cn(SKELETON_PULSE, "h-3 w-16")} />
                <div className={cn(SKELETON_PULSE, "h-6 w-12")} />
                <div className={cn(SKELETON_PULSE, "h-3 w-24")} />
              </div>
            ))}
          </div>
        </div>
        <div className={panelClass}>
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn(SKELETON_PULSE, "h-14 w-full")} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ---- Contextual empty state ---- */
  const renderEmptyState = () => {
    if (hasActiveFilters) {
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10 17L6 21M14 17L18 21M12 17V21M3 7L5 3H19L21 7M4 7H20V13C20 15.2091 18.2091 17 16 17H8C5.79086 17 4 15.2091 4 13V7Z" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-sm font-medium text-text-primary">
            Bu filtre kombinasyonu icin sonuc bulunamadi
          </div>
          <div className="text-xs text-text-secondary">
            Filtreleri degistirmeyi veya temizlemeyi deneyin.
          </div>
          {onClearAllFilters && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="mt-1 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-muted"
            >
              Filtreleri temizle
            </button>
          )}
        </div>
      );
    }
    return (
      <EmptyState
        description={
          typeof emptyStateLabel === "string" ? emptyStateLabel : "Sonuc bulunamadi"
        }
      />
    );
  };

  /* ---- Toolbar (reload + custom actions) ---- */
  const toolbarContent = (toolbar || onReload) ? (
    <div className="flex items-center gap-1">
      {onReload && (
        <button
          type="button"
          onClick={onReload}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
          aria-label="Yeniden yukle"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1.5 7C1.5 3.96243 3.96243 1.5 7 1.5C9.07107 1.5 10.8763 2.65625 11.8125 4.375M12.5 7C12.5 10.0376 10.0376 12.5 7 12.5C4.92893 12.5 3.12372 11.3438 2.1875 9.625M11.8125 1.5V4.375H8.9375M2.1875 12.5V9.625H5.0625" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {toolbar}
    </div>
  ) : null;

  /* ---- Result header with count + sort ---- */
  const resultHeader = (listTitle || totalCount !== undefined || sortOptions.length > 0) ? (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {listTitle && (
          <div className="text-base font-semibold tracking-[-0.02em] text-text-primary">
            {listTitle}
          </div>
        )}
        {listDescription && (
          <div className="mt-1 text-sm leading-6 text-text-secondary">
            {listDescription}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {sortOptions.length > 0 && (
          <SortDropdown options={sortOptions} active={activeSort} onChange={onSortChange} />
        )}
        {totalCount !== undefined && (
          <span className="whitespace-nowrap rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium tabular-nums text-text-secondary">
            {totalCount} sonuc
          </span>
        )}
      </div>
    </div>
  ) : null;

  return (
    <section
      ref={ref}
      className={cn(sectionGap, className)}
      data-access-state={accessState.state}
      data-component="search-filter-listing"
      aria-label={ariaLabel}
      role={role}
      title={accessReason}
    >
      {/* ---- Header ---- */}
      <PageHeader
        title={
          <>
            {eyebrow && (
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">
                {eyebrow}
              </span>
            )}
            {title}
          </>
        }
        subtitle={description}
        extra={
          (meta || status) ? (
            <div className="flex items-center gap-3">
              {meta}
              {status}
            </div>
          ) : undefined
        }
        actions={actions}
      />

      {/* ---- FilterBar + Toolbar ---- */}
      {filters || onReset || onSaveView || filterExtra || toolbarContent ? (
        <div className={panelClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <FilterBar actions={filterExtra}>
                {filters}
              </FilterBar>
            </div>
            {toolbarContent}
          </div>
        </div>
      ) : null}

      {/* ---- Active Filter Chips ---- */}
      {hasActiveFilters && (
        <FilterChips
          filters={activeFilters}
          onClearAll={onClearAllFilters}
          compact={isCompact}
        />
      )}

      {/* ---- Selection Bar ---- */}
      {hasSelection && onSelectionChange && (
        <SelectionBar
          count={selectedKeys.length}
          onClear={() => onSelectionChange([])}
          compact={isCompact}
        >
          {batchActions}
        </SelectionBar>
      )}

      {/* ---- Summary Strip ---- */}
      {Array.isArray(summaryItems) && summaryItems.length > 0 ? (
        <div className={panelClass}>
          <SummaryStrip items={summaryItems} columns={3} />
        </div>
      ) : null}

      {/* ---- Results ---- */}
      <div className={panelClass}>
        {results ?? (
          Array.isArray(items) && items.length > 0 ? (
            <div>
              {resultHeader}
              <div className={cn(resultHeader ? "mt-4" : "", itemsGap)}>
                {items.map((item, index) => (
                  <div key={index}>{item}</div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {resultHeader}
              {resultHeader && <div className="mt-4" />}
              {renderEmptyState()}
            </>
          )
        )}
      </div>
    </section>
  );
});

SearchFilterListing.displayName = "SearchFilterListing";

export default SearchFilterListing;
