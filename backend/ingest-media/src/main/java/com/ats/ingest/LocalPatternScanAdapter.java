package com.ats.ingest;

import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import java.nio.charset.StandardCharsets;

/**
 * Slice-1 deterministik local adapter: endüstri-standardı EICAR test imzasının
 * ön-ekini reddeder (gerçek AV değildir; davranış test edilebilir olsun diye
 * gerçek bir imza kuralı uygular — her-şeye-CLEAN sahte güvenlik stub'u DEĞİL).
 */
public final class LocalPatternScanAdapter implements MalwareScanPort {

    private static final byte[] EICAR_PREFIX = "X5O!P%@AP".getBytes(StandardCharsets.US_ASCII);

    @Override
    public Outcome<ScanResult> scan(byte[] bytes) {
        if (bytes == null) {
            return Outcome.fail(OutcomeCode.INVALID, "bytes null");
        }
        return Outcome.ok(containsPrefix(bytes) ? ScanResult.REJECTED : ScanResult.CLEAN);
    }

    private static boolean containsPrefix(byte[] haystack) {
        outer:
        for (int i = 0; i + EICAR_PREFIX.length <= haystack.length; i++) {
            for (int j = 0; j < EICAR_PREFIX.length; j++) {
                if (haystack[i + j] != EICAR_PREFIX[j]) {
                    continue outer;
                }
            }
            return true;
        }
        return false;
    }
}
