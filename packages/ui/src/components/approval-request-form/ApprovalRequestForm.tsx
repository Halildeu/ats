import React, { useCallback, useMemo, useState } from 'react';
import { Steps, type StepItem } from '../steps/Steps';
import { Button } from '../../primitives/button/Button';
import { Text } from '../../primitives/text/Text';
import { Badge } from '../../primitives/badge/Badge';
import { useForm } from '../../form/useForm';
import { ConnectedInput } from '../../form/connected/ConnectedInput';
import { ConnectedTextarea } from '../../form/connected/ConnectedTextarea';
import { ConnectedSelect } from '../../form/connected/ConnectedSelect';
import { AssigneePicker } from '../assignee-picker';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
import type { ApprovalActor, ISODateString } from '../../types/approval';

export interface ApprovalRequestType {
  value: string;
  label: string;
  description?: string;
}

/**
 * Form payload — produced on `onSubmit`. Server-issued fields (`id`,
 * `createdAt`, `status`, `history`) are NOT part of the draft. Indexed
 * signature satisfies `useForm`'s `Record<string, unknown>` constraint
 * while keeping typed access at the property level.
 */
export interface ApprovalRequestDraft {
  type: string;
  title: string;
  target: string;
  reason: string;
  evidenceRefs: string[];
  deadline?: ISODateString;
  approvers: ApprovalActor[];
  [key: string]: unknown;
}

export interface ApprovalRequestFormProps extends AccessControlledProps {
  /** Pool of selectable approvers for the request. */
  candidates: ApprovalActor[];
  /** The current user creating the request. Filtered from approver candidates (4-eyes). */
  proposer: ApprovalActor;
  /** Predefined request types (e.g. policy-change, role-grant). */
  requestTypes: ApprovalRequestType[];
  /** Optional initial values when editing a draft. */
  initialValues?: Partial<ApprovalRequestDraft>;
  /** Submit handler — receives a validated draft. */
  onSubmit: (draft: ApprovalRequestDraft) => void | Promise<void>;
  /** Optional cancel callback. */
  onCancel?: () => void;
  /** Async-state guard — disables Submit / Next while in flight. */
  busy?: boolean;
  /** Additional class on the root element. */
  className?: string;
}

const STEP_IDS = ['basics', 'justification', 'approvers'] as const;
type StepId = (typeof STEP_IDS)[number];

const EMPTY_DRAFT: ApprovalRequestDraft = {
  type: '',
  title: '',
  target: '',
  reason: '',
  evidenceRefs: [],
  deadline: undefined,
  approvers: [],
};

function isFutureISODate(value: string | undefined): boolean {
  if (!value) return true; // optional — empty is OK
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return parsed > Date.now();
}

