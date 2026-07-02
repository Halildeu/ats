import React, { useCallback, useMemo, useState } from 'react';
import {
  DecisionActionDialog,
  type DecisionActionConfirmPayload,
  type DecisionActionPresetReason,
} from '../decision-action-dialog';
import { ApprovalEligibilityGuard } from '../approval-eligibility-guard';
import { CommentThread, type Comment } from '../../blocks/comment-thread/CommentThread';
import { Avatar } from '../../primitives/avatar/Avatar';
import { AvatarGroup } from '../avatar-group';
import { Badge, type BadgeVariant } from '../../primitives/badge/Badge';
import { Button } from '../../primitives/button/Button';
import { Text } from '../../primitives/text/Text';
import { JsonViewer } from '../json-viewer';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import type {
  ApprovalAction,
  ApprovalActor,
  ApprovalRequest,
  ApprovalRequestStatus,
  EligibilityReason,
} from '../../types/approval';

export interface ApprovalCaseViewDiff {
  before: unknown;
  after: unknown;
  beforeLabel?: string;
  afterLabel?: string;
}

export interface ApprovalCaseViewProps extends AccessControlledProps {
  request: ApprovalRequest;
  currentUser: ApprovalActor;
  /**
   * Consumer-supplied eligibility resolver. Overrides the built-in
   * `proposer_self` 4-eyes check so a domain consumer (e.g. endpoint-admin)
   * can return its own reason set (`role_insufficient`, `tier_mismatch`, …)
   * and have it surface in the eligibility banner + disable the footer
   * action buttons. When omitted, the default proposer_self compute is used.
   */
  getEligibilityReasons?: (
    request: ApprovalRequest,
    currentUser: ApprovalActor,
  ) => EligibilityReason[];
  /** Optional comment thread entries; rendered when provided. */
  comments?: Comment[];
  /** Reply callback for CommentThread (parentId 'root' for top-level). */
  onCommentReply?: (parentId: string, content: string) => void;
  /** Side-by-side Before/After JSON snapshots. Not a semantic diff. */
  diff?: ApprovalCaseViewDiff;
  /** Approver candidate pool for the delegate action. */
  delegateCandidates?: ApprovalActor[];
  /** Attestation statement; when present, approve mode auto-switches to attest. */
  attestationStatement?: string;
  /** Reject mode preset reasons surfaced in the action dialog. */
  presetRejectReasons?: DecisionActionPresetReason[];
  /** Action handlers — each receives the validated discriminated payload. */
  onApprove?: (
    payload: Extract<DecisionActionConfirmPayload, { action: 'approve' }>,
  ) => void | Promise<void>;
  onReject?: (
    payload: Extract<DecisionActionConfirmPayload, { action: 'reject' }>,
  ) => void | Promise<void>;
  onDelegate?: (
    payload: Extract<DecisionActionConfirmPayload, { action: 'delegate' }>,
  ) => void | Promise<void>;
  onRequestChanges?: (
    payload: Extract<DecisionActionConfirmPayload, { action: 'request_changes' }>,
  ) => void | Promise<void>;
  onAttest?: (
    payload: Extract<DecisionActionConfirmPayload, { action: 'attest' }>,
  ) => void | Promise<void>;
  /** Audit telemetry hook fired when a blocked footer action is intercepted. */
  onEligibilityBlocked?: (info: { reasons: EligibilityReason[] }) => void;
  /** Async-state guard for dialog confirm + footer buttons. */
  busy?: boolean;
  className?: string;
}

const STATUS_TONE: Record<ApprovalRequestStatus, BadgeVariant> = {
  pending: 'warning',
  in_review: 'info',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'muted',
  expired: 'muted',
};

const STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  pending: 'Beklemede',
  in_review: 'Inceleme',
  approved: 'Onaylandi',
  rejected: 'Reddedildi',
  withdrawn: 'Geri cekildi',
  expired: 'Suresi doldu',
};

const ACTION_LABEL: Record<ApprovalAction, string> = {
  approve: 'Onaylandi',
  reject: 'Reddedildi',
  delegate: 'Devredildi',
  request_changes: 'Duzeltme istendi',
  attest: 'Beyan edildi',
};

