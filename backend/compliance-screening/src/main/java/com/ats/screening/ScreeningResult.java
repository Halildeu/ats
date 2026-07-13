package com.ats.screening;

import java.util.List;
import java.util.Objects;

/**
 * Bir tarama çağrısının değişmez sonucu: çalıştırma kimliği, policy ref'i, kapsama durumu,
 * bulgular ve içerik-adresli bulgu-küme ref'i.
 *
 * <p><b>Fail-closed anlamı:</b> {@code coverage != SUPPORTED} olduğunda {@code findings} BOŞ
 * olsa dahi sonuç TEMİZ SAYILMAZ — girdi taranamadı ({@link #isClear()} yalnız SUPPORTED +
 * boş-bulgu için true döner). "Bulgu-boş" ile "temiz" farkı çağıranın coverage'ı kontrol
 * etmesini zorunlu kılar (sessiz-yeşil YOK).
 *
 * <p>YAPISAL YASAK: aggregate score / candidate-outcome / recommendation alanı YOKTUR.
 */
public record ScreeningResult(
        ScreeningRunId runId,
        ScreeningPolicyRef policyRef,
        Coverage coverage,
        List<ScreeningFinding> findings,
        FindingSetRef findingSetRef) {

    public ScreeningResult {
        Objects.requireNonNull(runId, "runId");
        Objects.requireNonNull(policyRef, "policyRef");
        Objects.requireNonNull(coverage, "coverage");
        Objects.requireNonNull(findingSetRef, "findingSetRef");
        findings = List.copyOf(findings); // derin-immutable kopya
    }

    /**
     * "Temiz" YALNIZ kapsama SUPPORTED iken ve hiç bulgu yokken doğrudur. Diğer coverage
     * durumlarında (unsupported/malformed/policy-unavailable) bulgu-boş olsa bile FALSE —
     * girdi otoritatif taranamadı.
     */
    public boolean isClear() {
        return coverage == Coverage.SUPPORTED && findings.isEmpty();
    }
}
