'use client';

export type ConditionOperator = 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface ConditionalRule {
  conditions: Condition[];
  logic: 'and' | 'or';
  actions: Array<{
    type: 'show' | 'hide' | 'enable' | 'disable' | 'setValue' | 'setRequired';
    target: string;
    value?: unknown;
  }>;
}

export interface ConditionalResult {
  isVisible: (fieldId: string) => boolean;
  isEnabled: (fieldId: string) => boolean;
  isRequired: (fieldId: string) => boolean;
  computedValues: Record<string, unknown>;
}

function evaluateCondition(condition: Condition, values: Record<string, unknown>): boolean {
  const fieldValue = values[condition.field];
  switch (condition.operator) {
    case 'equals': return fieldValue === condition.value;
    case 'notEquals': return fieldValue !== condition.value;
    case 'contains': return typeof fieldValue === 'string' && typeof condition.value === 'string' && fieldValue.includes(condition.value);
    case 'greaterThan': return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue > condition.value;
    case 'lessThan': return typeof fieldValue === 'number' && typeof condition.value === 'number' && fieldValue < condition.value;
    case 'isEmpty': return fieldValue === undefined || fieldValue === null || fieldValue === '';
    case 'isNotEmpty': return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
    default: return false;
  }
}

export function evaluateConditionalRules(
  rules: ConditionalRule[],
  values: Record<string, unknown>,
): ConditionalResult {
  const hidden = new Set<string>();
  const disabled = new Set<string>();
  const required = new Set<string>();
  const computed: Record<string, unknown> = {};

  for (const rule of rules) {
    const results = rule.conditions.map(c => evaluateCondition(c, values));
    const passes = rule.logic === 'and' ? results.every(Boolean) : results.some(Boolean);

    if (passes) {
      for (const action of rule.actions) {
        switch (action.type) {
          case 'hide': hidden.add(action.target); break;
          case 'show': hidden.delete(action.target); break;
          case 'disable': disabled.add(action.target); break;
          case 'enable': disabled.delete(action.target); break;
          case 'setRequired': required.add(action.target); break;
          case 'setValue': computed[action.target] = action.value; break;
        }
      }
    }
  }

  return {
    isVisible: (id) => !hidden.has(id),
    isEnabled: (id) => !disabled.has(id),
    isRequired: (id) => required.has(id),
    computedValues: computed,
  };
}
