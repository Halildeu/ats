import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ATS 156-a — protected-attribute screening ORTAK golden-corpus (Node tarafı).
 *
 * Aynı kanonik registry ({@code protected-attribute-screening-policy.v1.json}) + aynı golden-corpus
 * fixture'ı Java-test (GoldenCorpusTest) ile PAYLAŞILIR. Bu dosya registry-güdümlü tarayıcının bir
 * TS-portunu koşar; her corpus vakası Java ile AYNI (kategori, sinyal, orijinal-span, coverage)
 * sonucu üretmelidir → iki-bağımsız-motor drift'i corpus ile makine-yakalanır. Ayrıca
 * DIGEST-EŞİTLİK: registry dosyasının SHA-256'sı corpus'taki policyDigest ile eşleşmelidir
 * (tek-kaynak vokabüler; kod ↔ Node aynı fiziksel registry'yi tüketir).
 *
 * NOT: Bu, çekirdeğin fail-closed davranışının Node-görünür kısmının (leksik eşleşme + span +
 * coverage) parite kanıtıdır; kanonik Java kernel'in kendisi değildir (ADR-mirror deseni).
 */

const REPO = (rel: string) => fileURLToPath(new URL("../../" + rel, import.meta.url));
const REGISTRY_PATH = REPO("backend/compliance-screening/src/main/resources/screening/protected-attribute-screening-policy.v1.json");
const CORPUS_PATH = REPO("backend/compliance-screening/src/test/resources/screening/screening-golden-corpus.v1.json");

// ---- registry / corpus yükleme ----

interface Term { kind: "WORD" | "PHRASE" | "STEM"; tokens: string[]; minLen: number; }
interface Category { code: string; terms: Term[]; }
interface Policy { categories: Category[]; safePhrases: string[][]; questionCues: string[][]; }

function loadPolicy(): Policy {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  const toTokens = (s: string) => s.split(" ");
  return {
    categories: raw.categories.map((c: any) => ({
      code: c.code,
      terms: c.terms.map((t: any) => ({ kind: t.kind, tokens: toTokens(t.text), minLen: t.minLen ?? 0 })),
    })),
    safePhrases: raw.safePhrases.map(toTokens),
    questionCues: raw.questionCues.map(toTokens),
  };
}

// ---- normalizer + orijinal-ofset eşlemesi (Java TextNormalizer birebir) ----

interface Normalized { text: string; origStart: number[]; origEnd: number[]; }

function fold(cp: number): number {
  const ch = String.fromCodePoint(cp);
  if (/\p{Pd}|\p{Pc}/u.test(ch)) return 0x20;   // tire/alt-çizgi → boşluk
  if (cp === 0x131) return 0x69;                // 'ı' → i
  return ch.toLowerCase().codePointAt(0)!;      // locale-bağımsız küçük harf
}

function normalize(original: string): Normalized {
  const origStart: number[] = [];
  const origEnd: number[] = [];
  let text = "";
  let oi = 0;
  const n = original.length;
  while (oi < n) {
    const cp = original.codePointAt(oi)!;
    const cc = cp > 0xffff ? 2 : 1;
    const oEnd = oi + cc;
    const decomposed = String.fromCodePoint(cp).normalize("NFKD");
    for (const dch of decomposed) {
      if (/\p{M}/u.test(dch)) continue;         // birleşik-işaret strip
      const foldedStr = String.fromCodePoint(fold(dch.codePointAt(0)!));
      for (let k = 0; k < foldedStr.length; k++) {
        text += foldedStr[k];
        origStart.push(oi);
        origEnd.push(oEnd);
      }
    }
    oi = oEnd;
  }
  return { text, origStart, origEnd };
}

// ---- coverage ön-kontroller ----

function isMalformed(text: string): boolean {
  if (text == null || text.length > 200000) return true;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const nx = i + 1 < text.length ? text.charCodeAt(i + 1) : -1;
      if (nx < 0xdc00 || nx > 0xdfff) return true;
      i++; continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 0x20 || c === 0x7f || (c >= 0x80 && c <= 0x9f)) return true;
  }
  return false;
}

function isUnsupportedScript(norm: string): boolean {
  let latin = 0, other = 0;
  for (const ch of norm) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x61 && cp <= 0x7a) latin++;
    else if (/\p{L}/u.test(ch)) other++;
  }
  return latin === 0 && other > 0;
}

