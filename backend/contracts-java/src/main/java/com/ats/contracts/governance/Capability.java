package com.ats.contracts.governance;

/**
 * P3-gov0 onaylı-model politikası kapsamındaki AI yetenekleri (kapalı küme).
 * TRANSCRIBE = STT; CITE = claim→kaynak alıntı (entailment). Yeni yetenek
 * eklemek onay-politikası genişletmesidir (ADR gerekir). ATS-0005 yasak
 * yüzeyler (score/rank/fit/…) bilinçle YOKTUR.
 */
public enum Capability {
    TRANSCRIBE,
    CITE
}
