package com.ats.ops;

/**
 * event-taxonomy pii_class sözlüğü (ATS-0010). Operasyonel log düzleminde yalnız
 * loggable sınıflar taşınabilir; RAW_PII/CONTENT/SECRET fail-closed reddedilir
 * (taxonomy §1 invariantının kod karşılığı).
 */
public enum PiiClass {
    NONE(true),
    ID_ONLY(true),
    PSEUDONYMIZED(true),
    RAW_PII(false),
    CONTENT(false),
    SECRET(false);

    private final boolean loggable;

    PiiClass(boolean loggable) {
        this.loggable = loggable;
    }

    public boolean loggable() {
        return loggable;
    }
}