// ---- token motoru ----

interface Token { start: number; end: number; text: string; }
const isLetterOrDigit = (cp: number) => /[\p{L}\p{Nd}]/u.test(String.fromCodePoint(cp));

function tokenize(norm: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = norm.length;
  while (i < n) {
    const cp = norm.codePointAt(i)!;
    const cc = cp > 0xffff ? 2 : 1;
    if (isLetterOrDigit(cp)) {
      const start = i;
      while (i < n) {
        const c = norm.codePointAt(i)!;
        if (!isLetterOrDigit(c)) break;
        i += c > 0xffff ? 2 : 1;
      }
      tokens.push({ start, end: i, text: norm.substring(start, i) });
    } else {
      i += cc;
    }
  }
  return tokens;
}

function neutralize(tokens: Token[], safePhrases: string[][]): boolean[] {
  const neutral = new Array(tokens.length).fill(false);
  for (const phrase of safePhrases) {
    const k = phrase.length;
    for (let i = 0; i + k <= tokens.length; i++) {
      let all = true;
      for (let j = 0; j < k; j++) if (tokens[i + j]!.text !== phrase[j]) { all = false; break; }
      if (all) for (let j = 0; j < k; j++) neutral[i + j] = true;
    }
  }
  return neutral;
}

const remainderAllAsciiLetters = (t: string, from: number) => {
  for (let i = from; i < t.length; i++) { const c = t.charCodeAt(i); if (c < 0x61 || c > 0x7a) return false; }
  return true;
};

function sentenceStart(text: string, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) { const c = text[i]; if (c === "." || c === "?" || c === "!" || c === "\n") return i + 1; }
  return 0;
}
function sentenceBoundary(text: string, pos: number): number {
  for (let i = pos; i < text.length; i++) { const c = text[i]; if (c === "." || c === "?" || c === "!" || c === "\n") return i; }
  return text.length;
}
function hasCueInRange(tokens: Token[], cues: string[][], sStart: number, sEnd: number): boolean {
  const idx: number[] = [];
  for (let i = 0; i < tokens.length; i++) { const t = tokens[i]!; if (t.start >= sStart && t.end <= sEnd) idx.push(i); }
  for (const cue of cues) {
    const k = cue.length;
    for (let p = 0; p + k <= idx.length; p++) {
      let all = true, contiguous = true;
      for (let j = 0; j < k; j++) {
        if (tokens[idx[p + j]!]!.text !== cue[j]) { all = false; break; }
        if (j > 0 && idx[p + j]! !== idx[p + j - 1]! + 1) contiguous = false;
      }
      if (all && contiguous) return true;
    }
  }
  return false;
}
function isInterrogative(text: string, tokens: Token[], mStart: number, mEnd: number, cues: string[][]): boolean {
  const sStart = sentenceStart(text, mStart);
  const bnd = sentenceBoundary(text, mEnd);
  if (bnd < text.length && text[bnd] === "?") return true;
  return hasCueInRange(tokens, cues, sStart, bnd);
}

// ---- tarayıcı ----

interface Finding { category: string; signal: string; start: number; end: number; segmentIndex: number | null; }

