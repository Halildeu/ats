/**
 * GENERATED from contracts/policies/dsar-input-contract.v1.json by scripts/generate-dsar-input-contract.mjs.
 * DO NOT EDIT — ilk yayından önce contract+generator; sonrasında v2+forward migration değişir.
 */
export const DSAR_SUBJECT_REF_PATTERN_SOURCE = "^(?:(?:subj|subject)[._:-])?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AaBb][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$";
export const DSAR_SUBJECT_REF_PATTERN = new RegExp(DSAR_SUBJECT_REF_PATTERN_SOURCE);
export const DSAR_SUBJECT_REF_MIN_LENGTH = 36;
export const DSAR_SUBJECT_REF_MAX_LENGTH = 44;
export const DATA_SUBJECT_ERASURE_REASON = "DATA_SUBJECT_ERASURE" as const;

export function isValidDsarSubjectRef(value: string): boolean {
  return value.length >= DSAR_SUBJECT_REF_MIN_LENGTH
    && value.length <= DSAR_SUBJECT_REF_MAX_LENGTH
    && DSAR_SUBJECT_REF_PATTERN.test(value);
}

export function isValidDsarReasonCode(value: string): boolean {
  return value === DATA_SUBJECT_ERASURE_REASON;
}
