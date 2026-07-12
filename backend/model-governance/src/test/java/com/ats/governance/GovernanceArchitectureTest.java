package com.ats.governance;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/**
 * P3-gov0 boundary (ArchUnit): port contracts-java'da, adapter model-governance'ta.
 * Adapter framework/persistence/vendor'a VE orkestrasyona bağlanamaz; port (contracts) ve
 * shared-kernel adapter'a bağlanamaz (tek-yön bağımlılık).
 */
class GovernanceArchitectureTest {

    private static final JavaClasses ATS = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.ats");

    @Test
    void governance_adapter_has_no_framework_persistence_or_vendor_deps() {
        noClasses().that().resideInAPackage("com.ats.governance..")
                .should().dependOnClassesThat()
                .resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.persistence..", "javax.persistence..",
                        "org.springframework.data..", "org.flywaydb..", "org.hibernate..",
                        "com.platform..", "io.keycloak..", "org.keycloak..",
                        "dev.openfga..", "io.openfga..",
                        "software.amazon.awssdk..", "com.amazonaws..")
                .as("model-governance adapter framework/persistence/vendor'a bağlanamaz")
                .check(ATS);
    }

    @Test
    void governance_adapter_is_not_coupled_to_orchestration() {
        noClasses().that().resideInAPackage("com.ats.governance..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.orchestration..")
                .as("onaylı-model adapter'ı orkestrasyona bağlanamaz (policy-registry kapsamı)")
                .check(ATS);
    }

    @Test
    void contracts_port_does_not_depend_on_governance_adapter() {
        noClasses().that().resideInAPackage("com.ats.contracts..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.governance..")
                .as("port (contracts-java) adapter'a (model-governance) bağlı olamaz")
                .check(ATS);
    }

    @Test
    void shared_kernel_does_not_depend_on_governance() {
        noClasses().that().resideInAPackage("com.ats.kernel..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.governance..")
                .as("shared-kernel model-governance'a bağlı olamaz")
                .check(ATS);
    }
}
