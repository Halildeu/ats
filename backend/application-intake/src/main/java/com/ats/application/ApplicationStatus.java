package com.ats.application;

/**
 * İnsan kontrollü, kapalı başvuru durum kümesi. Mülakat ve teklif durumları
 * kendi domain servisleri gelmeden bu genel application-status ucundan
 * üretilemez; otomatik karar hiçbir durumda yoktur.
 */
public enum ApplicationStatus {
    SUBMITTED,
    UNDER_REVIEW,
    INTERVIEW_PENDING,
    REJECTED,
    WITHDRAWN
}
