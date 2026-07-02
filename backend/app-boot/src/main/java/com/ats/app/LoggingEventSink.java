package com.ats.app;

import com.ats.kernel.Outcome;
import com.ats.ops.OperationalEvent;
import com.ats.ops.OperationalEventSink;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Composition-katmanı operasyonel-event adaptörü: stdout structured log (ops
 * düzlemi; iş-kanıtı WORM ledger AYRI düzlemdir — ATS-0010). REGISTRY zaten
 * fail-closed doğrular; yine de savunma-derinliği: loggable olmayan pii_class
 * taşıyan event'in extras'ı YAZILMAZ (taxonomy §1 invariantı log yüzeyinde de).
 */
final class LoggingEventSink implements OperationalEventSink {

    private static final Logger LOG = LoggerFactory.getLogger("ats.ops");

    @Override
    public Outcome<Void> emit(OperationalEvent event) {
        if (event == null) {
            return Outcome.ok(null);
        }
        StringBuilder sb = new StringBuilder(128);
        sb.append("event=").append(event.eventTypeId())
                .append(" category=").append(event.category())
                .append(" severity=").append(event.severity())
                .append(" tenant=").append(event.tenantId() == null ? "-" : event.tenantId().value())
                .append(" pii_class=").append(event.piiClass());
        if (event.piiClass() != null && event.piiClass().loggable()) {
            for (Map.Entry<String, String> e : new TreeMap<>(event.extras()).entrySet()) {
                sb.append(' ').append(e.getKey()).append('=').append(e.getValue());
            }
        } else {
            sb.append(" extras=[suppressed-non-loggable]");
        }
        LOG.info(sb.toString());
        return Outcome.ok(null);
    }
}