export const ApprovalRequestForm = React.forwardRef<HTMLFormElement, ApprovalRequestFormProps>(
  (
    {
      candidates,
      proposer,
      requestTypes,
      initialValues,
      onSubmit,
      onCancel,
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

    const defaultValues = useMemo<ApprovalRequestDraft>(
      () => ({
        ...EMPTY_DRAFT,
        ...initialValues,
        // Force-coerce missing arrays so connected inputs don't see undefined.
        evidenceRefs: initialValues?.evidenceRefs ?? [],
        approvers: initialValues?.approvers ?? [],
      }),
      // initialValues identity changes drive a fresh form; consumers can
      // memoize before passing if they want a stable reference.
      [initialValues],
    );

    const form = useForm<ApprovalRequestDraft>({
      defaultValues,
      mode: 'onChange',
      access,
    });

    const [currentStep, setCurrentStep] = useState<number>(0);
    const [evidenceDraft, setEvidenceDraft] = useState('');

    // Step validation — manual because useForm doesn't do per-step.
    const stepValidity: Record<StepId, boolean> = {
      basics: Boolean(
        form.values.type.trim() && form.values.title.trim() && form.values.target.trim(),
      ),
      justification: Boolean(form.values.reason.trim()),
      approvers: form.values.approvers.length > 0 && isFutureISODate(form.values.deadline),
    };

    const isCurrentStepValid = stepValidity[STEP_IDS[currentStep]];
    const isFullyValid = STEP_IDS.every((id) => stepValidity[id]);

    const handleNext = useCallback(() => {
      if (!isCurrentStepValid || interactionBlocked || busy) return;
      setCurrentStep((s) => Math.min(s + 1, STEP_IDS.length - 1));
    }, [busy, interactionBlocked, isCurrentStepValid]);

    const handlePrev = useCallback(() => {
      if (interactionBlocked || busy) return;
      setCurrentStep((s) => Math.max(s - 1, 0));
    }, [busy, interactionBlocked]);

    const handleAddEvidence = useCallback(() => {
      const trimmed = evidenceDraft.trim();
      if (!trimmed) return;
      const next = [...form.values.evidenceRefs, trimmed];
      form.setFieldValue('evidenceRefs', next);
      setEvidenceDraft('');
    }, [evidenceDraft, form]);

    const handleRemoveEvidence = useCallback(
      (index: number) => {
        const next = form.values.evidenceRefs.filter((_, i) => i !== index);
        form.setFieldValue('evidenceRefs', next);
      },
      [form],
    );

    const handleSubmit = form.handleSubmit(async (values) => {
      await onSubmit(values);
    });

    const stepItems: StepItem[] = STEP_IDS.map((id, index) => ({
      key: id,
      title: stepTitle(id),
      description: stepDescription(id),
      status: index < currentStep ? 'finish' : index === currentStep ? 'process' : 'wait',
    }));

    const requestTypeOptions = useMemo(
      () => requestTypes.map((t) => ({ value: t.value, label: t.label })),
      [requestTypes],
    );

    return (
      <form.FormProvider>
        <form
          ref={ref}
          className={`flex flex-col gap-5 ${className}`.trim()}
          data-component="approval-request-form"
          data-current-step={STEP_IDS[currentStep]}
          data-access-state={accessState.state}
          title={accessReason}
          onSubmit={handleSubmit}
        >
          <Steps items={stepItems} current={currentStep} direction="horizontal" />

          {/* ----- Step 1: Basics ----- */}
          {STEP_IDS[currentStep] === 'basics' ? (
            <div className="flex flex-col gap-3" data-slot="step-basics">
              <label className="flex flex-col gap-1.5">
                <Text as="span" weight="medium" className="text-sm">
                  Talep tipi
                </Text>
                <ConnectedSelect
                  name="type"
                  options={requestTypeOptions}
                  placeholder="Tip sec..."
                  disabled={interactionBlocked}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <Text as="span" weight="medium" className="text-sm">
                  Baslik
                </Text>
                <ConnectedInput
                  name="title"
                  placeholder="Kisa, anlamli bir baslik..."
                  disabled={interactionBlocked}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <Text as="span" weight="medium" className="text-sm">
                  Hedef
                </Text>
                <ConnectedInput
                  name="target"
                  placeholder="Etkilenen kaynak / policy / cluster..."
                  disabled={interactionBlocked}
                  required
                />
              </label>
            </div>
          ) : null}

          {/* ----- Step 2: Justification ----- */}
          {STEP_IDS[currentStep] === 'justification' ? (
            <div className="flex flex-col gap-3" data-slot="step-justification">
              <label className="flex flex-col gap-1.5">
                <Text as="span" weight="medium" className="text-sm">
                  Gerekce
                </Text>
                <ConnectedTextarea
                  name="reason"
                  placeholder="Bu degisikligin neden gerektigini acikla..."
                  rows={4}
                  disabled={interactionBlocked}
                  required
                />
              </label>
              <div className="flex flex-col gap-2">
                <Text as="label" weight="medium" className="text-sm">
                  Kanit referanslari
                </Text>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={evidenceDraft}
                    onChange={(event) => setEvidenceDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddEvidence();
                      }
                    }}
                    placeholder="URL / PR # / kanit ID..."
                    className="h-10 flex-1 rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm focus:outline-hidden focus:border-action-primary"
                    disabled={interactionBlocked}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddEvidence}
                    disabled={!evidenceDraft.trim() || interactionBlocked}
                  >
                    Ekle
                  </Button>
                </div>
                {form.values.evidenceRefs.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {form.values.evidenceRefs.map((ref, index) => (
                      <span
                        key={`${ref}-${index}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-default px-2.5 py-1 text-xs text-text-primary"
                      >
                        <span>{ref}</span>
                        {!interactionBlocked && (
                          <button
                            type="button"
                            aria-label={`${ref} kanit kaldir`}
                            onClick={() => handleRemoveEvidence(index)}
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-muted"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <Text variant="secondary" className="text-xs">
                    Henuz kanit eklenmedi (istege bagli).
                  </Text>
                )}
              </div>
            </div>
          ) : null}

          {/* ----- Step 3: Approvers + Deadline ----- */}
          {STEP_IDS[currentStep] === 'approvers' ? (
            <div className="flex flex-col gap-3" data-slot="step-approvers">
              <div className="flex flex-col gap-1">
                <Text as="label" weight="medium" className="text-sm">
                  Onaylayanlar (en az 1)
                </Text>
                <AssigneePicker
                  mode="multi"
                  candidates={candidates}
                  value={form.values.approvers}
                  onChange={(next) => form.setFieldValue('approvers', next)}
                  excludeIds={[proposer.id]}
                  placeholder="Onaylayan ekle..."
                  disabled={interactionBlocked}
                />
                {form.values.approvers.length === 0 ? (
                  <Text variant="secondary" className="text-xs text-state-warning-text">
                    En az bir onaylayan secmelisin.
                  </Text>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <Text as="label" weight="medium" className="text-sm">
                  Son tarih (istege bagli)
                </Text>
                <input
                  type="date"
                  value={form.values.deadline ?? ''}
                  onChange={(event) =>
                    form.setFieldValue('deadline', event.target.value || undefined)
                  }
                  className="h-10 rounded-lg border border-border-subtle bg-surface-canvas px-3 text-sm focus:outline-hidden focus:border-action-primary"
                  disabled={interactionBlocked}
                />
                {form.values.deadline && !isFutureISODate(form.values.deadline) ? (
                  <Text variant="secondary" className="text-xs text-state-danger-text">
                    Son tarih gelecekte olmalidir.
                  </Text>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ----- Navigation footer ----- */}
          <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
            <div className="flex items-center gap-2">
              <Badge variant="muted" size="sm">
                {currentStep + 1} / {STEP_IDS.length}
              </Badge>
              {!isCurrentStepValid ? (
                <Text variant="secondary" className="text-xs">
                  Devam etmek icin gerekli alanlari doldur.
                </Text>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {onCancel ? (
                <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
                  Iptal
                </Button>
              ) : null}
              {currentStep > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePrev}
                  disabled={busy || interactionBlocked}
                >
                  Geri
                </Button>
              ) : null}
              {currentStep < STEP_IDS.length - 1 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={!isCurrentStepValid || busy || interactionBlocked}
                >
                  Devam et
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!isFullyValid || busy || interactionBlocked || form.isSubmitting}
                  loading={busy || form.isSubmitting}
                >
                  Talebi gonder
                </Button>
              )}
            </div>
          </div>
        </form>
      </form.FormProvider>
    );
  },
);

ApprovalRequestForm.displayName = 'ApprovalRequestForm';

function stepTitle(id: StepId): string {
  switch (id) {
    case 'basics':
      return 'Temel bilgiler';
    case 'justification':
      return 'Gerekce ve kanit';
    case 'approvers':
      return 'Onaylayanlar';
  }
}

function stepDescription(id: StepId): string {
  switch (id) {
    case 'basics':
      return 'Tip, baslik ve hedef';
    case 'justification':
      return 'Aciklama ve referanslar';
    case 'approvers':
      return 'Aday seçimi ve vade';
  }
}

export default ApprovalRequestForm;
