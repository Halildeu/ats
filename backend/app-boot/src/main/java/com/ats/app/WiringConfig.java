package com.ats.app;

import com.ats.consent.ConsentGate;
import com.ats.consent.ConsentService;
import com.ats.consent.ConsentStore;
import com.ats.contracts.AIProvider;
import com.ats.contracts.EvidenceLedger;
import com.ats.dsr.DsarStore;
import com.ats.dsr.DsrService;
import com.ats.dsr.RetentionScanner;
import com.ats.export.ExportArtifactStore;
import com.ats.export.ExportService;
import com.ats.ingest.InMemoryObjectStore;
import com.ats.ingest.IngestService;
import com.ats.ingest.LocalPatternScanAdapter;
import com.ats.ingest.MalwareScanPort;
import com.ats.ingest.ObjectStorePort;
import com.ats.ops.OperationalEventSink;
import com.ats.orchestration.CitationService;
import com.ats.orchestration.CitationStore;
import com.ats.orchestration.SegmentSanitizer;
import com.ats.orchestration.TranscriptStore;
import com.ats.orchestration.TranscriptionService;
import com.ats.persistence.PostgresCitationStore;
import com.ats.persistence.PostgresConsentStore;
import com.ats.persistence.PostgresDsarStore;
import com.ats.persistence.PostgresEvidenceLedger;
import com.ats.persistence.PostgresExportArtifactStore;
import com.ats.persistence.PostgresRetentionScanner;
import com.ats.persistence.PostgresReviewCaseStore;
import com.ats.persistence.PostgresTranscriptStore;
import com.ats.provider.HttpAIProvider;
import com.ats.review.HumanReviewService;
import com.ats.review.ReviewCaseStore;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * ATS-0008 D-A composition: TÜM domain bean'leri burada AÇIKÇA kurulur —
 * domain modüllerinde annotation/framework yoktur (ATS-0018 §2/§4; DataSource
 * yalnız com.ats.persistence.. + bu paket).
 *
 * Dürüst sınırlar (bu dilim):
 *  - ObjectStore = in-memory (raw-media object-store D-D G0-ertelenmiş; PG'ye
 *    yalnız opak key gider) → startup'ta WARN.
 *  - Flyway migrate bu process'in DSN'iyle koşar (dev/test kolaylığı);
 *    migration-role ≠ app-role AYRIMI deploy-wiring işidir (ADR-0018).
 *  - AIProvider ucu konfig-zorunlu; canlılığı boot'ta İDDİA EDİLMEZ
 *    (bağlantı hatası çağrı anında fail-closed Outcome).
 */
@Configuration
class WiringConfig {

    private static final Logger LOG = LoggerFactory.getLogger(WiringConfig.class);

