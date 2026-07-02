package com.ats.ingest;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;

/** Tenant-scoped medya deposu portu (gerçek S3/MinIO adapter'ı sonraki slice; vendor SDK YOK). */
public interface ObjectStorePort {

    record StoredObjectRef(String key, long sizeBytes) {}

    Outcome<StoredObjectRef> put(TenantId tenantId, String key, byte[] bytes);

    /** Fail-closed telafi için (ledger append başarısızsa yazılan obje geri alınır). */
    Outcome<Void> delete(TenantId tenantId, String key);
}
