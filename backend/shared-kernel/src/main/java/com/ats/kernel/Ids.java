package com.ats.kernel;

/**
 * Tenant-scoped id tipleri (TS branded-string mirror'ı). Record wrapper →
 * tip güvenliği; değer JSON-uyumlu düz string. ATS-0002 tenant boundary için
 * TenantId her sorgu/store imzasında zorunlu.
 */
public final class Ids {
    private Ids() {}

    public record TenantId(String value) {}
    public record ActorId(String value) {}
    public record InterviewId(String value) {}
    public record EvidenceId(String value) {}
    public record PacketId(String value) {}
}