function screen(policy: Policy, text: string, segmentIndex: number | null): { coverage: string; findings: Finding[] } {
  if (isMalformed(text)) return { coverage: "MALFORMED_INPUT", findings: [] };
  const norm = normalize(text);
  if (isUnsupportedScript(norm.text)) return { coverage: "UNSUPPORTED_LANGUAGE", findings: [] };

  const tokens = tokenize(norm.text);
  const neutral = neutralize(tokens, policy.safePhrases);
  const raw: { category: string; nStart: number; nEnd: number }[] = [];

  for (const cat of policy.categories) {
    for (const term of cat.terms) {
      if (term.kind === "WORD") {
        const w = term.tokens[0];
        for (let i = 0; i < tokens.length; i++) if (!neutral[i] && tokens[i]!.text === w) raw.push({ category: cat.code, nStart: tokens[i]!.start, nEnd: tokens[i]!.end });
      } else if (term.kind === "STEM") {
        const stem = term.tokens[0]!;
        for (let i = 0; i < tokens.length; i++) {
          const tt = tokens[i]!.text;
          if (!neutral[i] && tt.length >= term.minLen && tt.startsWith(stem) && remainderAllAsciiLetters(tt, stem.length))
            raw.push({ category: cat.code, nStart: tokens[i]!.start, nEnd: tokens[i]!.end });
        }
      } else { // PHRASE
        const parts = term.tokens; const k = parts.length;
        for (let i = 0; i + k <= tokens.length; i++) {
          let all = true;
          for (let j = 0; j < k; j++) if (neutral[i + j] || tokens[i + j]!.text !== parts[j]) { all = false; break; }
          if (all) raw.push({ category: cat.code, nStart: tokens[i]!.start, nEnd: tokens[i + k - 1]!.end });
        }
      }
    }
  }

  // normalize span → orijinal span + sinyal
  let findings: Finding[] = raw.map((m) => ({
    category: m.category,
    signal: isInterrogative(norm.text, tokens, m.nStart, m.nEnd, policy.questionCues)
      ? "QUESTION_LIKE_PROTECTED_MENTION" : "PROTECTED_ATTRIBUTE_MENTION",
    start: norm.origStart[m.nStart]!,
    end: norm.origEnd[m.nEnd - 1]!,
    segmentIndex,
  }));

  // aynı-kategori içerilen span'leri ayıkla
  findings = findings.filter((f) => !findings.some((g) =>
    g !== f && g.category === f.category && g.start <= f.start && g.end >= f.end && (g.end - g.start) > (f.end - f.start)));
  // exact dedupe
  const seen = new Set<string>();
  findings = findings.filter((f) => {
    const key = `${f.category}|${f.signal}|${f.start}|${f.end}|${f.segmentIndex}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  // sıralama: start,end,category,signal
  const CAT_ORD = policy.categories.map((c) => c.code);
  const catOrd = (c: string) => CAT_ORD.indexOf(c);
  const sigOrd = (s: string) => (s === "PROTECTED_ATTRIBUTE_MENTION" ? 0 : 1);
  findings.sort((a, b) => a.start - b.start || a.end - b.end || catOrd(a.category) - catOrd(b.category) || sigOrd(a.signal) - sigOrd(b.signal));

  return { coverage: "SUPPORTED", findings };
}

// ---- testler ----

describe("protected-attribute screening — shared golden corpus (Node parity)", () => {
  const policy = loadPolicy();
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

  it("registry SHA-256 == corpus policyDigest (single-source, digest-equality)", () => {
    const digest = "sha256:" + createHash("sha256").update(readFileSync(REGISTRY_PATH)).digest("hex");
    expect(digest).toBe(corpus.policyDigest);
  });

  it("corpus covers 8 groups and >= 25 cases", () => {
    const groups = new Set<string>(corpus.cases.map((c: any) => c.group));
    expect([...groups].sort()).toEqual([
      "coverage_edge", "direct_positive", "false_positive", "morphological_variant",
      "punctuation_unicode", "question_like", "safe_business_phrase", "safe_plus_protected_mixed",
    ]);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(25);
  });

  for (const c of JSON.parse(readFileSync(CORPUS_PATH, "utf8")).cases) {
    it(`case ${c.id} (${c.group}) reproduces Java result`, () => {
      const result = c.screener === "unavailable"
        ? { coverage: "POLICY_UNAVAILABLE", findings: [] as Finding[] }
        : screen(loadPolicy(), c.text, null);

      expect(result.coverage, `coverage [${c.id}]`).toBe(c.expectedCoverage);

      const actual = result.findings.map((f) => ({
        category: f.category, signal: f.signal, start: f.start, end: f.end, segmentIndex: f.segmentIndex,
      }));
      const expected = c.expectedFindings.map((e: any) => ({
        category: e.category, signal: e.signal, start: e.start, end: e.end, segmentIndex: e.segmentIndex,
      }));
      expect(actual, `findings [${c.id}]`).toEqual(expected);

      // fail-closed: SUPPORTED dışı asla CLEAR değildir
      if (result.coverage !== "SUPPORTED") {
        expect(result.findings.length, `not-clear [${c.id}]`).toBe(0);
        expect(result.coverage).not.toBe("SUPPORTED");
      }
    });
  }
});
