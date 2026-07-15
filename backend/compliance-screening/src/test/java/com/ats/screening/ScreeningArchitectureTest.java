package com.ats.screening;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/**
 * ATS 156-a/156-b boundary (ArchUnit): compliance-screening framework-free çekirdek + port
 * sahibidir. Framework/persistence/vendor'a ve runtime-akışına bağlanamaz; adapter bağımlılığı
 * ters yöndedir ({@code persistence-postgres -> compliance-screening}).
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
                        "java.sql..", "javax.sql..",
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
                .as("screening çekirdek+portu runtime-akışına veya EvidenceLedger'a bağlanamaz; "
                        + "adapter ters yönden bağlanır")
                .check(ATS);
    }

    @Test
    void screening_never_depends_on_its_persistence_adapter() {
        noClasses().that().resideInAPackage("com.ats.screening..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.persistence..")
                .as("hexagonal yön: screening portu persistence adapter'ını göremez")
                .check(ATS);
    }

    @Test
    void screening_depends_only_on_itself_shared_kernel_and_jdk() {
        classes().that().resideInAPackage("com.ats.screening..")
                .should().onlyDependOnClassesThat().resideInAnyPackage(
                        "com.ats.screening..", "com.ats.kernel..", "java..")
                .as("screening çekirdek+portu yalnız kendisi, shared-kernel ve JDK'ya bağlanabilir")
                .check(ATS);
    }
}
