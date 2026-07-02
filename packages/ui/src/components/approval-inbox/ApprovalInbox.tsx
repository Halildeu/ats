import React, { useCallback, useMemo, useState } from 'react';
import { ApprovalCheckpoint } from '../approval-checkpoint';
import {
  ApprovalEligibilityGuard,
  type ApprovalEligibilityGuardBlockedInfo,
} from '../approval-eligibility-guard';
import { Pagination } from '../pagination/Pagination';
import { Button } from '../../primitives/button/Button';
import { Badge } from '../../primitives/badge/Badge';
import { Text } from '../../primitives/text/Text';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import type {
  ApprovalActor,
  ApprovalRequest,
  ApprovalRequestStatus,
  EligibilityReason,
} from '../../types/approval';

export interface ApprovalInboxFilters {
  query?: string;
  type?: string;
  status?: ApprovalRequestStatus;
}

export interface ApprovalInboxBulkPayload {
  eligibleIds: string[];
  blockedReasons: Array<{ id: string; reasons: EligibilityReason[] }>;
}

export interface ApprovalInboxProps extends AccessControlledProps {
  /** Requests to render (already server-paginated when `total` is provided). */
  requests: ApprovalRequest[];
  /** Active user — used for per-row eligibility (4-eyes proposer self-check). */
  currentUser: ApprovalActor;
  /**
   * Consumer-supplied eligibility resolver. Overrides the built-in
   * `proposer_self` 4-eyes check so a domain consumer (e.g. endpoint-admin)
   * can return its own reason set (`role_insufficient`, `tier_mismatch`, …)
   * and have it flow through bulk eligibility split + row blocked badges.
   * When omitted, the default `proposer_self` compute is used.
   */
  getEligibilityReasons?: (
    request: ApprovalRequest,
    currentUser: ApprovalActor,
  ) => EligibilityReason[];
  /** Optional request-type filter values. */
  typeOptions?: Array<{ value: string; label: string }>;
  /** Optional status filter values. */
  statusOptions?: ApprovalRequestStatus[];
  /** Controlled filter state. When omitted, the inbox manages it internally. */
  filters?: ApprovalInboxFilters;
  /** Filter change callback (controlled mode). */
  onFiltersChange?: (next: ApprovalInboxFilters) => void;
  /** Detail-pane open handler. */
  onRequestOpen?: (request: ApprovalRequest) => void;
  /**
   * Bulk approve. The payload splits selection into `eligibleIds` (rows the
   * current user can act on) and `blockedReasons` (rows the user is gated
   * from). Consumer decides whether to surface the blocked list, queue,
   * or escalate to another approver.
   */
  onBulkApprove?: (payload: ApprovalInboxBulkPayload) => void;
  /** Bulk reject. Same payload split as `onBulkApprove`. */
  onBulkReject?: (payload: ApprovalInboxBulkPayload) => void;
  /** Controlled pagination. */
  page?: number;
  /** Page size — total / pageSize feeds Pagination. */
  pageSize?: number;
  /** Total request count across all pages (server-side). */
  total?: number;
  /** Page change callback (controlled). */
  onPageChange?: (page: number) => void;
  /** Empty-state message. */
  emptyMessage?: React.ReactNode;
  /** Additional class on the root. */
  className?: string;
}

const STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  pending: 'Beklemede',
  in_review: 'Inceleme',
  approved: 'Onaylandi',
  rejected: 'Reddedildi',
  withdrawn: 'Geri cekildi',
  expired: 'Suresi doldu',
};

const STATUS_TONE: Record<ApprovalRequestStatus, 'pending' | 'approved' | 'rejected' | 'blocked'> =
  {
    pending: 'pending',
    in_review: 'pending',
    approved: 'approved',
    rejected: 'rejected',
    withdrawn: 'blocked',
    expired: 'blocked',
  };

