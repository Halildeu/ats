/**
 * ATS 156-a — ORTAK korumalı-özellik tarama motoru (Node tarafı, TEK kaynak).
 *
 * Bu modül protected-term + safe-phrase tarama davranışını KANONİK registry JSON'undan
 * (`protected-attribute-screening-policy.v1.json`) türetir; İKİNCİ bir regex/term registry'si
 * YOKTUR. Hem `scripts/check-rubric.mjs` (rubric-artifact drift-guard) hem
 * `contracts/test/screening-corpus.contract.test.ts` (golden-corpus parite) bu motoru kullanır →
 * policy'ye eklenen/çıkarılan bir TERİM her iki tarafta da otomatik yansır (term-düzeyi
 * tek-kaynak; kategori-adı-düzeyi drift'in ötesinde).
 *
 * Java `com.ats.screening` kernel'inin (ProtectedAttributeScreener + TextNormalizer + ScreeningPolicy)
 * Node-görünür parite portudur (leksik eşleşme + orijinal-span + coverage + dil ekseni). Kanonik
 * otorite Java kernel'dir; bu motor ADR-mirror desenidir.
 *
 * Scoring/affect taraması bu modülün KONUSU DEĞİLDİR (korumalı-özellik policy'sine ait değil) —
 * check-rubric onları ayrı tutar.
 */
import { readFileSync } from "node:fs";

// ---- registry yükleme (kanonik JSON → term modeli) ----

/**
 * @param {string} registryPath Kanonik policy JSON yolu.
 * @returns {{categories: {code:string, terms:{kind:string, tokens:string[], minLen:number}[]}[],
 *            safePhrases: string[][], questionCues: string[][], supportedBaseTags: string[]}}
 */
export function loadPolicy(registryPath) {
  const raw = JSON.parse(readFileSync(registryPath, "utf8"));
  const toTokens = (s) => s.split(" ");
  return {
    categories: raw.categories.map((c) => ({
      code: c.code,
      terms: c.terms.map((t) => ({ kind: t.kind, tokens: toTokens(t.text), minLen: t.minLen ?? 0 })),
    })),
    safePhrases: raw.safePhrases.map(toTokens),
    questionCues: raw.questionCues.map(toTokens),
    supportedBaseTags: [...new Set(raw.supportedLanguages.map(baseTag).filter((b) => b != null))],
  };
}

// ---- normalizer + orijinal-ofset eşlemesi (Java TextNormalizer birebir) ----

function fold(cp) {
  const ch = String.fromCodePoint(cp);
  if (/\p{Pd}|\p{Pc}/u.test(ch)) return 0x20; // tire/alt-çizgi → boşluk
  if (cp === 0x131) return 0x69;              // 'ı' → i
  return ch.toLowerCase().codePointAt(0);     // locale-bağımsız küçük harf
}

/**
 * @param {string} original
 * @returns {{text: string, origStart: number[], origEnd: number[]}}
 */
export function normalize(original) {
  const origStart = [];
  const origEnd = [];
  let text = "";
  let oi = 0;
  const n = original.length;
  while (oi < n) {
    const cp = original.codePointAt(oi);
    const cc = cp > 0xffff ? 2 : 1;
    const oEnd = oi + cc;
    const decomposed = String.fromCodePoint(cp).normalize("NFKD");
    for (const dch of decomposed) {
      if (/\p{M}/u.test(dch)) continue; // birleşik-işaret strip
      const foldedStr = String.fromCodePoint(fold(dch.codePointAt(0)));
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

export function isMalformed(text) {
  if (text == null || text.length > 200000) return true;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const nx = i + 1 < text.length ? text.charCodeAt(i + 1) : -1;
      if (nx < 0xdc00 || nx > 0xdfff) return true;
      i++;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 0x20 || c === 0x7f || (c >= 0x80 && c <= 0x9f)) return true;
  }
  return false;
}

/** BCP-47 base (primary) subtag küçük-harf; null/blank/boş → null (fail-closed). */
export function baseTag(languageTag) {
  if (languageTag == null) return null;
  const t = String(languageTag).trim();
  if (t === "") return null;
  const dash = t.indexOf("-");
  const base = (dash >= 0 ? t.slice(0, dash) : t).toLowerCase();
  return base === "" ? null : base;
}

export function isSupportedBaseTag(languageTag, supportedBaseTags) {
  const base = baseTag(languageTag);
  return base != null && supportedBaseTags.includes(base);
}

/**
 * BASKIN-yazım Latin dışı mı: non-Latin harf sayısı Latin (a-z) harf sayısından KESİN fazlaysa true
 * (gerçek baskınlık; "hiç-Latin-yok" değil — tek bir Latin karakter baskın Arapça/Kiril'i
 * desteklenir yapmaz). Harf yoksa false.
 */
export function isDominantScriptNonLatin(norm) {
  let latin = 0;
  let other = 0;
  for (const ch of norm) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x61 && cp <= 0x7a) latin++;
    else if (/\p{L}/u.test(ch)) other++;
  }
  return other > latin;
}

