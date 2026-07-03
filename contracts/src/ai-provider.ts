/**
 * ATS-0001 contract #3 — AIProvider (Faz 24 motoru).
 *
 * Faz 24 AI altyapısı (Türkçe STT faster-whisper + diarization pyannote +
 * self-host LLM + entailment-citation) provider/interface olarak çağrılır;
 * kopyalanmaz/fork'lanmaz (ADR-0004).
 *
 * YASAK yüzey (ADR-0005 — KOD'a bile girmez): score / rank / fit / recommend /
 * compare / sentiment / emotion / affect / reject / autoDecision. Ürün
 * "kanıt üretir, insan karar verir" (evidence-first / score-second).
 */
import type { Outcome } from "./types.js";

export interface TranscriptSegment {
  /**
   * Sağlayıcı konuşmacı/akış etiketi, ör. "S1": diarization varsa oturum-içi
   * ayrıştırma label'ı, yoksa tek-akış sentinel (live-stt v0.1.0 diarization
   * SUNMAZ — bkz. ATS-0017 amendment). Kimlik/PII değil.
   */
  readonly speaker: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

export interface TranscriptResult {
  /** ISO 639-1, ör. "tr" (per-meeting language — ADR-0030 hattı). */
  readonly language: string;
  readonly segments: readonly TranscriptSegment[];
}

/** Claim → kaynak alıntı entailment sonucu (fail-closed). */
export interface CitationResult {
  readonly claim: string;
  /** Desteklenen segment referansları (kaynak alıntı). */
  readonly sourceSegmentRefs: readonly string[];
  /** Üç-değerli entailment; belirsizse INSUFFICIENT (fail-closed). */
  readonly entailment: "SUPPORTED" | "NOT_SUPPORTED" | "INSUFFICIENT";
}

export interface AIProvider {
  /**
   * STT (+ sağlayıcı sunuyorsa diarization; live-stt v0.1.0 SUNMAZ → tek-akış
   * sentinel, bkz. ATS-0017 amendment). Gate'te stub UNSUPPORTED_IN_GATE döner.
   */
  transcribe(audioRef: string): Outcome<TranscriptResult>;

  /**
   * Bir claim'in transcript'e dayanıp dayanmadığını entailment ile değerlendirir
   * (citation). Karar/puanlama DEĞİL. Gate'te stub UNSUPPORTED_IN_GATE döner.
   */
  cite(claim: string, transcriptRef: string): Outcome<CitationResult>;
}
