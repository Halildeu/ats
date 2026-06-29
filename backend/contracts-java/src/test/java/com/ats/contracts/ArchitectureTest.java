package com.ats.contracts;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/**
 * ATS-0008 D-F boundary enforcement (ArchUnit). Pre-G0 sert kural: contracts/kernel
 * framework/persistence/vendor/platform iç-paketine bağlanamaz → bağımsız ürün
 * boundary (ADR-0001) + land-expand split ucuz kalır.
 */
class ArchitectureTest {

    private static final JavaClasses ATS = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.ats");

    @Test
    void contracts_and_kernel_have_no_persistence_or_framework_deps() {
        noClasses().should().dependOnClassesThat()
                .resideInAnyPackage(
                        "jakarta.persistence..",
                        "javax.persistence..",
                        "org.springframework.data..",
                        "org.flywaydb..",
                        "org.hibernate..")
                .as("ATS-0008: sözleşme/kernel pre-G0 persistence/JPA/Flyway'e bağlanamaz")
                .check(ATS);
    }

    @Test
    void no_platform_internal_or_vendor_sdk_dependency() {
        noClasses().should().dependOnClassesThat()
                .resideInAnyPackage(
                        "com.platform..",
                        "io.keycloak..", "org.keycloak..",
                        "dev.openfga..", "io.openfga..",
                        "software.amazon.awssdk..", "com.amazonaws..")
                .as("ADR-0001: platform iç-paket / vendor SDK coupling YASAK")
                .check(ATS);
    }

    @Test
    void shared_kernel_does_not_depend_on_contracts() {
        noClasses().that().resideInAPackage("com.ats.kernel..")
                .should().dependOnClassesThat().resideInAPackage("com.ats.contracts..")
                .as("katmanlama: shared-kernel sözleşmelere bağlı olamaz")
                .check(ATS);
    }
}