// ---- token motoru ----

const isLetterOrDigit = (cp) => /[\p{L}\p{Nd}]/u.test(String.fromCodePoint(cp));

function tokenize(norm) {
  const tokens = [];
  let i = 0;
  const n = norm.length;
  while (i < n) {
    const cp = norm.codePointAt(i);
    const cc = cp > 0xffff ? 2 : 1;
    if (isLetterOrDigit(cp)) {
      const start = i;
      while (i < n) {
        const c = norm.codePointAt(i);
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

function neutralize(tokens, safePhrases) {
  const neutral = new Array(tokens.length).fill(false);
  for (const phrase of safePhrases) {
    const k = phrase.length;
    for (let i = 0; i + k <= tokens.length; i++) {
      let all = true;
      for (let j = 0; j < k; j++) if (tokens[i + j].text !== phrase[j]) { all = false; break; }
      if (all) for (let j = 0; j < k; j++) neutral[i + j] = true;
    }
  }
  return neutral;
}

const remainderAllAsciiLetters = (t, from) => {
  for (let i = from; i < t.length; i++) { const c = t.charCodeAt(i); if (c < 0x61 || c > 0x7a) return false; }
  return true;
};

function sentenceStart(text, pos) {
  for (let i = pos - 1; i >= 0; i--) { const c = text[i]; if (c === "." || c === "?" || c === "!" || c === "\n") return i + 1; }
  return 0;
}
function sentenceBoundary(text, pos) {
  for (let i = pos; i < text.length; i++) { const c = text[i]; if (c === "." || c === "?" || c === "!" || c === "\n") return i; }
  return text.length;
}
function hasCueInRange(tokens, cues, sStart, sEnd) {
  const idx = [];
  for (let i = 0; i < tokens.length; i++) { const t = tokens[i]; if (t.start >= sStart && t.end <= sEnd) idx.push(i); }
  for (const cue of cues) {
    const k = cue.length;
    for (let p = 0; p + k <= idx.length; p++) {
      let all = true;
      let contiguous = true;
      for (let j = 0; j < k; j++) {
        if (tokens[idx[p + j]].text !== cue[j]) { all = false; break; }
        if (j > 0 && idx[p + j] !== idx[p + j - 1] + 1) contiguous = false;
      }
      if (all && contiguous) return true;
    }
  }
  return false;
}
function isInterrogative(text, tokens, mStart, mEnd, cues) {
  const sStart = sentenceStart(text, mStart);
  const bnd = sentenceBoundary(text, mEnd);
  if (bnd < text.length && text[bnd] === "?") return true;
  return hasCueInRange(tokens, cues, sStart, bnd);
}

/**
 * Çekirdek leksik eşleşme (WORD/STEM/PHRASE + safe-phrase neutralize). {@link screen} ve
 * {@link scanProtectedCategories} bu TEK core'u paylaşır.
 * @returns {{tokens: {start:number,end:number,text:string}[], raw: {category:string,nStart:number,nEnd:number}[]}}
 */
function rawMatches(policy, normText) {
  const tokens = tokenize(normText);
  const neutral = neutralize(tokens, policy.safePhrases);
  const raw = [];
  for (const cat of policy.categories) {
    for (const term of cat.terms) {
      if (term.kind === "WORD") {
        const w = term.tokens[0];
        for (let i = 0; i < tokens.length; i++) if (!neutral[i] && tokens[i].text === w) raw.push({ category: cat.code, nStart: tokens[i].start, nEnd: tokens[i].end });
      } else if (term.kind === "STEM") {
        const stem = term.tokens[0];
        for (let i = 0; i < tokens.length; i++) {
          const tt = tokens[i].text;
          if (!neutral[i] && tt.length >= term.minLen && tt.startsWith(stem) && remainderAllAsciiLetters(tt, stem.length))
            raw.push({ category: cat.code, nStart: tokens[i].start, nEnd: tokens[i].end });
        }
      } else { // PHRASE
        const parts = term.tokens;
        const k = parts.length;
        for (let i = 0; i + k <= tokens.length; i++) {
          let all = true;
          for (let j = 0; j < k; j++) if (neutral[i + j] || tokens[i + j].text !== parts[j]) { all = false; break; }
          if (all) raw.push({ category: cat.code, nStart: tokens[i].start, nEnd: tokens[i + k - 1].end });
        }
      }
    }
  }
  return { tokens, raw };
}

// ---- tam tarayıcı (golden-corpus parite) ----

/**
 * @param {object} policy loadPolicy() çıktısı
 * @param {string} text ham girdi
 * @param {string|null} languageTag beyan edilen BCP-47 dil-tag
 * @param {number|null} segmentIndex
 * @returns {{coverage: string, findings: {category:string,signal:string,start:number,end:number,segmentIndex:number|null}[]}}
 */
export function screen(policy, text, languageTag, segmentIndex) {
  if (isMalformed(text)) return { coverage: "MALFORMED_INPUT", findings: [] };
  if (!isSupportedBaseTag(languageTag, policy.supportedBaseTags)) return { coverage: "UNSUPPORTED_LANGUAGE", findings: [] };
  const norm = normalize(text);
  if (isDominantScriptNonLatin(norm.text)) return { coverage: "UNSUPPORTED_LANGUAGE", findings: [] };

  const { tokens, raw } = rawMatches(policy, norm.text);

  let findings = raw.map((m) => ({
    category: m.category,
    signal: isInterrogative(norm.text, tokens, m.nStart, m.nEnd, policy.questionCues)
      ? "QUESTION_LIKE_PROTECTED_MENTION" : "PROTECTED_ATTRIBUTE_MENTION",
    start: norm.origStart[m.nStart],
    end: norm.origEnd[m.nEnd - 1],
    segmentIndex,
  }));

  // aynı-kategori içerilen span'leri ayıkla (maksimal anım kalsın)
  findings = findings.filter((f) => !findings.some((g) =>
    g !== f && g.category === f.category && g.start <= f.start && g.end >= f.end && (g.end - g.start) > (f.end - f.start)));
  // exact dedupe
  const seen = new Set();
  findings = findings.filter((f) => {
    const key = `${f.category}|${f.signal}|${f.start}|${f.end}|${f.segmentIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // sıralama: start,end,category,signal
  const CAT_ORD = policy.categories.map((c) => c.code);
  const catOrd = (c) => CAT_ORD.indexOf(c);
  const sigOrd = (s) => (s === "PROTECTED_ATTRIBUTE_MENTION" ? 0 : 1);
  findings.sort((a, b) => a.start - b.start || a.end - b.end || catOrd(a.category) - catOrd(b.category) || sigOrd(a.signal) - sigOrd(b.signal));

  return { coverage: "SUPPORTED", findings };
}

// ---- rubric-artifact taraması (dil/coverage kapısı YOK; yalnız term-varlığı) ----

/**
 * Bir rubric-artifact string'inde (id/anahtar/değer) hangi korumalı KATEGORİLER geçiyor. Dil/coverage
 * gating UYGULANMAZ (bir kimlik-string'i tr/en beyan etmez); safe-phrase neutralize UYGULANIR.
 * @returns {string[]} eşleşen benzersiz kategori kodları
 */
export function scanProtectedCategories(policy, text) {
  const norm = normalize(text);
  const { raw } = rawMatches(policy, norm.text);
  return [...new Set(raw.map((m) => m.category))];
}
