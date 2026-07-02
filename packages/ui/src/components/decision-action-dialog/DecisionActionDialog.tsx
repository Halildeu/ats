import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, type DialogSize } from '../../primitives/dialog/Dialog';
import { Button } from '../../primitives/button/Button';
import { Textarea } from '../../primitives/input/Textarea';
import { Select, type SelectOption } from '../../primitives/select/Select';
import { Checkbox } from '../../primitives/checkbox/Checkbox';
import { Text } from '../../primitives/text/Text';
import { Badge } from '../../primitives/badge/Badge';
import { AssigneePicker } from '../assignee-picker';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import type { ApprovalAction, ApprovalActor, DecisionAttestation } from '../../types/approval';

export type DecisionActionConfirmPayload =
  | { action: 'approve'; reason?: string }
  | { action: 'reject'; reason: string; presetCode?: string }
  | { action: 'delegate'; delegateTo: ApprovalActor; reason?: string }
  | { action: 'request_changes'; reason: string }
  | { action: 'attest'; reason?: string; attestation: DecisionAttestation };

export interface DecisionActionDialogRequestSummary {
  title: string;
  target: string;
  type: string;
}

export interface DecisionActionPresetReason {
  code: string;
  label: string;
}

export interface DecisionActionDialogProps extends AccessControlledProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Action mode — drives body fields and confirm label. */
  mode: ApprovalAction;
  /** Header summary: request title + target + type. */
  requestSummary: DecisionActionDialogRequestSummary;
  /** Preset reason options shown in a Select (mainly for `reject`). */
  presetReasons?: DecisionActionPresetReason[];
  /**
   * Force-require reason text. Defaults:
   *   - reject, request_changes → true
   *   - approve, delegate, attest → false
   */
  requireReason?: boolean;
  /** Delegate-mode candidate pool. Required when `mode='delegate'`. */
  candidates?: ApprovalActor[];
  /** Actor IDs filtered out of `candidates` (4-eyes). */
  excludeIds?: string[];
  /**
   * Attestation statement displayed and accepted in `attest` mode. Required
   * when `mode='attest'`.
   */
  attestationStatement?: string;
  /** Confirm handler — receives action-specific payload. */
  onConfirm: (payload: DecisionActionConfirmPayload) => void;
  /** Cancel / close handler. */
  onCancel: () => void;
  /** Disable confirm while async work is in flight. */
  busy?: boolean;
  /** Dialog size. @default 'md' */
  size?: DialogSize;
  /** Additional CSS class for the dialog root. */
  className?: string;
}

const modeMeta: Record<
  ApprovalAction,
  { titleKey: string; verb: string; tone: 'primary' | 'danger' | 'secondary' }
> = {
  approve: { titleKey: 'Onayla', verb: 'Onayla', tone: 'primary' },
  reject: { titleKey: 'Reddet', verb: 'Reddet', tone: 'danger' },
  delegate: { titleKey: 'Devret', verb: 'Devret', tone: 'secondary' },
  request_changes: {
    titleKey: 'Duzeltme Iste',
    verb: 'Duzeltme Iste',
    tone: 'secondary',
  },
  attest: { titleKey: 'Beyan Et', verb: 'Beyan Et', tone: 'primary' },
};

function defaultRequireReason(mode: ApprovalAction): boolean {
  return mode === 'reject' || mode === 'request_changes';
}

