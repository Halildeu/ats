package com.ats.ingest;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Slice-1 local adapter; anahtar tenant-önekli → cross-tenant okuma/yazma yapısal olarak ayrık. */
public final class InMemoryObjectStore implements ObjectStorePort {

    private final Map<String, byte[]> objects = new ConcurrentHashMap<>();

    @Override
    public Outcome<StoredObjectRef> put(TenantId tenantId, String key, byte[] bytes) {
        if (tenantId == null || key == null || key.isBlank() || bytes == null || bytes.length == 0) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId/key/bytes zorunlu");
        }
        objects.put(scoped(tenantId, key), bytes.clone());
        return Outcome.ok(new StoredObjectRef(key, bytes.length));
    }

    @Override
    public Outcome<Void> delete(TenantId tenantId, String key) {
        objects.remove(scoped(tenantId, key));
        return Outcome.ok(null);
    }

    public boolean contains(TenantId tenantId, String key) {
        return objects.containsKey(scoped(tenantId, key));
    }

    public int size() {
        return objects.size();
    }

    private static String scoped(TenantId t, String key) {
        return t.value() + "::" + key;
    }
}
