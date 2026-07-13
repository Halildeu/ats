package com.ats.persistence;

import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.kernel.Outcome;
import java.time.Clock;
import javax.sql.DataSource;

/**
 * gov1-1e-b — model-governance WORM'una yazmanın EXPLICIT admin-writer yetki-yüzeyi. WRITE otoritesini
 * ({@link ModelGovernanceLedger.Appender}) TEK bir yerde toplar; app-boot'un normal composition'ı bu tipi
 * GÖRMEZ (yalnız {@code ModelGovernanceLedger.Reader} bean'i wire edilir — least-privilege). Böylece bir
 * transition ancak açıkça bir writer-DataSource/rol sağlanarak ({@code ats_governance_writer}) yazılabilir;
 * uygulama runtime'ı (SELECT-only {@code ats_app}) yazamaz.
 *
 * <p><b>Codex 019f57cb 1e-b — boot-seed YASAK:</b> bu tip constructor/factory'de HİÇBİR transition yazmaz
 * (no auto-seed). Yazım YALNIZ açık {@link #appendTransition} çağrısıyla olur ve tüm fail-closed CAS/idempotency/
 * matris kuralları alttaki {@link PostgresModelGovernanceLedger} adapter'ında zorlanır (bu tip yalnız yetki-
 * daraltıcı cephe; iş kuralı eklemez/gevşetmez).
 *
 * <p><b>Canlı bağlama (owner-gated; bu slice dışı):</b> canlıda ayrı bir CLI/workflow bu cepheyi
 * {@link #overPostgres(DataSource, Clock)} ile owner-gated writer kimliğiyle kurar (Vault'tan writer DSN;
 * plaintext credential WORM/log/argv'ye GİRMEZ). Bu slice'ta cephe + Testcontainers append-path testleri yeterli;
 * canlı-cred + arg-parsing deploy düzleminin işidir.
 */
public final class ModelGovernanceAdminAppender {

    private final ModelGovernanceLedger.Appender writer;

    /**
     * Açık writer authority ile kurar. {@code writer} = WORM'a yazma otoritesi (test'te doğrudan enjekte
     * edilebilir; canlıda writer-rol adapter'ından gelir). null → fail-closed.
     */
    public ModelGovernanceAdminAppender(ModelGovernanceLedger.Appender writer) {
        if (writer == null) {
            throw new IllegalArgumentException("writer (Appender authority) zorunlu (fail-closed)");
        }
        this.writer = writer;
    }

    /**
     * PostgreSQL writer-DataSource üstünde admin-appender kurar (owner-gated writer-rol bağlantısı çağırana ait).
     * {@code writerDataSource} {@code ats_governance_writer} (INSERT+SELECT) olarak bağlanmalı; app-boot'un
     * SELECT-only runtime DataSource'u DEĞİL. Sadece Appender yüzeyi açılır (readAll cephesi açılmaz).
     */
    public static ModelGovernanceAdminAppender overPostgres(DataSource writerDataSource, Clock clock) {
        return new ModelGovernanceAdminAppender(new PostgresModelGovernanceLedger(writerDataSource, clock));
    }

    /**
     * Bir transition'ı admin yetkisiyle append eder — tüm fail-closed davranış (idempotent-replay,
     * STALE_EXPECTED_FROM CAS, ILLEGAL_TRANSITION, INVALID_COMMAND) alttaki adapter'da. Bu cephe kuralı
     * gevşetmez; yalnız "kim yazabilir" yetkisini daraltır.
     */
    public Outcome<ModelGovernanceTransition> appendTransition(ModelGovernanceLedger.AppendCommand command) {
        return writer.append(command);
    }
}
