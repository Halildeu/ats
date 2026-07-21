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
    OFFER_PENDING,
    OFFER_ACCEPTED,
    OFFER_DECLINED,
    OFFER_WITHDRAWN,
    HIRED,
    REJECTED,
    WITHDRAWN
}
