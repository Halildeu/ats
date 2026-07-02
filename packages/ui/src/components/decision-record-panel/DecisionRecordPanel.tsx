import React, { useCallback, useMemo, useState } from 'react';
import { Avatar } from '../../primitives/avatar/Avatar';
import { Badge, type BadgeVariant } from '../../primitives/badge/Badge';
import { Button } from '../../primitives/button/Button';
import { Text } from '../../primitives/text/Text';
import { DataExportDialog, type ExportFormat } from '../data-export-dialog/DataExportDialog';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import type {
  ApprovalAction,
  ApprovalRequest,
  ApprovalRequestStatus,
  DecisionRecord,
} from '../../types/approval';

export interface DecisionRecordPanelExportPayload {
  format: ExportFormat;
  records: DecisionRecord[];
}

export interface DecisionRecordPanelProps extends AccessControlledProps {
  /** Immutable decision history to render. */
  history: DecisionRecord[];
  /** Optional request meta surface (title + id + type + target). */
  request?: Pick<ApprovalRequest, 'id' | 'title' | 'type' | 'target'>;
  /** Currently focused record id (controlled). */
  selectedRecordId?: string | null;
  /** Select callback. When omitted the panel manages selection internally. */
  onRecordSelect?: (recordId: string | null) => void;
  /**
   * Export handler. Receives the format + the full history slice. Consumer
   * is responsible for serialization (CSV / JSON) and download.
   */
  onExport?: (payload: DecisionRecordPanelExportPayload) => void | Promise<void>;
  /** Export formats offered. Defaults to ['csv', 'json']. */
  exportFormats?: ExportFormat[];
  emptyMessage?: React.ReactNode;
  className?: string;
}

const ACTION_LABEL: Record<ApprovalAction, string> = {
  approve: 'Onayladi',
  reject: 'Reddetti',
  delegate: 'Devretti',
  request_changes: 'Duzeltme istedi',
  attest: 'Beyan etti',
};

const ACTION_TONE: Record<ApprovalAction, BadgeVariant> = {
  approve: 'success',
  reject: 'danger',
  delegate: 'info',
  request_changes: 'warning',
  attest: 'primary',
};

const STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  pending: 'Beklemede',
  in_review: 'Inceleme',
  approved: 'Onaylandi',
  rejected: 'Reddedildi',
  withdrawn: 'Geri cekildi',
  expired: 'Suresi doldu',
};

