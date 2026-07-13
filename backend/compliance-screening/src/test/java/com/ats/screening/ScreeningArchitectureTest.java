package com.ats.screening;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/**
 * ATS 156-a boundary (ArchUnit): compliance-screening framework-free SAF ÇEKİRDEKtir.
 * Framework/persistence/vendor'a VE runtime-akışına (orchestration/provider/export/governance/
 * contracts-port) bağlanamaz — 156-a KERNEL, runtime-wiring 156-b/c/d'de yapılır.
 */
class ScreeningArchitectureTest {

    private static final JavaClasses ATS = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.ats");

    @Test
    void screening_kernel_has_no_framework_persistence_or_vendor_deps() {
        noClasses().that().resideInAPackage("com.ats.screening..")
                .should().dependOnClassesThat()
                .resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.persistence..", "javax.persistence..",
                        "org.springframework.data..", "org.flywaydb..", "org.hibernate..",
                        "com.platform..", "io.keycloak..", "org.keycloak..",
                        "dev.openfga..", "io.openfga..",
                        "software.amazon.awssdk..", "com.amazonaws..")
                .as("compliance-screening kernel framework/persistence/vendor'a bağlanamaz")
                .check(ATS);
    }

    @Test
    void screening_kernel_is_not_wired_to_runtime_flow() {
        noClasses().that().resideInAPackage("com.ats.screening..")
                .should().dependOnClassesThat()
                .resideInAnyPackage(
                        "com.ats.orchestration..", "com.ats.provider..", "com.ats.export..",
                        "com.ats.governance..", "com.ats.contracts..")
                .as("156-a KERNEL runtime-akışına (orchestration/provider/export/governance/contracts) "
                        + "bağlanamaz — wiring 156-b/c/d")
                .check(ATS);
    }

    @Test
    void screening_kernel_depends_only_on_kernel_and_jdk() {
        noClasses().that().resideInAPackage("com.ats..")
                .and().resideOutsideOfPackage("com.ats.screening..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.screening..")
                .as("çekirdek tek-yön: başka ats modülü screening'e bağlanmaz (156-a inert)")
                .check(ATS);
    }
}
