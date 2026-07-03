package com.ats.provider;

import com.ats.kernel.Outcome;

/**
 * Yetkilendirilmiş opaque audio-ref → bytes çözücü port (slice-33).
 *
 * SINIR (tenant-bound çözüm ÜST katmanın işi — Codex zorunlu-revizyon): bu port ATS
 * object-store'a doğrudan köprü DEĞİLDİR ve global key-lookup olarak implement
 * EDİLEMEZ. {@code transcribe(audioRef)}'e gelen ref, TranscriptionService'in
 * tenant + consent + WORM {@code recording.ingested} kontrollerinden GEÇMİŞ bir
 * referanstır; bu portun implementasyonu yalnız o üst bağlamda yetkilendirilmiş
 * ref'leri çözebilir (ör. tenant-bağlı one-shot handle / tenant-scoped closure).
 * Tenant-aware kalıcı media-store köprüsü boot-wiring diliminin işidir; thread-local
 * veya global mutable key-tablosu kabul edilmez.
 */
public interface AudioSource {

    /**
     * İçerik baytları + kapalı-allowlist medya tipi. filename bilinçli TAŞINMAZ
     * (multipart header-injection yüzeyi; adaptör sabit güvenli filename kullanır).
     */
    record AudioBlob(byte[] bytes, String contentType) {}

    /** Fail-closed: çözülemeyen/yetkisiz ref Outcome.fail döner, asla boş blob değil. */
    Outcome<AudioBlob> read(String audioRef);
}
