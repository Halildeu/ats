package com.ats.orchestration;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/**
 * gov1-1c boundary (ArchUnit): ai-orchestration YALNIZ {@code com.ats.contracts.governance}
 * PORTU'na ({@code ModelGovernanceGate}) bağlanır — adapter ({@code com.ats.governance}), boot-gate
 * binding'i ({@code AuthorizedModelBindings}) ve composition katmanı ({@code com.ats.app}) ORKESTRASYON
 * için görünmez. Böylece model-governance adapter/wiring, orkestrasyonu port ardında değiştirebilir.
 */
class OrchestrationGovernanceBoundaryTest {

    private static final JavaClasses ORCHESTRATION = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.ats.orchestration");

    @Test
    void orchestration_does_not_depend_on_governance_adapter() {
        noClasses().that().resideInAPackage("com.ats.orchestration..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.governance..")
                .as("ai-orchestration model-governance ADAPTER'ına bağlanamaz (yalnız port)")
                .check(ORCHESTRATION);
    }

    @Test
    void orchestration_does_not_depend_on_composition_layer() {
        noClasses().that().resideInAPackage("com.ats.orchestration..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.app..")
                .as("ai-orchestration composition/app-boot'a (AuthorizedModelBindings dahil) bağlanamaz")
                .check(ORCHESTRATION);
    }
}
