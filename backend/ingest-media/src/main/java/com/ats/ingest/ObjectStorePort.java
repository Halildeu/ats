package com.ats.ingest;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped medya deposu portu (gerçek S3/MinIO adapter'ı sonraki slice; vendor SDK YOK). */
public interface ObjectStorePort {

    record StoredObjectRef(String key, long sizeBytes) {}

    /**
     * Okuma dönüşü: içerik + ingest'te allowlist'lenmiş medya tipi. contentType
     * write-side'da saklanır (slice-36; Codex: store sonradan üretemez — kaynak
     * upload allowlist'idir; WORM ledger'a geri bakmak kötü bağlanma olur).
     */
    record StoredObject(byte[] bytes, String contentType) {}

    Outcome<StoredObjectRef> put(TenantId tenantId, String key, byte[] bytes, String contentType);

    /** Fail-closed: bilinmeyen/silinmiş anahtar veya tenant-uyuşmazlığı NOT_FOUND döner. */
    Outcome<StoredObject> read(TenantId tenantId, String key);

    /** Fail-closed telafi için (ledger append başarısızsa yazılan obje geri alınır). */
    Outcome<Void> delete(TenantId tenantId, String key);
}
