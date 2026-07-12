package com.ats.contracts.governance;

import com.ats.kernel.Outcome;

/**
 * P3-gov0 onaylı-model registry PORTU (adapter'lar model-governance modülünde). AI
 * çağrılmadan ÖNCE, çalıştırılacak modelin ONAYLI olduğunu fail-closed çözer; boot'ta
 * ise wire'lanmış konfigürasyonu doğrular. Şimdilik yalnız GLOBAL scope (tenant-özel
 * onay YOK → TenantId imzada yok).
 *
 * <p>Fail-closed sözleşme (her sapma DENY): bulunamayan ref → {@code NOT_FOUND};
 * status≠APPROVED → {@code DENIED}; capability uyuşmazlığı → {@code DENIED}; wired-config
 * eşleşmiyor → {@code NOT_FOUND}; registry erişilemez → {@code NOT_CONFIGURED};
 * eksik argüman → {@code INVALID}. Ok yalnızca APPROVED + tam eşleşmede döner.
 */
public interface ApprovedModelRegistry {

    /**
     * İçerik-adresli ref + beklenen capability ile onaylı kaydı çözer. Ref bulunmalı,
     * kaydın capability'si eşleşmeli ve status APPROVED olmalı — aksi halde fail-closed DENY.
     */
    Outcome<ApprovedModelSpec> resolve(ModelApprovalRef ref, Capability capability);

    /**
     * Wire'lanmış (deploy) konfigürasyonun onaylı olduğunu doğrular: yetenek +
     * sağlayıcı-referansı + istenen model-id + istenen versiyon TAM eşleşen bir APPROVED
     * kayıt aranır (boot-validation yüzeyi). Reported-değer alias'ları burada UYGULANMAZ
     * (o {@link ApprovedModelSpec#matchesReported} çalışma-anı yüzeyidir).
     */
    Outcome<ApprovedModelSpec> resolveConfigured(
            Capability capability,
            String configuredProviderRef,
            String requestedModelId,
            String requestedModelVersion);
}
