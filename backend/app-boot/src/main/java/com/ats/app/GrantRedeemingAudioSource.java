package com.ats.app;

import com.ats.ingest.ObjectStorePort;
import com.ats.kernel.Outcome;
import com.ats.orchestration.AudioAccessGrants;
import com.ats.provider.AudioSource;

/**
 * slice-36 kompozisyon köprüsü (yalnız app-boot'ta yaşar — ai-orchestration ve
 * ai-provider-faz24 birbirine/ingest-media'ya bağlanmaz): one-shot handle →
 * {@link AudioAccessGrants#redeem} → tenant-scoped {@link ObjectStorePort#read}.
 * Ambient key kabul etmez; redeem edilemeyen her şey fail-closed.
 */
final class GrantRedeemingAudioSource implements AudioSource {

    private final AudioAccessGrants grants;
    private final ObjectStorePort objectStore;

    GrantRedeemingAudioSource(AudioAccessGrants grants, ObjectStorePort objectStore) {
        if (grants == null || objectStore == null) {
            throw new IllegalArgumentException("grants + objectStore zorunlu");
        }
        this.grants = grants;
        this.objectStore = objectStore;
    }

    @Override
    public Outcome<AudioBlob> read(String audioRef) {
        Outcome<AudioAccessGrants.Grant> redeemed = grants.redeem(audioRef);
        if (!(redeemed instanceof Outcome.Ok<AudioAccessGrants.Grant> redeemedOk)) {
            Outcome.Fail<AudioAccessGrants.Grant> fail = (Outcome.Fail<AudioAccessGrants.Grant>) redeemed;
            return Outcome.fail(fail.code(), fail.reason());
        }
        AudioAccessGrants.Grant grant = redeemedOk.value();
        Outcome<ObjectStorePort.StoredObject> stored =
                objectStore.read(grant.tenantId(), grant.objectKey());
        if (!(stored instanceof Outcome.Ok<ObjectStorePort.StoredObject> storedOk)) {
            Outcome.Fail<ObjectStorePort.StoredObject> fail = (Outcome.Fail<ObjectStorePort.StoredObject>) stored;
            return Outcome.fail(fail.code(), fail.reason());
        }
        return Outcome.ok(new AudioBlob(storedOk.value().bytes(), storedOk.value().contentType()));
    }
}
