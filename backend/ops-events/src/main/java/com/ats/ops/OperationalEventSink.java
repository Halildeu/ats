package com.ats.ops;

import com.ats.kernel.Outcome;

/** Operasyonel event emisyon portu (transport sonraki slice; slice-1 in-memory). */
public interface OperationalEventSink {

    Outcome<Void> emit(OperationalEvent event);
}
