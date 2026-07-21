package com.ats.app;

import com.ats.app.screening.ScreeningRuntimeService;
import com.ats.consent.ConsentGate;
import com.ats.consent.ConsentService;
import com.ats.consent.ConsentStore;
import com.ats.contracts.AIProvider;
import com.ats.contracts.EvidenceLedger;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceGate;
import com.ats.contracts.governance.ModelGovernanceJournal;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.dsr.DsarStore;
import com.ats.dsr.DsrService;
import com.ats.dsr.ErasureExecutionStore;
import com.ats.dsr.ErasureScopeResolver;
import com.ats.dsr.RetentionScanner;
import com.ats.export.ExportArtifactStore;
import com.ats.export.ExportService;
import com.ats.governance.EvidenceLedgerModelGovernanceJournal;
import com.ats.governance.FileBackedApprovedModelRegistry;
import com.ats.governance.InMemoryApprovedModelRegistry;
import com.ats.governance.RegistryBackedModelGovernanceGate;
import com.ats.ingest.InMemoryObjectStore;
import com.ats.ingest.IngestService;
import com.ats.ingest.LocalPatternScanAdapter;
import com.ats.ingest.MalwareScanPort;
import com.ats.ingest.ObjectStorePort;
import com.ats.ops.OperationalEventSink;
import com.ats.orchestration.AudioAccessGrants;
import com.ats.orchestration.CitationService;
import com.ats.orchestration.CitationStore;
import com.ats.orchestration.InMemoryAudioAccessGrants;
import com.ats.orchestration.SegmentSanitizer;
import com.ats.orchestration.TranscriptStore;
import com.ats.orchestration.TranscriptionService;
import com.ats.persistence.PostgresCitationStore;
import com.ats.persistence.PostgresConsentStore;
import com.ats.persistence.PostgresDsarStore;
import com.ats.persistence.PostgresErasureExecutionStore;
import com.ats.persistence.PostgresErasureScopeResolver;
import com.ats.persistence.PostgresEvidenceLedger;
import com.ats.persistence.PostgresExportArtifactStore;
import com.ats.persistence.PostgresModelGovernanceLedger;
import com.ats.persistence.PostgresRetentionScanner;
import com.ats.persistence.PostgresReviewCaseStore;
import com.ats.persistence.PostgresScreeningEvidenceStore;
import com.ats.persistence.PostgresTranscriptStore;
import com.ats.provider.Faz24LiveSttProvider;
import com.ats.provider.HttpAIProvider;
import com.ats.review.HumanReviewService;
import com.ats.review.ReviewCaseStore;
import com.ats.screening.ProtectedAttributeScreener;
import com.ats.screening.ScreeningEvidenceStore;
import com.zaxxer.hikari.HikariConfig;
import java.nio.file.Path;
import java.time.Clock;
import java.util.EnumMap;
import java.util.Map;
import javax.net.ssl.SSLContext;
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
 *  - ObjectStore = yalnız açık in-memory-dev opt-in'iyle geçici adapter
 *    (raw-media object-store D-D G0-ertelenmiş; PG'ye yalnız opak key gider).
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
    ErasureScopeResolver erasureScopeResolver(DataSource ds, Flyway flyway) {
        return new PostgresErasureScopeResolver(ds);
    }

    @Bean
    ErasureExecutionStore erasureExecutionStore(DataSource ds, Flyway flyway) {
        return new PostgresErasureExecutionStore(ds);
    }

    @Bean
    RetentionScanner retentionScanner(DataSource ds, Flyway flyway) {
        return new PostgresRetentionScanner(ds);
    }

    @Bean
    ScreeningEvidenceStore screeningEvidenceStore(DataSource ds, Flyway flyway) {
        return new PostgresScreeningEvidenceStore(ds);
    }

    @Bean
    ProtectedAttributeScreener protectedAttributeScreener() {
        return ProtectedAttributeScreener.fromClasspath(
                "screening/protected-attribute-screening-policy.v1.json");
    }

    @Bean
    ScreeningRuntimeService screeningRuntimeService(
            ProtectedAttributeScreener screener,
            ScreeningEvidenceStore evidenceStore,
            TranscriptStore transcriptStore,
            CitationStore citationStore,
            OperationalEventSink eventSink) {
        return new ScreeningRuntimeService(
                screener, evidenceStore, transcriptStore, citationStore,
                eventSink, Clock.systemUTC());
    }

    // --- ingest ---

    @Bean
    MalwareScanPort malwareScanPort() {
        return new LocalPatternScanAdapter();
    }

    @Bean
    ObjectStorePort objectStorePort(AppProperties props) {
        if (!"in-memory-dev".equals(props.objectStore().mode())) {
            // AppProperties kapalı kümesi ilk savunmadır; wiring'de de sessiz fallback yoktur.
            throw new IllegalStateException(
                    "ObjectStore wiring reddedildi: yalnız açık in-memory-dev opt-in'i destekleniyor");
        }
        LOG.warn("ObjectStore = IN-MEMORY-DEV (kalıcı DEĞİL, açık opt-in): raw-media "
                + "object-store D-D G0-ertelenmiş; process restart'ında ham medya kaybolur. "
                + "PG'de yalnız opak key durur; production-ready/crypto-erasure kanıtı değildir.");
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
    AudioAccessGrants audioAccessGrants(AppProperties props) {
        return new InMemoryAudioAccessGrants(Clock.systemUTC(), props.ai().grantTtl());
    }

    /**
     * slice-36 sağlayıcı seçimi (kapalı küme AppProperties.Ai'de boot-validate).
     * live-stt modunda cite bilinçli NOT_CONFIGURED kalır (Faz24LiveSttProvider
     * içinde): varsayımsal /v1/cite contract'ına otomatik delege YOK — gerçek bir
     * cite servisi kanıtlanırsa ayrı, açık config ile bağlanır (Codex plan-REVISE).
     * slice-38: mTLS SSLContext wiring LANDED (mode=required PKCS12'den kurulur);
     * canlı owner-CA client-auth round-trip ise deploy/evidence işidir (doğru
     * client-CA denetim-PC tarafında — test-CA ≠ canlı-CA).
     */
    @Bean
    AIProvider aiProvider(AppProperties props, AudioAccessGrants grants, ObjectStorePort objectStore,
            AuthorizedModelBindings authorizedModelBindings) {
        // authorizedModelBindings PARAMETRE bağımlılığı = "gate-then-construct" garantisi (Codex
        // durable-fix): Spring bu provider bean'ini yalnız governance boot-gate GEÇTİKTEN sonra kurar;
        // authorizeProvider patlarsa bu metot HİÇ çağrılmaz (governance artık dekoratif değil).
        return buildAiProvider(props, grants, objectStore);
    }

    /** slice-36 provider-seçim çekirdeği (governance gate'ten bağımsız test edilebilir birim). */
    AIProvider buildAiProvider(AppProperties props, AudioAccessGrants grants, ObjectStorePort objectStore) {
        return switch (props.ai().provider()) {
            case "live-stt" -> liveSttProvider(props, grants, objectStore);
            default -> new HttpAIProvider(props.ai().baseUrl(), props.ai().timeout(), props.ai().bearer());
        };
    }

    private static Faz24LiveSttProvider liveSttProvider(AppProperties props,
            AudioAccessGrants grants, ObjectStorePort objectStore) {
        GrantRedeemingAudioSource audioSource = new GrantRedeemingAudioSource(grants, objectStore);
        AppProperties.Mtls mtls = props.ai().mtls();
        if ("disabled".equals(mtls.mode())) {
            // Yalnız AÇIK beyanla plain (dev/test); prod kanonik yol client-auth'tur.
            LOG.warn("live-stt mTLS DISABLED (ats.ai.mtls.mode=disabled) — plain HTTPS; "
                    + "prod kanonik yol client-auth, bu yalnız dev/test için.");
            return new Faz24LiveSttProvider(props.ai().baseUrl(), props.ai().timeout(),
                    audioSource, props.ai().language());
        }
        // required (default): SSLContext client cert + truststore'dan (fail-closed).
        SSLContext sslContext = MtlsSslContextFactory.fromPkcs12(
                Path.of(mtls.keyStorePath()), mtls.keyStorePassword(), Path.of(mtls.trustStorePath()));
        LOG.info("live-stt mTLS SSLContext configured: yes, mode=required");
        return new Faz24LiveSttProvider(props.ai().baseUrl(), props.ai().timeout(),
                audioSource, props.ai().language(), sslContext);
    }

    @Bean
    SegmentSanitizer segmentSanitizer() {
        return new SegmentSanitizer();
    }

    @Bean
    TranscriptionService transcriptionService(ConsentGate gate, ModelGovernanceGate governanceGate,
            ModelGovernanceJournal journal, AIProvider provider, SegmentSanitizer sanitizer,
            TranscriptStore transcriptStore, EvidenceLedger ledger, OperationalEventSink sink, AudioAccessGrants grants) {
        return new TranscriptionService(gate, governanceGate, journal, provider, sanitizer, transcriptStore, ledger, sink, grants);
    }

    @Bean
    CitationService citationService(ConsentGate gate, ModelGovernanceGate governanceGate,
            ModelGovernanceJournal journal, AIProvider provider, TranscriptStore transcriptStore,
            CitationStore citationStore, EvidenceLedger ledger, OperationalEventSink sink) {
        return new CitationService(gate, governanceGate, journal, provider, transcriptStore, citationStore, ledger, sink);
    }

    // --- model governance (P3-gov0): onaylı-model registry + fail-closed boot-doğrulama ---

    /**
     * Onaylı-model registry (gov1-1e-c authority cutover): konfig'te kaynak verilmişse dosya-destekli
     * (yükleme-anı fail-closed politika-içeriği), yoksa boş in-memory. Adapter model-governance modülünde;
     * port contracts-java'da (ArchUnit boundary).
     *
     * <p><b>1e-c:</b> registry artık İKİ KAYNAĞI birleştirir — catalog (resource, değişmez politika-içeriği)
     * + WORM ({@link ModelGovernanceLedger.Reader} bean, TEK status-otorite). {@code resolve} her çağrıda
     * WORM'dan CARI durumu TAZE okur (cache YOK; revoke anında görünür). Reader Flyway'e bağlı olduğundan
     * (şema hazır olmadan Reader bean'i yok) bu registry de dolaylı Flyway'e bağlıdır → boot-gate WORM
     * migrate edildikten sonra resolve eder. Normal boot WORM'a YAZMAZ (boot-seed YASAK); WORM'da APPROVED
     * transition yoksa boot-gate fail-closed düşer (owner-gated ilk transition ayrı CLI/workflow — ADR-0021).
     */
    @Bean
    ApprovedModelRegistry approvedModelRegistry(ModelGovernanceProperties gov, ModelGovernanceLedger.Reader worm) {
        String resource = gov.approvedModelsResource();
        if (resource == null) {
            LOG.warn("model-governance: onaylı-model kaynağı verilmedi — BOŞ registry "
                    + "(wire'lanmış capability doğrulanamaz; wiring varsa boot fail-closed düşer).");
            return InMemoryApprovedModelRegistry.empty();
        }
        return FileBackedApprovedModelRegistry.fromClasspath(resource, worm);
    }

    /**
     * Fail-closed boot-gate (Codex durable-fix): GERÇEK provider'ın enabled-capability kümesinin her
     * üyesi beyan edilen onaylı-politikaya çözülüp cross-check'lerden geçmezse bu @Bean fırlatır →
     * composition kalkamaz. {@code AIProvider} bean'i bu bean'e depend eder (gate-then-construct):
     * provider yalnız gate geçtikten sonra kurulur. Boot-log yalnız approvalRef+capability+
     * providerRef+endpointRef taşır (secret/URL YOK).
     */
    @Bean
    AuthorizedModelBindings authorizedModelBindings(ApprovedModelRegistry registry, AppProperties props) {
        AuthorizedModelBindings bindings = ModelGovernanceBoot.authorizeProvider(
                registry, props.ai().provider(), props.ai().endpointRef(), props.ai().approvals());
        bindings.bindings().forEach((cap, spec) -> LOG.info(
                "model-governance boot-gate APPROVED: capability={} providerRef={} endpointRef={} approvalRef={}",
                cap, spec.configuredProviderRef(), spec.endpointRef(), spec.approvalRef().value()));
        LOG.info("model-governance boot-gate tamam: provider={} enabled-capabilities={} (hepsi APPROVED onaylı).",
                bindings.provider(), bindings.bindings().keySet());
        return bindings;
    }

    /**
     * gov1-1c çalışma-anı model-governance kapısı: boot-gate çıktısından (capability→onaylı spec)
     * capability→onay-ref binding'i türetir ve {@link ApprovedModelRegistry} PORTU'yla sarar.
     * Orkestrasyon YALNIZ {@link ModelGovernanceGate} porta bağlıdır (adapter/binding'e değil —
     * ArchUnit boundary). Kapı {@link AuthorizedModelBindings}'e depend eder → yalnız boot-gate
     * geçtikten sonra kurulur (gate-then-construct ile aynı ordering).
     */
    @Bean
    ModelGovernanceGate modelGovernanceGate(ApprovedModelRegistry registry, AuthorizedModelBindings bindings) {
        Map<Capability, ModelApprovalRef> capabilityBindings = new EnumMap<>(Capability.class);
        bindings.bindings().forEach((cap, spec) -> capabilityBindings.put(cap, spec.approvalRef()));
        return new RegistryBackedModelGovernanceGate(registry, capabilityBindings);
    }

    /**
     * gov1-1d AI-invocation WORM governance-journal'ı: her invocation'ı iki-fazlı (authorized/terminal)
     * WORM'a yazar (crash-gap makine-tespit edilebilir). Boot-snapshot = gate boot-gate çıktısı
     * ({@code capability→onaylı spec}); adapter permit'i bu snapshot ile re-verify eder (audit-bütünlüğü).
     * Orkestrasyon YALNIZ {@link ModelGovernanceJournal} porta bağlıdır (adapter/binding'e değil —
     * ArchUnit boundary). Kapı gibi {@link AuthorizedModelBindings}'e depend eder → boot-gate sonrası kurulur.
     */
    @Bean
    ModelGovernanceJournal modelGovernanceJournal(EvidenceLedger ledger, AuthorizedModelBindings bindings) {
        return new EvidenceLedgerModelGovernanceJournal(ledger, bindings.bindings(), Clock.systemUTC());
    }

    /**
     * gov1-1e-b GLOBAL model-governance WORM'unun READ tarafı (yalnız {@link ModelGovernanceLedger.Reader}).
     * Composition BUNU görür — WRITE cephesi ({@code Appender}) BİLİNÇLE wire EDİLMEZ (least-privilege;
     * yazım {@code ModelGovernanceAdminAppender} + owner-gated writer-rol ile ayrı CLI/workflow'da). Bu slice
     * yalnız Reader-wiring; {@code ApprovedModelRegistry}/{@code resolve} status-source cutover'ı 1e-c.
     * Flyway'e bağımlı (V4 şema hazır olmadan bean yok); okuma lazy (readAll çağrısında).
     */
    @Bean
    ModelGovernanceLedger.Reader modelGovernanceLedgerReader(DataSource ds, Flyway flyway) {
        // Codex 1e-b: PostgresModelGovernanceLedger concrete'i hem Reader hem Appender implement eder.
        // Doğrudan dönersek bean'in runtime nesnesi `instanceof Appender`=true olur → runtime kodu
        // Reader'ı Appender'a CAST edip write-yüzeyine ulaşabilir (interface-split compile-time sınırı
        // delinir). Yalnız readAll'ı ifşa eden Reader-only wrapper döndür → capability sınırı nesne
        // seviyesinde kilitli (DB SELECT-only rol ikinci savunma katmanı; bu birinci).
        PostgresModelGovernanceLedger delegate = new PostgresModelGovernanceLedger(ds, Clock.systemUTC());
        return delegate::readAll;
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
    DsrService dsrService(DsarStore dsarStore, ErasureScopeResolver scopeResolver,
            ErasureExecutionStore executionStore, ObjectStorePort objectStore,
            TranscriptStore transcriptStore,
            CitationStore citationStore, ExportArtifactStore artifactStore,
            ReviewCaseStore reviewStore, HumanReviewService humanReview,
            ScreeningEvidenceStore screeningStore,
            EvidenceLedger ledger, OperationalEventSink sink) {
        return new DsrService(dsarStore, scopeResolver, executionStore, objectStore,
                transcriptStore, citationStore, artifactStore,
                reviewStore, humanReview, screeningStore, ledger, sink, Clock.systemUTC());
    }
}