    @Bean(destroyMethod = "close")
    HikariDataSource dataSource(AppProperties props) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(props.db().url());
        cfg.setUsername(props.db().username());
        cfg.setPassword(props.db().password());
        cfg.setMaximumPoolSize(10);
        cfg.setPoolName("ats-pg");
        return new HikariDataSource(cfg);
    }

    /** Migrate-on-start: V1..Vn (persistence-postgres jar'ından classpath:db/migration). */
    @Bean
    Flyway flyway(DataSource dataSource) {
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load();
        flyway.migrate();
        return flyway;
    }

    @Bean
    OperationalEventSink eventSink() {
        return new LoggingEventSink();
    }

    // --- persistence adapters (tamamı Flyway'e bağımlı: şema hazır olmadan bean yok) ---

    @Bean
    EvidenceLedger evidenceLedger(DataSource ds, Flyway flyway) {
        return new PostgresEvidenceLedger(ds);
    }

    @Bean
    ConsentStore consentStore(DataSource ds, Flyway flyway) {
        return new PostgresConsentStore(ds);
    }

    @Bean
    TranscriptStore transcriptStore(DataSource ds, Flyway flyway) {
        return new PostgresTranscriptStore(ds);
    }

    @Bean
    CitationStore citationStore(DataSource ds, Flyway flyway) {
        return new PostgresCitationStore(ds);
    }

    @Bean
    ReviewCaseStore reviewCaseStore(DataSource ds, Flyway flyway) {
        return new PostgresReviewCaseStore(ds);
    }

    @Bean
    ExportArtifactStore exportArtifactStore(DataSource ds, Flyway flyway) {
        return new PostgresExportArtifactStore(ds);
    }

    @Bean
    DsarStore dsarStore(DataSource ds, Flyway flyway) {
        return new PostgresDsarStore(ds);
    }

    @Bean
    RetentionScanner retentionScanner(DataSource ds, Flyway flyway) {
        return new PostgresRetentionScanner(ds);
    }

    // --- ingest ---

    @Bean
    MalwareScanPort malwareScanPort() {
        return new LocalPatternScanAdapter();
    }

    @Bean
    ObjectStorePort objectStorePort() {
        LOG.warn("ObjectStore = IN-MEMORY (kalıcı DEĞİL): raw-media object-store D-D "
                + "G0-ertelenmiş; process restart'ında ham medya kaybolur. PG'de yalnız opak key durur.");
        return new InMemoryObjectStore();
    }

    @Bean
    ConsentGate consentGate(ConsentStore store, OperationalEventSink sink) {
        return new ConsentGate(store, sink);
    }

    @Bean
    ConsentService consentService(ConsentStore store, EvidenceLedger ledger, OperationalEventSink sink) {
        return new ConsentService(store, ledger, sink);
    }

    @Bean
    IngestService ingestService(ConsentGate gate, MalwareScanPort scanner,
            ObjectStorePort objectStore, EvidenceLedger ledger, OperationalEventSink sink) {
        return new IngestService(gate, scanner, objectStore, ledger, sink);
    }

    // --- AI orchestration ---

    @Bean
    AIProvider aiProvider(AppProperties props) {
        return new HttpAIProvider(props.ai().baseUrl(), props.ai().timeout(), props.ai().bearer());
    }

    @Bean
    SegmentSanitizer segmentSanitizer() {
        return new SegmentSanitizer();
    }

    @Bean
    TranscriptionService transcriptionService(ConsentGate gate, AIProvider provider,
            SegmentSanitizer sanitizer, TranscriptStore transcriptStore,
            EvidenceLedger ledger, OperationalEventSink sink) {
        return new TranscriptionService(gate, provider, sanitizer, transcriptStore, ledger, sink);
    }

    @Bean
    CitationService citationService(ConsentGate gate, AIProvider provider,
            TranscriptStore transcriptStore, CitationStore citationStore,
            EvidenceLedger ledger, OperationalEventSink sink) {
        return new CitationService(gate, provider, transcriptStore, citationStore, ledger, sink);
    }

    // --- review / export / DSR ---

    @Bean
    HumanReviewService humanReviewService(ConsentGate gate, ReviewCaseStore store,
            EvidenceLedger ledger, OperationalEventSink sink) {
        return new HumanReviewService(gate, store, ledger, sink);
    }

    @Bean
    ExportService exportService(ReviewCaseStore reviewStore, CitationStore citationStore,
            ExportArtifactStore artifactStore, HumanReviewService humanReview,
            EvidenceLedger ledger, OperationalEventSink sink) {
        return new ExportService(reviewStore, citationStore, artifactStore, humanReview, ledger, sink);
    }

    @Bean
    DsrService dsrService(DsarStore dsarStore, TranscriptStore transcriptStore,
            CitationStore citationStore, ExportArtifactStore artifactStore,
            ReviewCaseStore reviewStore, HumanReviewService humanReview,
            EvidenceLedger ledger, OperationalEventSink sink) {
        return new DsrService(dsarStore, transcriptStore, citationStore, artifactStore,
                reviewStore, humanReview, ledger, sink);
    }
}
