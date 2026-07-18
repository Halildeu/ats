package com.ats.application;

import java.util.Map;
import java.util.Set;

/** ATS-0022 ilan durum makinesi; ARCHIVED terminaldir. */
public enum JobPostingStatus {
    DRAFT,
    PUBLISHED,
    PAUSED,
    CLOSED,
    ARCHIVED;

    private static final Map<JobPostingStatus, Set<JobPostingStatus>> ALLOWED = Map.of(
            DRAFT, Set.of(PUBLISHED),
            PUBLISHED, Set.of(PAUSED, CLOSED),
            PAUSED, Set.of(PUBLISHED, CLOSED),
            CLOSED, Set.of(ARCHIVED),
            ARCHIVED, Set.of());

    public boolean canTransitionTo(JobPostingStatus target) {
        return target != null && ALLOWED.get(this).contains(target);
    }

    public boolean acceptsApplications() {
        return this == PUBLISHED;
    }
}
