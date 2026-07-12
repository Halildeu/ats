package com.ats.contracts.governance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** P3-gov0 ApprovedModelSpec / ModelApprovalRef: içerik-adresli ref + fail-closed değer doğrulama + matchesReported. */
class ApprovedModelSpecTest {

    private static ApprovedModelSpec spec(String modelId, String version, Set<String> idAliases,
            Set<String> versionAliases, ApprovalStatus status) {
        return ApprovedModelSpec.of(Capability.TRANSCRIBE, "prov-a", modelId, version,
                idAliases, versionAliases, "endpoint-a", "ip-1", status, ModelScope.GLOBAL);
    }

    // ---- içerik-adresli ref: determinizm + alias sıra-varyansı + politika-değişimi ----

    @Test
    void same_fields_same_ref_deterministic() {
        ApprovedModelSpec a = spec("m1", "v1", Set.of("a", "b"), Set.of(), ApprovalStatus.APPROVED);
        ApprovedModelSpec b = spec("m1", "v1", Set.of("a", "b"), Set.of(), ApprovalStatus.APPROVED);
        assertEquals(a.approvalRef(), b.approvalRef());
        assertEquals(a.approvalRef(), a.canonicalDigest());
        assertTrue(a.approvalRef().value().matches("mapr_[0-9a-f]{64}"), a.approvalRef().value());
    }

    @Test
    void alias_set_order_variance_yields_same_ref() {
        Set<String> forward = new LinkedHashSet<>();
        forward.add("alpha");
        forward.add("beta");
        forward.add("gamma");
        Set<String> reverse = new LinkedHashSet<>();
        reverse.add("gamma");
        reverse.add("beta");
        reverse.add("alpha");
        ApprovedModelSpec a = spec("m1", "v1", forward, Set.of(), ApprovalStatus.APPROVED);
        ApprovedModelSpec b = spec("m1", "v1", reverse, Set.of(), ApprovalStatus.APPROVED);
        assertEquals(a.approvalRef(), b.approvalRef(), "alias sıra-varyansı ref'i değiştirmemeli");
    }

    @Test
    void status_change_does_not_change_ref() {
        ApprovedModelSpec approved = spec("m1", "v1", Set.of("a"), Set.of(), ApprovalStatus.APPROVED);
        ApprovedModelSpec revoked = spec("m1", "v1", Set.of("a"), Set.of(), ApprovalStatus.REVOKED);
        assertEquals(approved.approvalRef(), revoked.approvalRef(), "status ref girdisi değildir");
    }

