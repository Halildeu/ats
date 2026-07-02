/**
 * Shared domain types for approval / governance workflows.
 *
 * Consumed by the approval foundation primitives (PR-1):
 *   - AssigneePicker
 *   - DecisionActionDialog
 *   - ApprovalEligibilityGuard
 *
 * The legacy `ApprovalAssignee` exported by `blocks/approval-workflow` is
 * intentionally kept separate for backward compatibility. New primitives use
 * `ApprovalActor`, which adds `role` / `email` while keeping the legacy
 * `initials` field optional.
 */

export type ISODateString = string;

export type ApprovalAction = 'approve' | 'reject' | 'delegate' | 'request_changes' | 'attest';

export type ApprovalRequestStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

export interface ApprovalActor {
  id: string;
  name: string;
  avatarUrl?: string;
  initials?: string;
  role?: string;
  email?: string;
}

export type EligibilityReasonCode =
  | 'proposer_self'
  | 'role_insufficient'
  | 'delegate_conflict'
  | 'tier_mismatch'
  | 'self_dealing'
  | 'custom';

export interface EligibilityReason {
  code: EligibilityReasonCode;
  message: string;
  helpUrl?: string;
}

export interface DecisionAttestation {
  statement: string;
  acceptedAt: ISODateString;
}

interface DecisionRecordBase {
  id: string;
  actor: ApprovalActor;
  actorRole: string;
  reason?: string;
  evidenceRefs?: string[];
  previousStatus: ApprovalRequestStatus;
  newStatus: ApprovalRequestStatus;
  timestamp: ISODateString;
}

/**
 * Discriminated union by `action`. Mode-specific required fields are
 * enforced at the type level so consumers (DecisionRecordPanel, audit
 * exports) cannot construct an incomplete `delegate` or `attest` record.
 */
export type DecisionRecord =
  | (DecisionRecordBase & { action: 'approve' })
  | (DecisionRecordBase & { action: 'reject' })
  | (DecisionRecordBase & { action: 'request_changes' })
  | (DecisionRecordBase & { action: 'delegate'; delegateTo: ApprovalActor })
  | (DecisionRecordBase & { action: 'attest'; attestation: DecisionAttestation });

export interface ApprovalRequest {
  id: string;
  type: string;
  /** Human-readable title for inbox / dialog / case-view headers. */
  title: string;
  target: string;
  proposer: ApprovalActor;
  reason: string;
  evidenceRefs?: string[];
  createdAt: ISODateString;
  deadline?: ISODateString;
  status: ApprovalRequestStatus;
  currentApprovers: ApprovalActor[];
  history: DecisionRecord[];
}