export const DecisionRecordPanel = React.forwardRef<HTMLDivElement, DecisionRecordPanelProps>(
  (
    {
      history,
      request,
      selectedRecordId,
      onRecordSelect,
      onExport,
      exportFormats = ['csv', 'json'],
      emptyMessage = 'Henuz kayit yok.',
      className = '',
      access = 'full',
      accessReason,
    },
    ref,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const interactionBlocked = accessState.isDisabled || accessState.isReadonly;

    const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
    const effectiveSelectedId =
      selectedRecordId !== undefined ? selectedRecordId : internalSelectedId;

    const updateSelected = useCallback(
      (next: string | null) => {
        if (onRecordSelect) onRecordSelect(next);
        else setInternalSelectedId(next);
      },
      [onRecordSelect],
    );

    const selectedRecord = useMemo(
      () => history.find((r) => r.id === effectiveSelectedId) ?? null,
      [history, effectiveSelectedId],
    );

    const [exportOpen, setExportOpen] = useState(false);

    const handleExportConfirm = useCallback(
      async (options: { format: ExportFormat }) => {
        if (!onExport) {
          setExportOpen(false);
          return;
        }
        await onExport({ format: options.format, records: history });
        setExportOpen(false);
      },
      [history, onExport],
    );

    return (
      <div
        ref={ref}
        className={`flex flex-col gap-3 ${className}`.trim()}
        data-component="decision-record-panel"
        data-access-state={accessState.state}
        title={accessReason}
      >
        <header className="flex flex-wrap items-center justify-between gap-2" data-slot="header">
          <div className="flex flex-col">
            <Text as="h2" size="lg" weight="semibold">
              Karar kaydi
            </Text>
            {request ? (
              <Text variant="secondary" className="text-xs">
                {request.title} · {request.type}
              </Text>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="muted" size="sm">
              {history.length} kayit
            </Badge>
            {onExport ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setExportOpen(true)}
                disabled={interactionBlocked || history.length === 0}
              >
                Disa aktar
              </Button>
            ) : null}
          </div>
        </header>

        {history.length === 0 ? (
          <div
            className="rounded-lg border border-border-subtle bg-surface-canvas px-4 py-6 text-center"
            data-slot="empty"
          >
            <Text variant="secondary" className="text-sm">
              {emptyMessage}
            </Text>
          </div>
        ) : (
          <ol className="flex flex-col gap-2" data-slot="rows">
            {history.map((record) => {
              const isSelected = effectiveSelectedId === record.id;
              const actionLabel = ACTION_LABEL[record.action];
              const actionTone = ACTION_TONE[record.action];
              return (
                <li
                  key={record.id}
                  data-selected={isSelected ? 'true' : 'false'}
                  data-action={record.action}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    isSelected
                      ? 'border-action-primary-border bg-surface-panel'
                      : 'border-border-subtle bg-surface-canvas hover:bg-surface-muted'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateSelected(isSelected ? null : record.id)}
                    className="flex flex-1 items-start gap-3 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-action-primary/40 rounded-md"
                    aria-pressed={isSelected}
                    aria-label={`${record.actor.name} - ${actionLabel}`}
                  >
                    <Avatar
                      size="sm"
                      src={record.actor.avatarUrl}
                      initials={record.actor.initials}
                      alt={record.actor.name}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text weight="medium" className="text-sm">
                          {record.actor.name}
                        </Text>
                        {record.actorRole ? (
                          <Text variant="secondary" className="text-xs">
                            {record.actorRole}
                          </Text>
                        ) : null}
                        <Badge variant={actionTone} size="sm">
                          {actionLabel}
                        </Badge>
                        <Text variant="secondary" className="text-xs">
                          {STATUS_LABEL[record.previousStatus]} → {STATUS_LABEL[record.newStatus]}
                        </Text>
                        <Text variant="secondary" className="text-xs">
                          {record.timestamp}
                        </Text>
                      </div>
                      {record.reason ? (
                        <Text variant="secondary" className="mt-1 line-clamp-2 text-sm">
                          {record.reason}
                        </Text>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* ----- Focused detail ----- */}
        {selectedRecord ? (
          <section
            className="rounded-lg border border-action-primary-border bg-surface-panel px-4 py-3"
            data-slot="selected-detail"
            role="region"
            aria-label="Secili karar detayi"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text weight="semibold" className="text-sm">
                Karar detayi
              </Text>
              <Button type="button" size="sm" variant="ghost" onClick={() => updateSelected(null)}>
                Kapat
              </Button>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <Text as="dt" variant="secondary" className="text-xs">
                  Aksiyon
                </Text>
                <dd>
                  <Badge variant={ACTION_TONE[selectedRecord.action]} size="sm">
                    {ACTION_LABEL[selectedRecord.action]}
                  </Badge>
                </dd>
              </div>
              <div>
                <Text as="dt" variant="secondary" className="text-xs">
                  Aktor
                </Text>
                <dd>
                  {selectedRecord.actor.name}
                  {selectedRecord.actorRole ? ` · ${selectedRecord.actorRole}` : ''}
                </dd>
              </div>
              <div>
                <Text as="dt" variant="secondary" className="text-xs">
                  Durum gecisi
                </Text>
                <dd>
                  {STATUS_LABEL[selectedRecord.previousStatus]} →{' '}
                  {STATUS_LABEL[selectedRecord.newStatus]}
                </dd>
              </div>
              <div>
                <Text as="dt" variant="secondary" className="text-xs">
                  Zaman
                </Text>
                <dd className="font-mono text-xs">{selectedRecord.timestamp}</dd>
              </div>
              {selectedRecord.reason ? (
                <div className="sm:col-span-2">
                  <Text as="dt" variant="secondary" className="text-xs">
                    Gerekce
                  </Text>
                  <dd>{selectedRecord.reason}</dd>
                </div>
              ) : null}
              {selectedRecord.evidenceRefs && selectedRecord.evidenceRefs.length > 0 ? (
                <div className="sm:col-span-2">
                  <Text as="dt" variant="secondary" className="text-xs">
                    Kanit
                  </Text>
                  <dd className="flex flex-wrap gap-1.5">
                    {selectedRecord.evidenceRefs.map((ref) => (
                      <Badge key={ref} variant="muted" size="sm">
                        {ref}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ) : null}
              {selectedRecord.action === 'delegate' ? (
                <div className="sm:col-span-2">
                  <Text as="dt" variant="secondary" className="text-xs">
                    Devredilen
                  </Text>
                  <dd className="flex items-center gap-2">
                    <Avatar
                      size="sm"
                      src={selectedRecord.delegateTo.avatarUrl}
                      initials={selectedRecord.delegateTo.initials}
                      alt={selectedRecord.delegateTo.name}
                    />
                    <span>
                      {selectedRecord.delegateTo.name}
                      {selectedRecord.delegateTo.role ? ` · ${selectedRecord.delegateTo.role}` : ''}
                    </span>
                  </dd>
                </div>
              ) : null}
              {selectedRecord.action === 'attest' ? (
                <div className="sm:col-span-2">
                  <Text as="dt" variant="secondary" className="text-xs">
                    Beyan
                  </Text>
                  <dd className="text-sm">
                    {selectedRecord.attestation.statement}
                    <Text variant="secondary" className="mt-1 block text-xs">
                      Kabul: {selectedRecord.attestation.acceptedAt}
                    </Text>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* ----- Export dialog ----- */}
        {onExport ? (
          <DataExportDialog
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            onExport={handleExportConfirm}
            formats={exportFormats}
            scopes={['all']}
            defaultScope="all"
            recordCounts={{
              visible: history.length,
              all: history.length,
              selected: 0,
              filtered: history.length,
            }}
          />
        ) : null}
      </div>
    );
  },
);

DecisionRecordPanel.displayName = 'DecisionRecordPanel';

export default DecisionRecordPanel;
