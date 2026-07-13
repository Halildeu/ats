// ATS 156-a — ORTAK korumalı-özellik tarama motorunun tip bildirimleri (JS lib için).
export interface Term {
  kind: "WORD" | "PHRASE" | "STEM";
  tokens: string[];
  minLen: number;
}
export interface Category {
  code: string;
  terms: Term[];
}
export interface Policy {
  categories: Category[];
  safePhrases: string[][];
  questionCues: string[][];
  supportedBaseTags: string[];
}
export interface Finding {
  category: string;
  signal: string;
  start: number;
  end: number;
  segmentIndex: number | null;
}
export interface ScreenResult {
  coverage: string;
  findings: Finding[];
}
export interface Normalized {
  text: string;
  origStart: number[];
  origEnd: number[];
}

export function loadPolicy(registryPath: string): Policy;
export function normalize(original: string): Normalized;
export function isMalformed(text: string | null): boolean;
export function baseTag(languageTag: string | null): string | null;
export function isSupportedBaseTag(languageTag: string | null, supportedBaseTags: string[]): boolean;
export function isDominantScriptNonLatin(norm: string): boolean;
export function screen(
  policy: Policy,
  text: string,
  languageTag: string | null,
  segmentIndex: number | null,
): ScreenResult;
export function scanProtectedCategories(policy: Policy, text: string): string[];
