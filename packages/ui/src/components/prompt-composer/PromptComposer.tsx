import React from "react";
import { Badge } from "../../primitives/badge/Badge";
import { Button } from "../../primitives/button/Button";
import { Text } from "../../primitives/text/Text";
import { TextArea } from "../../primitives/input/Textarea";
import { TextInput } from "../../primitives/input/Input";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

export type PromptComposerScope = "general" | "approval" | "policy" | "release";
export type PromptComposerTone = "neutral" | "strict" | "exploratory";

/**
 * PromptComposer provides a structured prompt authoring surface with
 * scope selection, tone control, guardrail badges, and source anchors.
 * @example
 * ```tsx
 * <PromptComposer />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/prompt-composer)

 */
export interface PromptComposerProps extends AccessControlledProps {
  /** Section heading. @default "Prompt olusturucu" */
  title?: React.ReactNode;
  /** Explanatory text below the title. */
  description?: React.ReactNode;
  /** Controlled prompt subject/title value. */
  subject?: string;
  /** Initial subject for uncontrolled mode. */
  defaultSubject?: string;
  /** Callback fired when the subject changes. */
  onSubjectChange?: (value: string) => void;
  /** Controlled prompt body value. */
  value?: string;
  /** Initial body for uncontrolled mode. */
  defaultValue?: string;
  /** Callback fired when the body text changes. */
  onValueChange?: (value: string) => void;
  /** Controlled scope selection. */
  scope?: PromptComposerScope;
  /** Initial scope for uncontrolled mode. @default "general" */
  defaultScope?: PromptComposerScope;
  /** Callback fired when the scope changes. */
  onScopeChange?: (value: PromptComposerScope) => void;
  /** Controlled tone selection. */
  tone?: PromptComposerTone;
  /** Initial tone for uncontrolled mode. @default "neutral" */
  defaultTone?: PromptComposerTone;
  /** Callback fired when the tone changes. */
  onToneChange?: (value: PromptComposerTone) => void;
  /** Maximum character count for the prompt body. @default 1200 */
  maxLength?: number;
  /** List of guardrail labels shown as warning badges. */
  guardrails?: string[];
  /** List of source anchor labels shown as reference badges. */
  citations?: string[];
  /** Optional footer note rendered below the side panel. */
  footerNote?: React.ReactNode;
  /** Additional CSS class name. */
  className?: string;
}

const scopeOptions: PromptComposerScope[] = [
  "general",
  "approval",
  "policy",
  "release",
];
const toneOptions: PromptComposerTone[] = ["neutral", "strict", "exploratory"];