export const DecisionActionDialog = React.forwardRef<HTMLDialogElement, DecisionActionDialogProps>(
  (
    {
      open,
      mode,
      requestSummary,
      presetReasons = [],
      requireReason,
      candidates = [],
      excludeIds = [],
      attestationStatement,
      onConfirm,
      onCancel,
      busy = false,
      size = 'md',
      className = '',
      access = 'full',
      accessReason,
    },
    forwardedRef,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const interactionBlocked = accessState.isDisabled || accessState.isReadonly;

    const needsReason = requireReason ?? defaultRequireReason(mode);

    const [reason, setReason] = useState('');
    const [presetCode, setPresetCode] = useState<string>('');
    const [delegateTo, setDelegateTo] = useState<ApprovalActor | null>(null);
    const [attestationAccepted, setAttestationAccepted] = useState(false);

    // Reset on open / mode change
    useEffect(() => {
      if (open) {
        setReason('');
        setPresetCode('');
        setDelegateTo(null);
        setAttestationAccepted(false);
      }
    }, [open, mode]);

    const presetOptions: SelectOption[] = useMemo(
      () => [...presetReasons.map((r) => ({ value: r.code, label: r.label }))],
      [presetReasons],
    );

    const isValid = useMemo(() => {
      if (interactionBlocked) return false;
      switch (mode) {
        case 'approve':
          return needsReason ? reason.trim().length > 0 : true;
        case 'reject':
          return reason.trim().length > 0;
        case 'request_changes':
          return reason.trim().length > 0;
        case 'delegate':
          return delegateTo !== null && (!needsReason || reason.trim().length > 0);
        case 'attest':
          return (
            attestationAccepted &&
            Boolean(attestationStatement?.trim()) &&
            (!needsReason || reason.trim().length > 0)
          );
        default:
          return false;
      }
    }, [
      mode,
      needsReason,
      reason,
      delegateTo,
      attestationAccepted,
      attestationStatement,
      interactionBlocked,
    ]);

    const handleConfirm = useCallback(() => {
      if (!isValid || busy) return;
      switch (mode) {
        case 'approve':
          onConfirm({
            action: 'approve',
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          });
          return;
        case 'reject':
          onConfirm({
            action: 'reject',
            reason: reason.trim(),
            ...(presetCode ? { presetCode } : {}),
          });
          return;
        case 'request_changes':
          onConfirm({
            action: 'request_changes',
            reason: reason.trim(),
          });
          return;
        case 'delegate':
          if (!delegateTo) return;
          onConfirm({
            action: 'delegate',
            delegateTo,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          });
          return;
        case 'attest':
          if (!attestationAccepted || !attestationStatement) return;
          onConfirm({
            action: 'attest',
            ...(reason.trim() ? { reason: reason.trim() } : {}),
            attestation: {
              statement: attestationStatement,
              acceptedAt: new Date().toISOString(),
            },
          });
          return;
      }
    }, [
      attestationAccepted,
      attestationStatement,
      busy,
      delegateTo,
      isValid,
      mode,
      onConfirm,
      presetCode,
      reason,
    ]);

    const meta = modeMeta[mode];

    const renderBody = () => {
      switch (mode) {
        case 'approve':
          return (
            <Textarea
              label={needsReason ? 'Onay aciklamasi (gerekli)' : 'Onay aciklamasi (istege bagli)'}
              placeholder="Karar gerekcesini yaz..."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              disabled={interactionBlocked}
            />
          );
        case 'reject':
          return (
            <div className="flex flex-col gap-3">
              {presetReasons.length > 0 ? (
                <label className="flex flex-col gap-1.5">
                  <Text as="span" variant="secondary" className="text-xs">
                    Hazir gerekce
                  </Text>
                  <Select
                    options={presetOptions}
                    value={presetCode}
                    onChange={(event) => setPresetCode(event.target.value)}
                    placeholder="Bir gerekce sec..."
                    disabled={interactionBlocked}
                  />
                </label>
              ) : null}
              <Textarea
                label="Aciklama (gerekli)"
                placeholder="Red gerekcesini detaylandir..."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                disabled={interactionBlocked}
                required
              />
            </div>
          );
        case 'request_changes':
          return (
            <Textarea
              label="Duzeltme talep notu (gerekli)"
              placeholder="Hangi degisiklikleri bekledigini yaz..."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              disabled={interactionBlocked}
              required
            />
          );
        case 'delegate':
          return (
            <div className="flex flex-col gap-3">
              <AssigneePicker
                mode="single"
                candidates={candidates}
                excludeIds={excludeIds}
                value={delegateTo}
                onChange={setDelegateTo}
                placeholder="Yeni onaylayan sec..."
                disabled={interactionBlocked}
                showRole
              />
              <Textarea
                label={needsReason ? 'Devir notu (gerekli)' : 'Devir notu (istege bagli)'}
                placeholder="Neden devrediliyor..."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                disabled={interactionBlocked}
                required={needsReason}
              />
            </div>
          );
        case 'attest':
          return (
            <div className="flex flex-col gap-3">
              {attestationStatement ? (
                <div className="rounded-lg border border-border-subtle bg-surface-muted p-3 text-sm text-text-primary">
                  <Text variant="secondary" className="text-xs">
                    Beyan metni
                  </Text>
                  <Text className="mt-1 block leading-6">{attestationStatement}</Text>
                </div>
              ) : null}
              <Checkbox
                checked={attestationAccepted}
                onChange={(event) => setAttestationAccepted(event.target.checked)}
                label="Yukaridaki beyani okudum ve kabul ediyorum"
                disabled={interactionBlocked}
              />
              <Textarea
                label="Ek aciklama (istege bagli)"
                placeholder="Beyana eklemek istediklerin..."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                disabled={interactionBlocked}
              />
            </div>
          );
      }
    };

    return (
      <div
        data-component="decision-action-dialog"
        data-mode={mode}
        data-access-state={accessState.state}
        className={className}
        title={accessReason}
      >
        <Dialog
          ref={forwardedRef}
          open={open}
          onClose={onCancel}
          size={size}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>{meta.titleKey}</span>
              <Badge variant="muted" size="sm">
                {requestSummary.type}
              </Badge>
            </span>
          }
          description={
            <span className="flex flex-col">
              <Text className="font-medium text-text-primary">{requestSummary.title}</Text>
              <Text variant="secondary" className="text-sm">
                {requestSummary.target}
              </Text>
            </span>
          }
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onCancel} disabled={busy} aria-label="Iptal">
                Iptal
              </Button>
              <Button
                variant={meta.tone === 'danger' ? 'danger' : 'primary'}
                onClick={handleConfirm}
                disabled={!isValid || busy}
                aria-label={meta.verb}
                loading={busy}
              >
                {meta.verb}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-3" data-slot="body">
            {renderBody()}
          </div>
        </Dialog>
      </div>
    );
  },
);

DecisionActionDialog.displayName = 'DecisionActionDialog';

export default DecisionActionDialog;
