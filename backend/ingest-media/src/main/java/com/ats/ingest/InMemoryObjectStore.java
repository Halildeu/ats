package com.ats.ingest;

import com.ats.kernel.Ids.TenantId;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Slice-1 local adapter; anahtar tenant-önekli → cross-tenant okuma/yazma yapısal olarak ayrık. */
public final class InMemoryObjectStore implements ObjectStorePort {

    private record Stored(byte[] bytes, String contentType) {}

    private final Map<String, Stored> objects = new ConcurrentHashMap<>();

    @Override
    public Outcome<StoredObjectRef> put(TenantId tenantId, String key, byte[] bytes, String contentType) {
        if (tenantId == null || key == null || key.isBlank() || bytes == null || bytes.length == 0) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId/key/bytes zorunlu");
        }
        if (contentType == null || contentType.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "contentType zorunlu (write-side saklanır)");
        }
        objects.put(scoped(tenantId, key), new Stored(bytes.clone(), contentType));
        return Outcome.ok(new StoredObjectRef(key, bytes.length));
    }

    @Override
    public Outcome<StoredObject> read(TenantId tenantId, String key) {
        if (tenantId == null || key == null || key.isBlank()) {
            return Outcome.fail(OutcomeCode.INVALID, "tenantId/key zorunlu");
        }
        Stored stored = objects.get(scoped(tenantId, key));
        if (stored == null) {
            return Outcome.fail(OutcomeCode.NOT_FOUND, "obje yok/tenant-uyuşmazlığı (fail-closed)");
        }
        return Outcome.ok(new StoredObject(stored.bytes().clone(), stored.contentType()));
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
