package com.ats.orchestration;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/**
 * One-shot, TTL'li, tenant-bağlı ses-erişim capability'si (slice-36 — Codex slice-33
 * sınırının onaylı çözümü: "TranscriptionService tenant bağlamında one-shot handle
 * üretip provider'a onu vermeli").
 *
 * Bu bir "global key-lookup" DEĞİLDİR: redeem ambient object-key kabul etmez; yalnız
 * tenant + consent + WORM ingest-kanıtı guard'ları geçildikten sonra ISSUE edilmiş,
 * kriptografik-rastgele, tek-atımlık, kısa-TTL'li handle çözülür.
 *
 * Handle SIR gibi davranır: log'a, WORM payload'ına, audit event'ine, hata mesajına
 * veya transcript metadata'sına YAZILMAZ; WORM kayıtlarında kaynak her zaman orijinal
 * objectKey'dir. Handle yalnız provider çağrısına girip çıkar.
 */
public interface AudioAccessGrants {

    record Grant(TenantId tenantId, String objectKey) {}

    /**
     * Guard'lar geçtikten sonra, provider çağrısından hemen önce çağrılır.
     * Outcome dönüşü bilinçli (Codex): in-memory pratikte fail etmez ama dağıtık
     * grant-store implementasyonları fail edebilir — fail-closed pattern korunur.
     */
    Outcome<String> issue(TenantId tenantId, String objectKey);

    /** Atomik one-shot: redeem denemesi kaydı TÜKETİR; ikinci deneme/expire/unknown → fail. */
    Outcome<Grant> redeem(String handle);
}
