package com.ats.review;

/**
 * docs/governance/human-oversight-standard.md §1 state'lerinin birebir mirror'ı.
 * Tür: ai (insan-kararı değil) · human (insan aksiyonu) · locked (iş-kararı kilitli;
 * yalnız idari geçiş) · terminal (çıkışsız). YASAK token'lar (AUTO_FINALIZED vb.)
 * burada TANIMSIZDIR — enum kapalı küme olduğu için gizli state yapısal olarak imkânsız.
 */
public enum ReviewState {
    AI_SUGGESTED(Kind.AI),
    HUMAN_REVIEWING(Kind.HUMAN),
    HUMAN_EDITED(Kind.HUMAN),
    HUMAN_REVIEWED_NO_CHANGE(Kind.HUMAN),
    AI_SUGGESTION_REJECTED(Kind.HUMAN),
    HUMAN_RATIONALE_RECORDED(Kind.HUMAN),
    FINALIZED(Kind.LOCKED),
    EXPORTED(Kind.TERMINAL),
    WITHDRAWN(Kind.TERMINAL);

    public enum Kind { AI, HUMAN, LOCKED, TERMINAL }

    private final Kind kind;

    ReviewState(Kind kind) {
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    public boolean terminal() {
        return kind == Kind.TERMINAL;
    }
}
