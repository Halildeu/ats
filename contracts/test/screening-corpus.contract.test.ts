import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPolicy, screen } from "../../scripts/lib/protected-screening-policy.mjs";

/**
 * ATS 156-a — protected-attribute screening ORTAK golden-corpus (Node tarafı).
 *
 * Aynı kanonik registry ({@code protected-attribute-screening-policy.v1.json}) + aynı golden-corpus
 * fixture'ı Java-test (GoldenCorpusTest) ile PAYLAŞILIR. Bu dosya registry-güdümlü tarayıcının bir
 * TS/Node-portunu koşar; her corpus vakası Java ile AYNI (kategori, sinyal, orijinal-span, coverage,
 * dil ekseni) sonucu üretmelidir → iki-bağımsız-motor drift'i corpus ile makine-yakalanır.
 *
 * TEK-KAYNAK: tarama motoru {@code scripts/lib/protected-screening-policy.mjs} ORTAK modülünden
 * gelir (check-rubric.mjs de aynı modülü kullanır); bu dosya artık ayrı bir motor-portu TUTMAZ —
 * term-tarama yalnız kanonik JSON'dan türer (ikinci-regex-registry YOK). Ayrıca DIGEST-EŞİTLİK:
 * registry SHA-256'sı corpus'taki policyDigest ile eşleşmelidir.
 */

const REPO = (rel: string) => fileURLToPath(new URL("../../" + rel, import.meta.url));
const REGISTRY_PATH = REPO("backend/compliance-screening/src/main/resources/screening/protected-attribute-screening-policy.v1.json");
const CORPUS_PATH = REPO("backend/compliance-screening/src/test/resources/screening/screening-golden-corpus.v1.json");

interface CorpusFinding { category: string; signal: string; start: number; end: number; segmentIndex: number | null; }

describe("protected-attribute screening — shared golden corpus (Node parity, single-source engine)", () => {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

  it("registry SHA-256 == corpus policyDigest (single-source, digest-equality)", () => {
    const digest = "sha256:" + createHash("sha256").update(readFileSync(REGISTRY_PATH)).digest("hex");
    expect(digest).toBe(corpus.policyDigest);
  });

  it("corpus covers 8 groups and >= 25 cases", () => {
    const groups = new Set<string>(corpus.cases.map((c: { group: string }) => c.group));
    expect([...groups].sort()).toEqual([
      "coverage_edge", "direct_positive", "false_positive", "morphological_variant",
      "punctuation_unicode", "question_like", "safe_business_phrase", "safe_plus_protected_mixed",
    ]);
    expect(corpus.cases.length).toBeGreaterThanOrEqual(25);
  });

  for (const c of corpus.cases) {
    it(`case ${c.id} (${c.group}) reproduces Java result`, () => {
      const result = c.screener === "unavailable"
        ? { coverage: "POLICY_UNAVAILABLE", findings: [] as CorpusFinding[] }
        : screen(loadPolicy(REGISTRY_PATH), c.text, c.language, null);

      expect(result.coverage, `coverage [${c.id}]`).toBe(c.expectedCoverage);

      const actual = result.findings.map((f) => ({
        category: f.category, signal: f.signal, start: f.start, end: f.end, segmentIndex: f.segmentIndex,
      }));
      const expected = c.expectedFindings.map((e: CorpusFinding) => ({
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