function formatAge(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return iso;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'az once';
  if (mins < 60) return `${mins} dk once`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa once`;
  const days = Math.floor(hrs / 24);
  return `${days} gn once`;
}

function deadlineLabel(iso: string | undefined): {
  text: string;
  tone: BadgeVariant;
} | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms < 0) {
    return { text: 'Vade gecti', tone: 'danger' };
  }
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return { text: `${mins} dk kaldi`, tone: 'warning' };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { text: `${hrs} sa kaldi`, tone: 'warning' };
  const days = Math.floor(hrs / 24);
  return { text: `${days} gn kaldi`, tone: 'info' };
}

function computeEligibility(
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

export const ApprovalCaseView = React.forwardRef<HTMLDivElement, ApprovalCaseViewProps>(
  (
    {
      request,
      currentUser,
      getEligibilityReasons,
      comments,
      onCommentReply,
      diff,
      delegateCandidates = [],
      attestationStatement,
      presetRejectReasons = [],
      onApprove,
      onReject,
      onDelegate,
      onRequestChanges,
      onAttest,
      onEligibilityBlocked,
      busy = false,
      className = '',
      access = 'full',
      accessReason,
    },
    ref,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const interactionBlocked = accessState.isDisabled || accessState.isReadonly;

    const [decisionMode, setDecisionMode] = useState<ApprovalAction | null>(null);

    const eligibilityReasons = useMemo(
      () =>
        getEligibilityReasons
          ? getEligibilityReasons(request, currentUser)
          : computeEligibility(request, currentUser),
      [getEligibilityReasons, request, currentUser],
    );
    const isEligible = eligibilityReasons.length === 0 && !interactionBlocked;

    const deadline = useMemo(() => deadlineLabel(request.deadline), [request.deadline]);

    const handleConfirm = useCallback(
      (payload: DecisionActionConfirmPayload) => {
        setDecisionMode(null);
        switch (payload.action) {
          case 'approve':
            onApprove?.(payload);
            return;
          case 'reject':
            onReject?.(payload);
            return;
          case 'delegate':
            onDelegate?.(payload);
            return;
          case 'request_changes':
            onRequestChanges?.(payload);
            return;
          case 'attest':
            onAttest?.(payload);
            return;
        }
      },
      [onApprove, onReject, onDelegate, onRequestChanges, onAttest],
    );

    const primaryAction: ApprovalAction = attestationStatement ? 'attest' : 'approve';
    const primaryLabel = attestationStatement ? 'Beyan et' : 'Onayla';

    return (
      <div
        ref={ref}
        className={`flex flex-col gap-5 ${className}`.trim()}
        data-component="approval-case-view"
        data-access-state={accessState.state}
        data-status={request.status}
        title={accessReason}
      >
        {/* ----- Header ----- */}
        <header className="flex flex-col gap-3" data-slot="header">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
            <Badge variant="muted" size="sm">
              {request.type}
            </Badge>
            {deadline ? (
              <Badge variant={deadline.tone} size="sm">
                {deadline.text}
              </Badge>
            ) : null}
            <Text variant="secondary" className="text-xs">
              {formatAge(request.createdAt)}
            </Text>
          </div>
          <Text as="h1" size="2xl" weight="semibold">
            {request.title}
          </Text>
          <Text variant="secondary" className="text-sm">
            {request.target}
          </Text>
          <div className="flex items-center gap-2">
            <Avatar
              size="sm"
              src={request.proposer.avatarUrl}
              initials={request.proposer.initials}
              alt={request.proposer.name}
            />
            <Text variant="secondary" className="text-sm">
              Talep eden: {request.proposer.name}
              {request.proposer.role ? ` · ${request.proposer.role}` : ''}
            </Text>
          </div>
        </header>

        {/* ----- Metadata strip ----- */}
        <section
          className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border-subtle bg-surface-canvas px-4 py-3"
          data-slot="metadata"
        >
          <div className="flex flex-col gap-0.5">
            <Text variant="secondary" className="text-xs">
              Talep ID
            </Text>
            <Text className="font-mono text-sm">{request.id}</Text>
          </div>
          <div className="flex flex-col gap-0.5">
            <Text variant="secondary" className="text-xs">
              Olusturuldu
            </Text>
            <Text className="text-sm">{request.createdAt}</Text>
          </div>
          {request.currentApprovers.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <Text variant="secondary" className="text-xs">
                Onaylayanlar
              </Text>
              <AvatarGroup
                items={request.currentApprovers.map((actor) => ({
                  key: actor.id,
                  src: actor.avatarUrl,
                  name: actor.name,
                }))}
                size="sm"
                max={4}
              />
            </div>
          ) : null}
        </section>

        {/* ----- Reason + Evidence ----- */}
        <section className="flex flex-col gap-2" data-slot="reason">
          <Text as="h2" size="lg" weight="semibold">
            Gerekce
          </Text>
          <Text className="leading-7">{request.reason}</Text>
          {request.evidenceRefs && request.evidenceRefs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5" data-slot="evidence">
              {request.evidenceRefs.map((ref) => (
                <Badge key={ref} variant="muted" size="sm">
                  {ref}
                </Badge>
              ))}
            </div>
          ) : (
            <Text variant="secondary" className="text-xs">
              Henuz kanit eklenmedi.
            </Text>
          )}
        </section>

        {/* ----- Optional Diff (side-by-side JSON snapshots) ----- */}
        {diff ? (
          <section className="flex flex-col gap-2" data-slot="diff">
            <Text as="h2" size="lg" weight="semibold">
              Onceki ve sonraki durum (snapshot karsilastirma)
            </Text>
            <Text variant="secondary" className="text-xs">
              Bu panel semantic diff degildir; salt JSON snapshot karsilastirmasi.
            </Text>
            <div className="grid gap-3 lg:grid-cols-2">
              <JsonViewer
                value={diff.before}
                title={diff.beforeLabel ?? 'Onceki'}
                defaultExpandedDepth={2}
                showTypes
              />
              <JsonViewer
                value={diff.after}
                title={diff.afterLabel ?? 'Sonraki'}
                defaultExpandedDepth={2}
                showTypes
              />
            </div>
          </section>
        ) : null}

        {/* ----- History timeline ----- */}
        {request.history.length > 0 ? (
          <section className="flex flex-col gap-2" data-slot="history">
            <Text as="h2" size="lg" weight="semibold">
              Karar gecmisi
            </Text>
            <ol className="flex flex-col gap-2">
              {request.history.map((record) => (
                <li
                  key={record.id}
                  className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-canvas px-3 py-2"
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
                      <Badge variant="muted" size="sm">
                        {ACTION_LABEL[record.action]}
                      </Badge>
                      <Text variant="secondary" className="text-xs">
                        {record.timestamp}
                      </Text>
                    </div>
                    {record.reason ? (
                      <Text variant="secondary" className="mt-1 text-sm">
                        {record.reason}
                      </Text>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* ----- Optional Comments ----- */}
        {comments ? (
          <section className="flex flex-col gap-2" data-slot="comments">
            <Text as="h2" size="lg" weight="semibold">
              Yorumlar
            </Text>
            <CommentThread
              comments={comments}
              onReply={onCommentReply}
              currentUser={{
                name: currentUser.name,
                avatar: currentUser.avatarUrl,
              }}
            />
          </section>
        ) : null}

        {/* ----- Sticky action footer ----- */}
        <footer
          className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-default px-3 py-3"
          data-slot="footer"
        >
          <ApprovalEligibilityGuard
            reasons={eligibilityReasons}
            variant="banner"
            onBlocked={onEligibilityBlocked}
            bannerTitle="Bu talep icin yetkin yok"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={primaryAction === 'attest' ? 'primary' : 'primary'}
                onClick={() => setDecisionMode(primaryAction)}
                disabled={!isEligible || busy}
              >
                {primaryLabel}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => setDecisionMode('reject')}
                disabled={!isEligible || busy}
              >
                Reddet
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDecisionMode('request_changes')}
                disabled={!isEligible || busy}
              >
                Duzeltme iste
              </Button>
              {delegateCandidates.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setDecisionMode('delegate')}
                  disabled={!isEligible || busy}
                >
                  Devret
                </Button>
              ) : null}
            </div>
          </ApprovalEligibilityGuard>
        </footer>

        {/* ----- Single DecisionActionDialog (mode-driven) ----- */}
        {decisionMode !== null ? (
          <DecisionActionDialog
            open
            mode={decisionMode}
            requestSummary={{
              title: request.title,
              target: request.target,
              type: request.type,
            }}
            presetReasons={decisionMode === 'reject' ? presetRejectReasons : undefined}
            candidates={decisionMode === 'delegate' ? delegateCandidates : undefined}
            excludeIds={
              decisionMode === 'delegate' ? [currentUser.id, request.proposer.id] : undefined
            }
            attestationStatement={decisionMode === 'attest' ? attestationStatement : undefined}
            onConfirm={handleConfirm}
            onCancel={() => setDecisionMode(null)}
            busy={busy}
          />
        ) : null}
      </div>
    );
  },
);

ApprovalCaseView.displayName = 'ApprovalCaseView';

export default ApprovalCaseView;
