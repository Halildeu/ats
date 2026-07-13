package com.ats.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.ApprovedModelRegistry;
import com.ats.contracts.governance.ApprovedModelSpec;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.GovernanceActorRef;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceLedger;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.TransitionId;
import com.ats.contracts.governance.TransitionReason;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import com.ats.persistence.ModelGovernanceAdminAppender;
import java.time.Clock;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * gov1-1e-c authority cutover boot/runtime E2E (Testcontainers-PG16): WORM'un TEK status-otorite
 * olduğunu ve CANLI revoke'un CACHE OLMADAN görünür olduğunu kanıtlar.
 *
 * <ol>
 *   <li>Boot: {@code WormGovernanceTestSeed} shipped kimlikleri APPROVED seed'ler → context kalkar.</li>
 *   <li>{@code registry.resolve(http-transcribe, TRANSCRIBE)} → {@code Ok} (WORM APPROVED).</li>
 *   <li>Admin-append REVOKE (writer-DataSource; owner-gated CLI simülasyonu).</li>
 *   <li>AYNI registry instance'ıyla tekrar resolve → {@code DENIED} — WORM taze okunur (cache olsaydı
 *       hâlâ Ok dönerdi). Re-approve → tekrar Ok.</li>
 * </ol>
 * Bu, catalog=immutable-policy / WORM=tek-status-otorite / boot-seed-YASAK (yazım ayrı admin-yolu)
 * invariant'larını uçtan uca doğrular.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.context.annotation.Import(WormGovernanceTestSeed.class)
class WormStatusCutoverE2ETest {

    @Container
    private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("ats.db.url", PG::getJdbcUrl);
        registry.add("ats.db.username", PG::getUsername);
        registry.add("ats.db.password", PG::getPassword);
        registry.add("ats.ai.base-url", () -> "http://127.0.0.1:9");
        registry.add("ats.security.jwks-uri", () -> "http://127.0.0.1:9/jwks.json");
        registry.add("ats.security.issuer", () -> "https://issuer.test");
        registry.add("ats.security.audience", () -> "ats-api");
        AiGovernanceTestSupport.registerHttpJson(registry);
    }

    @Autowired private ApprovedModelRegistry registry;
    @Autowired private DataSource dataSource;

    private static final GovernanceActorRef OWNER = new GovernanceActorRef("owner.gated-cli");

    @Test
    void live_revoke_is_visible_through_registry_without_cache() {
        // http-json TRANSCRIBE ref'i shipped kayıttan türetilir (drift-safe) — seed onu APPROVED yaptı.
        ModelApprovalRef ref = new ModelApprovalRef(AiGovernanceTestSupport.httpJson().transcribeRef());

        // (1) başta APPROVED → Ok
        Outcome<ApprovedModelSpec> initial = registry.resolve(ref, Capability.TRANSCRIBE);
        assertInstanceOf(Outcome.Ok.class, initial, "seed APPROVED → resolve Ok");

        ModelGovernanceAdminAppender appender =
                ModelGovernanceAdminAppender.overPostgres(dataSource, Clock.systemUTC());

        // (2) owner-gated REVOKE (APPROVED→REVOKED)
        Outcome<ModelGovernanceTransition> revoke = appender.appendTransition(new ModelGovernanceLedger.AppendCommand(
                ref, Capability.TRANSCRIBE, ApprovalStatus.APPROVED, ApprovalStatus.REVOKED,
                OWNER, TransitionReason.REVOKED_BY_OWNER, TransitionId.random()));
        assertInstanceOf(Outcome.Ok.class, revoke, "REVOKE append Ok");

        // (3) AYNI registry — WORM taze okunur → DENIED (cache YOK kanıtı)
        Outcome<ApprovedModelSpec> afterRevoke = registry.resolve(ref, Capability.TRANSCRIBE);
        assertInstanceOf(Outcome.Fail.class, afterRevoke, "canlı revoke → resolve DENIED");
        assertEquals(OutcomeCode.DENIED, ((Outcome.Fail<?>) afterRevoke).code(),
                "REVOKED status → DENIED (WORM tek otorite; cache olsaydı Ok kalırdı)");

        // (4) owner-gated RE-APPROVE (REVOKED→APPROVED) → tekrar Ok (anında görünür)
        Outcome<ModelGovernanceTransition> reapprove = appender.appendTransition(new ModelGovernanceLedger.AppendCommand(
                ref, Capability.TRANSCRIBE, ApprovalStatus.REVOKED, ApprovalStatus.APPROVED,
                OWNER, TransitionReason.REAPPROVED, TransitionId.random()));
        assertInstanceOf(Outcome.Ok.class, reapprove, "RE-APPROVE append Ok");
        assertTrue(registry.resolve(ref, Capability.TRANSCRIBE).isOk(), "re-approve anında görünür → Ok");
    }
}
