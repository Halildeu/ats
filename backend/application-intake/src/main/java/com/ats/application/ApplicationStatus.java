package com.ats.application;

/**
 * İlk müşteri-dikey diliminin insan kontrollü, kapalı durum kümesi.
 * Ret/teklif/otomatik karar bilerek bu kümede değildir.
 */
public enum ApplicationStatus {
    SUBMITTED,
    UNDER_REVIEW,
    INTERVIEW_PENDING
}