export const PromptComposer = React.forwardRef<HTMLDivElement, PromptComposerProps>(({
  title = "Prompt olusturucu",
  description = "Scope-safe prompt yazimi, tone guardrail ve source referanslari ayni composer yuzeyinde birlesir.",
  subject,
  defaultSubject = "",
  onSubjectChange,
  value,
  defaultValue = "",
  onValueChange,
  scope,
  defaultScope = "general",
  onScopeChange,
  tone,
  defaultTone = "neutral",
  onToneChange,
  maxLength = 1200,
  guardrails = [],
  citations = [],
  footerNote,
  className = "",
  access = "full",
  accessReason,
}, _ref) => {
  const accessState = resolveAccessState(access);
  const [internalSubject, setInternalSubject] = React.useState(defaultSubject);
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const [internalScope, setInternalScope] =
    React.useState<PromptComposerScope>(defaultScope);
  const [internalTone, setInternalTone] =
    React.useState<PromptComposerTone>(defaultTone);

  const currentSubject = subject ?? internalSubject;
  const currentValue = value ?? internalValue;
  const currentScope = scope ?? internalScope;
  const currentTone = tone ?? internalTone;
  const blocked = accessState.isDisabled || accessState.isReadonly;

  if (accessState.isHidden) {
    return null;
  }

  const updateSubject = (next: string) => {
    if (accessState.isReadonly) return;
    if (subject === undefined) setInternalSubject(next);
    onSubjectChange?.(next);
  };

  const updateValue = (next: string) => {
    if (accessState.isReadonly) return;
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  const updateScope = (next: PromptComposerScope) => {
    if (blocked) return;
    if (scope === undefined) setInternalScope(next);
    onScopeChange?.(next);
  };

  const updateTone = (next: PromptComposerTone) => {
    if (blocked) return;
    if (tone === undefined) setInternalTone(next);
    onToneChange?.(next);
  };

  return (
    <section
      className={`rounded-3xl border border-border-subtle bg-surface-muted p-5 shadow-xs ${className}`.trim()}
      data-access-state={accessState.state}
      data-component="prompt-composer"
      title={accessReason}
    >
      <div className="flex flex-col gap-2">
        <Text
          as="div"
          className="text-base font-semibold text-text-primary"
        >
          {title}
        </Text>
        <Text variant="secondary" className="block text-sm leading-6">
          {description}
        </Text>
      </div>

      <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
        <div className="flex flex-col gap-4">
          <TextInput
            label="Prompt title"
            description="Prompt amacini tek satirda netlestir."
            value={currentSubject}
            onValueChange={updateSubject}
            access={accessState.isReadonly ? "readonly" : access}
          />
          <TextArea
            label="Prompt body"
            description="AI yardimcisina verilecek ana gorev tanimini yaz."
            value={currentValue}
            onValueChange={updateValue}
            maxLength={maxLength}
            showCount
            rows={6}
            access={accessState.isReadonly ? "readonly" : access}
          />
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
            <div className="flex flex-col gap-3">
              <Text variant="secondary" size="xs" weight="medium">Scope</Text>
              <div className="flex flex-wrap gap-2">
                {scopeOptions.map((option) => (
                  <Button
                    key={option}
                    variant={
                      currentScope === option ? "primary" : "secondary"
                    }
                    size="sm"
                    fullWidth={false}
                    onClick={() => updateScope(option)}
                    access={accessState.isReadonly ? "readonly" : access}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Text variant="secondary" size="xs" weight="medium">Tone</Text>
              <div className="flex flex-wrap gap-2">
                {toneOptions.map((option) => (
                  <Button
                    key={option}
                    variant={
                      currentTone === option ? "primary" : "secondary"
                    }
                    size="sm"
                    fullWidth={false}
                    onClick={() => updateTone(option)}
                    access={accessState.isReadonly ? "readonly" : access}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-[24px] border border-border-subtle bg-surface-muted p-4">
            <Text variant="secondary" size="xs" weight="medium">Current contract</Text>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="info">scope: {currentScope}</Badge>
              <Badge variant="muted">tone: {currentTone}</Badge>
              <Badge variant="success">chars: {currentValue.length}</Badge>
            </div>
          </div>

          {guardrails.length > 0 ? (
            <div className="rounded-[24px] border border-border-subtle bg-surface-muted p-4">
              <Text variant="secondary" size="xs" weight="medium">Guardrails</Text>
              <div className="mt-3 flex flex-wrap gap-2">
                {guardrails.map((item) => (
                  <Badge key={item} variant="warning">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {citations.length > 0 ? (
            <div className="rounded-[24px] border border-border-subtle bg-surface-muted p-4">
              <Text variant="secondary" size="xs" weight="medium">Source anchors</Text>
              <div className="mt-3 flex flex-wrap gap-2">
                {citations.map((item) => (
                  <Badge key={item} variant="default">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {footerNote ? (
            <Text variant="secondary">{footerNote}</Text>
          ) : null}
        </div>
      </div>
    </section>
  );
});

PromptComposer.displayName = 'PromptComposer';

export default PromptComposer;

/** Ref type for PromptComposer. */
export type PromptComposerRef = React.Ref<HTMLDivElement>;
