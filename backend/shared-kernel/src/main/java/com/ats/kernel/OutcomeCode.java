package com.ats.kernel;

/**
 * Fail-closed sonuç kodları (ATS-0002 default-deny). TS contracts/ ile simetrik
 * (ATS-0001 kanonik; bu Java mirror'dır).
 */
public enum OutcomeCode {
    OK,
    DENIED,
    UNAUTHENTICATED,
    TENANT_SCOPE_VIOLATION,
    INVALID,
    NOT_FOUND,
    NOT_CONFIGURED,
    UNSUPPORTED_IN_GATE
}
