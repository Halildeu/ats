/**
 * AIProvider reference stub — gate'te fail-closed (Codex guardrail #1).
 * Gerçek transkripsiyon/citation ÜRETMEZ; UNSUPPORTED_IN_GATE döner. Gerçek
 * Faz 24 motoru bağlama P1 fonksiyoneldir (G0=GO'ya kilitli).
 */
import type { Outcome } from "../src/types.js";
import { fail } from "../src/types.js";
import type { AIProvider, CitationResult, TranscriptResult } from "../src/ai-provider.js";

export class GateStubAIProvider implements AIProvider {
  transcribe(_audioRef: string): Outcome<TranscriptResult> {
    return fail("UNSUPPORTED_IN_GATE", "STT (+ sağlayıcı-destekli diarization) P1 fonksiyonel — G0=GO'ya kilitli");
  }

  cite(_claim: string, _transcriptRef: string): Outcome<CitationResult> {
    return fail("UNSUPPORTED_IN_GATE", "citation/entailment P1 fonksiyonel — G0=GO'ya kilitli");
  }
}