    @Test
    void different_policy_field_changes_ref() {
        ApprovedModelSpec base = spec("m1", "v1", Set.of("a"), Set.of(), ApprovalStatus.APPROVED);
        assertNotEquals(base.approvalRef(), spec("m2", "v1", Set.of("a"), Set.of(), ApprovalStatus.APPROVED).approvalRef());
        assertNotEquals(base.approvalRef(), spec("m1", "v2", Set.of("a"), Set.of(), ApprovalStatus.APPROVED).approvalRef());
        assertNotEquals(base.approvalRef(), spec("m1", "v1", Set.of("a", "extra"), Set.of(), ApprovalStatus.APPROVED).approvalRef());
        // farklı capability de ref'i değiştirir
        ApprovedModelSpec cite = ApprovedModelSpec.of(Capability.CITE, "prov-a", "m1", "v1",
                Set.of("a"), Set.of(), "endpoint-a", "ip-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL);
        assertNotEquals(base.approvalRef(), cite.approvalRef());
    }

    // ---- matchesReported (alan-bazlı TAM eşleşme; absent ≠ mismatch) ----

    @Test
    void matches_reported_field_wise_exact_only() {
        ApprovedModelSpec s = spec("gpt", "v1", Set.of("gpt-alias"), Set.of("v1-alias"), ApprovalStatus.APPROVED);
        assertTrue(s.matchesReported("gpt", "v1"), "reported==requested");
        assertTrue(s.matchesReported("gpt-alias", "v1-alias"), "reported alias kümesinde");
        assertFalse(s.matchesReported("other", "v1"), "listelenmeyen id mismatch");
        assertFalse(s.matchesReported("gpt", "other"), "listelenmeyen versiyon mismatch");
        // id-alias versiyon için KULLANILAMAZ (yapısal ayrım)
        assertFalse(s.matchesReported("gpt", "gpt-alias"), "id-alias versiyon eşleşmesi vermez");
        // P3-gov0 HARD-REQUIRED (Codex durable-fix): absent (null/boş) alan artık MISMATCH
        assertFalse(s.matchesReported(null, "v1"), "absent id → mismatch (hard-required)");
        assertFalse(s.matchesReported("gpt", null), "absent versiyon → mismatch (hard-required)");
        assertFalse(s.matchesReported(null, null), "iki alan absent → mismatch");
        assertFalse(s.matchesReported("  ", "v1-alias"), "blank id → mismatch (hard-required)");
        // her iki alan present + eşleşiyor → hâlâ match (absent olmayan pozitif yol korunur)
        assertTrue(s.matchesReported("gpt", "v1"), "present+eşleşen alanlar hâlâ match");
        // TAM eşleşme: case-fold/contains YOK
        assertFalse(s.matchesReported("GPT", "v1"));
        assertFalse(s.matchesReported("gp", "v1"));
    }

    // ---- fail-closed değer doğrulama ----

    @Test
    void rejects_url_like_and_scheme_values() {
        assertThrows(IllegalArgumentException.class, () -> ApprovedModelSpec.of(
                Capability.TRANSCRIBE, "prov-a", "m1", "v1", Set.of(), Set.of(),
                "https://evil.example/stt", "ip-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL),
                "endpointRef '://' reddedilmeli");
        assertThrows(IllegalArgumentException.class, () -> ApprovedModelSpec.of(
                Capability.TRANSCRIBE, "prov-a", "m1", "v1", Set.of(), Set.of(),
                "host//path", "ip-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL),
                "endpointRef '//' (URL-benzeri) reddedilmeli");
        assertThrows(IllegalArgumentException.class, () -> ApprovedModelSpec.of(
                Capability.TRANSCRIBE, "prov-a", "m1://x", "v1", Set.of(), Set.of(),
                "endpoint-a", "ip-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL),
                "requestedModelId '://' reddedilmeli");
    }

    @Test
    void rejects_newline_blank_and_too_long() {
        assertThrows(IllegalArgumentException.class, () -> spec("m1\nx", "v1", Set.of(), Set.of(), ApprovalStatus.APPROVED),
                "newline reddedilmeli");
        assertThrows(IllegalArgumentException.class, () -> spec("  ", "v1", Set.of(), Set.of(), ApprovalStatus.APPROVED),
                "boş reddedilmeli");
        assertThrows(IllegalArgumentException.class, () -> spec("a".repeat(129), "v1", Set.of(), Set.of(), ApprovalStatus.APPROVED),
                ">128 reddedilmeli");
        // alias öğesi de aynı kurallarla
        assertThrows(IllegalArgumentException.class, () -> spec("m1", "v1", Set.of("bad space"), Set.of(), ApprovalStatus.APPROVED),
                "alias boşluk reddedilmeli");
    }

    @Test
    void rejects_canonical_value_in_its_own_alias_set() {
        assertThrows(IllegalArgumentException.class, () -> spec("m1", "v1", Set.of("m1"), Set.of(), ApprovalStatus.APPROVED),
                "kanonik id kendi alias kümesinde olamaz");
        assertThrows(IllegalArgumentException.class, () -> spec("m1", "v1", Set.of(), Set.of("v1"), ApprovalStatus.APPROVED),
                "kanonik versiyon kendi alias kümesinde olamaz");
    }

    // ---- ref bütünlüğü: biçim + eşleşmeyen approvalRef ----

    @Test
    void model_approval_ref_format_fail_closed() {
        assertThrows(IllegalArgumentException.class, () -> new ModelApprovalRef("mapr_XYZ"));
        assertThrows(IllegalArgumentException.class, () -> new ModelApprovalRef("deadbeef"));
        assertThrows(IllegalArgumentException.class, () -> new ModelApprovalRef("mapr_" + "A".repeat(64)),
                "büyük-hex reddedilmeli (yalnız küçük)");
        assertThrows(IllegalArgumentException.class, () -> new ModelApprovalRef(null));
    }

    @Test
    void mismatched_approval_ref_rejected_by_canonical_constructor() {
        ModelApprovalRef wrong = new ModelApprovalRef("mapr_" + "0".repeat(64));
        assertThrows(IllegalArgumentException.class, () -> new ApprovedModelSpec(
                wrong, Capability.TRANSCRIBE, "prov-a", "m1", "v1", Set.of(), Set.of(),
                "endpoint-a", "ip-1", ApprovalStatus.APPROVED, ModelScope.GLOBAL),
                "approvalRef içerik-adresli digest'e eşit değilse reddedilmeli");
    }
}