function ageLabel(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return iso;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'az once';
  if (mins < 60) return `${mins} dk`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa`;
  const days = Math.floor(hrs / 24);
  return `${days} gn`;
}

function computeRowEligibility(
  request: ApprovalRequest,
  currentUser: ApprovalActor,
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];
  if (request.proposer.id === currentUser.id) {
    reasons.push({
      code: 'proposer_self',
      message: 'Kendi olusturdugun talebi onaylayamazsin (4-eyes).',
    });
  }
  return reasons;
}

function applyFilters(
  requests: ApprovalRequest[],
  filters: ApprovalInboxFilters,
): ApprovalRequest[] {
  const query = filters.query?.trim().toLowerCase();
  return requests.filter((req) => {
    if (filters.type && req.type !== filters.type) return false;
    if (filters.status && req.status !== filters.status) return false;
    if (query) {
      const haystack = [req.title, req.target, req.reason, req.proposer.name, req.proposer.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export const ApprovalInbox = React.forwardRef<HTMLDivElement, ApprovalInboxProps>(
  (
    {
      requests,
      currentUser,
      typeOptions = [],
      statusOptions = ['pending', 'in_review', 'approved', 'rejected'],
      getEligibilityReasons,
      filters: filtersProp,
      onFiltersChange,
      onRequestOpen,
      onBulkApprove,
      onBulkReject,
      page,
      pageSize = 25,
      total,
      onPageChange,
      emptyMessage = 'Bekleyen talep yok.',
      className = '',
      access = 'full',
      accessReason,
    },
    ref,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const interactionBlocked = accessState.isDisabled || accessState.isReadonly;

    const [internalFilters, setInternalFilters] = useState<ApprovalInboxFilters>({});
    const filters = filtersProp ?? internalFilters;

    const updateFilters = useCallback(
      (next: ApprovalInboxFilters) => {
        if (onFiltersChange) onFiltersChange(next);
        else setInternalFilters(next);
      },
      [onFiltersChange],
    );

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Apply filters (controlled or internal) before rendering rows.
    const visibleRequests = useMemo(() => applyFilters(requests, filters), [requests, filters]);

    // Eligibility lookup — computed across the full request set so bulk
    // payloads keep correct context even if a selected row is currently
    // filtered out of view. Consumer-supplied resolver overrides the
    // built-in proposer_self compute so domain consumers can carry
    // role_insufficient / tier_mismatch / delegate_conflict semantics.
    const eligibilityById = useMemo(() => {
      const map = new Map<string, EligibilityReason[]>();
      const resolve = getEligibilityReasons ?? computeRowEligibility;
      for (const req of requests) {
        map.set(req.id, resolve(req, currentUser));
      }
      return map;
    }, [requests, currentUser, getEligibilityReasons]);

    const toggleSelect = useCallback(
      (id: string) => {
        if (interactionBlocked) return;
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      [interactionBlocked],
    );

    const handleBulkApprove = useCallback(() => {
      if (interactionBlocked || !onBulkApprove) return;
      const eligibleIds: string[] = [];
      const blockedReasons: ApprovalInboxBulkPayload['blockedReasons'] = [];
      for (const id of selectedIds) {
        const reasons = eligibilityById.get(id) ?? [];
        if (reasons.length === 0) eligibleIds.push(id);
        else blockedReasons.push({ id, reasons });
      }
      onBulkApprove({ eligibleIds, blockedReasons });
      setSelectedIds(new Set());
    }, [eligibilityById, interactionBlocked, onBulkApprove, selectedIds]);

    const handleBulkReject = useCallback(() => {
      if (interactionBlocked || !onBulkReject) return;
      const eligibleIds: string[] = [];
      const blockedReasons: ApprovalInboxBulkPayload['blockedReasons'] = [];
      for (const id of selectedIds) {
        const reasons = eligibilityById.get(id) ?? [];
        if (reasons.length === 0) eligibleIds.push(id);
        else blockedReasons.push({ id, reasons });
      }
      onBulkReject({ eligibleIds, blockedReasons });
      setSelectedIds(new Set());
    }, [eligibilityById, interactionBlocked, onBulkReject, selectedIds]);

    const selectedCount = selectedIds.size;
    const totalCount = total ?? requests.length;
    const showPagination = (total ?? 0) > pageSize || (page ?? 1) > 1;

    return (
      <div
        ref={ref}
        className={`flex flex-col gap-4 ${className}`.trim()}
        data-component="approval-inbox"
        data-access-state={accessState.state}
        title={accessReason}
      >
        {/* ----- Filter row ----- */}
        <div className="flex flex-wrap items-center gap-2" data-slot="filter-row" role="search">
          <input
            type="search"
            value={filters.query ?? ''}
            onChange={(event) =>
              updateFilters({ ...filters, query: event.target.value || undefined })
            }
            placeholder="Baslik, hedef veya talep eden ara..."
            aria-label="Inbox icinde ara"
            className="h-9 flex-1 min-w-[200px] rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm focus:outline-hidden focus:border-action-primary"
            disabled={interactionBlocked}
          />
          {typeOptions.length > 0 ? (
            <select
              value={filters.type ?? ''}
              onChange={(event) =>
                updateFilters({ ...filters, type: event.target.value || undefined })
              }
              aria-label="Tip filtresi"
              className="h-9 rounded-lg border border-border-subtle bg-surface-canvas px-2 text-sm"
              disabled={interactionBlocked}
            >
              <option value="">Tum tipler</option>
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={filters.status ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              updateFilters({
                ...filters,
                status: value ? (value as ApprovalRequestStatus) : undefined,
              });
            }}
            aria-label="Durum filtresi"
            className="h-9 rounded-lg border border-border-subtle bg-surface-canvas px-2 text-sm"
            disabled={interactionBlocked}
          >
            <option value="">Tum durumlar</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {/* ----- Bulk action bar ----- */}
        {selectedCount > 0 ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-action-primary-border bg-surface-panel px-3 py-2"
            data-slot="bulk-bar"
            role="region"
            aria-label="Toplu aksiyon"
          >
            <div className="flex items-center gap-2">
              <Badge variant="info" size="sm">
                {selectedCount} secildi
              </Badge>
              <Text variant="secondary" className="text-xs">
                Yetkin olmadigin satirlar `blockedReasons` ile callback'e tasinir.
              </Text>
            </div>
            <div className="flex items-center gap-2">
              {onBulkApprove ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={interactionBlocked}
                >
                  Toplu onayla
                </Button>
              ) : null}
              {onBulkReject ? (
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={handleBulkReject}
                  disabled={interactionBlocked}
                >
                  Toplu reddet
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                disabled={interactionBlocked}
              >
                Secimi temizle
              </Button>
            </div>
          </div>
        ) : null}

        {/* ----- Request rows ----- */}
        {visibleRequests.length === 0 ? (
          <div
            className="rounded-lg border border-border-subtle bg-surface-canvas px-4 py-6 text-center"
            data-slot="empty"
          >
            <Text variant="secondary" className="text-sm">
              {requests.length === 0 ? emptyMessage : 'Filtreyle eslesen talep yok.'}
            </Text>
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-slot="rows">
            {visibleRequests.map((request) => {
              const reasons = eligibilityById.get(request.id) ?? [];
              const isBlocked = reasons.length > 0;
              const isSelected = selectedIds.has(request.id);
              const checkpointStatus = STATUS_TONE[request.status] ?? 'pending';
              const handleBlocked = (_info: ApprovalEligibilityGuardBlockedInfo) => {
                // audit hook surface — consumer can wire telemetry; this
                // primitive intentionally swallows the blocked event since
                // bulk callbacks already report blocked rows.
              };

              return (
                <div
                  key={request.id}
                  data-slot="row"
                  data-selected={isSelected ? 'true' : 'false'}
                  className="flex items-start gap-3"
                >
                  <label className="mt-3 inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(request.id)}
                      aria-label={`${request.title} sec`}
                      disabled={interactionBlocked}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <ApprovalEligibilityGuard
                      reasons={reasons}
                      variant="inline"
                      onBlocked={handleBlocked}
                      silentTooltip
                    >
                      <ApprovalCheckpoint
                        density="compact"
                        title={request.title}
                        summary={request.reason}
                        status={checkpointStatus}
                        approverLabel={`Talep eden: ${request.proposer.name}`}
                        dueLabel={request.deadline ? `Son tarih: ${request.deadline}` : undefined}
                        evidenceItems={request.evidenceRefs}
                        badges={
                          [
                            <Badge key="age" variant="muted" size="sm">
                              {ageLabel(request.createdAt)}
                            </Badge>,
                            <Badge key="type" variant="muted" size="sm">
                              {request.type}
                            </Badge>,
                            isBlocked ? (
                              <Badge key="block" variant="warning" size="sm">
                                4-eyes
                              </Badge>
                            ) : null,
                          ].filter(Boolean) as React.ReactNode[]
                        }
                        primaryActionLabel="Detayi ac"
                        secondaryActionLabel="Hizli onayla"
                        onPrimaryAction={() => onRequestOpen?.(request)}
                        onSecondaryAction={() => {
                          if (isBlocked || !onBulkApprove) return;
                          onBulkApprove({
                            eligibleIds: [request.id],
                            blockedReasons: [],
                          });
                        }}
                        access={isBlocked ? 'readonly' : interactionBlocked ? 'readonly' : 'full'}
                        accessReason={
                          isBlocked ? reasons.map((r) => r.message).join(' · ') : accessReason
                        }
                      />
                    </ApprovalEligibilityGuard>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ----- Pagination footer ----- */}
        {showPagination ? (
          <Pagination
            total={totalCount}
            current={page ?? 1}
            pageSize={pageSize}
            onChange={onPageChange}
            showTotal
            size="sm"
          />
        ) : null}
      </div>
    );
  },
);

ApprovalInbox.displayName = 'ApprovalInbox';

export default ApprovalInbox;
