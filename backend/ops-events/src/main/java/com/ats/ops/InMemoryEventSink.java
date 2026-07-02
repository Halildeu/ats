package com.ats.ops;

import com.ats.kernel.Outcome;
import java.util.ArrayList;
import java.util.List;

/** Slice-1 local adapter: test/doğrulama için event'leri sırayla tutar. */
public final class InMemoryEventSink implements OperationalEventSink {

    private final List<OperationalEvent> emitted = new ArrayList<>();

    @Override
    public Outcome<Void> emit(OperationalEvent event) {
        emitted.add(event);
        return Outcome.ok(null);
    }

    public List<OperationalEvent> emitted() {
        return List.copyOf(emitted);
    }
}
