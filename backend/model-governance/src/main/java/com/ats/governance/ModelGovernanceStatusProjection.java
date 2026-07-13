package com.ats.governance;

import com.ats.contracts.governance.ApprovalStatus;
import com.ats.contracts.governance.Capability;
import com.ats.contracts.governance.ModelApprovalRef;
import com.ats.contracts.governance.ModelGovernanceTransition;
import com.ats.contracts.governance.ModelGovernanceTransitionHashChain;
import com.ats.contracts.governance.ModelGovernanceTransitions;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * gov1-1e GLOBAL model-governance status projeksiyonu (SAF state-machine; framework/persistence YOK —
 * yalnız shared-kernel + contracts-java). WORM transition-listesini baştan sona doğrular ve her
 * {@code (approvalRef, capability)} öznesinin CARİ durumunu MAKİNE-tespit eder (dokümantasyon iddiası
 * değil; {@code project} testiyle kanıtlanır). 1e-c'de WORM tek status-otorite olduğunda tüketici bunu
 * çağırır — fakat {@link ProjectionOutcome#currentStatusOf} ancak {@link ProjectionOutcome#isAuthoritative}
 * DOĞRU iken güvenilir (fail-closed tüketim gate'i).
 *
 * <p><b>Tam doğrulama (silent-skip YOK; 1d projeksiyon deseni):</b> aşağıdakilerin HER biri makine-okur
 * bir {@link IntegrityIssue} üretir — bozuk satır sessizce atlanmaz:
 * <ul>
 *   <li>GLOBAL sequence monoton + boşluksuz ({@code sequence == index}; genesis=0) → {@link IntegrityIssue.Kind#SEQUENCE_BREAK}</li>
 *   <li>genesis {@code previousHash} sentinel + zincir bağı (her satır {@code previousHash == önceki entryHash})
 *       → {@link IntegrityIssue.Kind#GENESIS_PREVIOUS_HASH_INVALID} / {@link IntegrityIssue.Kind#CHAIN_LINK_BROKEN}</li>
 *   <li>{@code entryHash} yeniden-hesap (helper single-source) ≠ saklanan → {@link IntegrityIssue.Kind#ENTRY_HASH_MISMATCH} (tamper)</li>
 *   <li>{@code transitionId} tekilliği → {@link IntegrityIssue.Kind#DUPLICATE_TRANSITION_ID}</li>
 *   <li>{@code approvalRef}↔{@code capability} tutarlılığı (aynı ref tek capability) → {@link IntegrityIssue.Kind#REF_CAPABILITY_INCONSISTENT}</li>
 *   <li>her transition {@code fromStatus == projected-current-status} → {@link IntegrityIssue.Kind#FROM_STATUS_MISMATCH}</li>
 *   <li>izinli-transition matrisi + gerekçe-tutarlılığı → {@link IntegrityIssue.Kind#ILLEGAL_TRANSITION}</li>
 * </ul>
 *
 * <p><b>Fail-closed durum ilerletme:</b> yalnız GEÇERLİ transition öznenin durumunu ilerletir; kusurlu bir
 * transition durumu ilerletMEZ ve özneyi "tainted" işaretler. GLOBAL zincir kusuru (sequence/hash/link)
 * {@code chainIntact=false} yapar → hiçbir özne authoritative sayılmaz (tüm log şüpheli). Böylece kurcalanmış
 * ya da illegal bir WORM asla sessizce APPROVED üretmez.
 */
public final class ModelGovernanceStatusProjection {

    private ModelGovernanceStatusProjection() {}

    /** Projeksiyon öznesi: içerik-adresli onay-ref + yetenek (durum bunun başına izlenir). */
    public record Subject(ModelApprovalRef approvalRef, Capability capability) {
        public Subject {
            if (approvalRef == null) {
                throw new IllegalArgumentException("Subject.approvalRef zorunlu (fail-closed)");
            }
            if (capability == null) {
                throw new IllegalArgumentException("Subject.capability zorunlu (fail-closed)");
            }
        }
    }

    /**
     * Bozuk WORM satırının makine-okur bulgusu: {@code index} (listedeki fiziksel konum — sequence tamper'ından
     * bağımsız sabit konumlandırıcı), kapalı {@code kind}, ilgili {@code transitionId} (her satırda mevcut).
     */
    public record IntegrityIssue(int index, Kind kind, String transitionId) {

        /** Kapalı bulgu türü kümesi (ops monitörünün makine-okur yüzeyi). */
        public enum Kind {
            /** GLOBAL sequence monoton/boşluksuz değil ({@code sequence != index}). */
            SEQUENCE_BREAK,
            /** İlk satır {@code previousHash} genesis sentinel değil. */
            GENESIS_PREVIOUS_HASH_INVALID,
            /** {@code previousHash} önceki satırın {@code entryHash}'ine bağlanmıyor. */
            CHAIN_LINK_BROKEN,
            /** {@code entryHash} yeniden-hesap ile uyuşmuyor (içerik/hash tamper). */
            ENTRY_HASH_MISMATCH,
            /** Aynı {@code transitionId} birden çok satırda. */
            DUPLICATE_TRANSITION_ID,
            /** Aynı {@code approvalRef} farklı {@code capability} ile (içerik-adres ihlali). */
            REF_CAPABILITY_INCONSISTENT,
            /** {@code fromStatus} öznenin projeksiyon-cari durumu değil. */
            FROM_STATUS_MISMATCH,
            /** Geçiş izinli-matris/gerekçe-tutarlılığını ihlal ediyor. */
            ILLEGAL_TRANSITION
        }

        public IntegrityIssue {
            if (kind == null) {
                throw new IllegalArgumentException("IntegrityIssue.kind zorunlu (fail-closed)");
            }
            if (transitionId == null || transitionId.isBlank()) {
                throw new IllegalArgumentException("IntegrityIssue.transitionId zorunlu (fail-closed)");
            }
        }
    }

    /**
     * Projeksiyon çıktısı: {@code (ref,capability) → cari durum} haritası + bütünlük-bulguları + tainted
     * özne kümesi + GLOBAL {@code chainIntact}. Bulgular boşsa temiz WORM. Tüm koleksiyonlar değişmez kopya.
     *
     * <p><b>Tüketim (fail-closed):</b> {@link #currentStatusOf} ham projeksiyon değerini döner; ancak
     * {@link #isAuthoritative} DOĞRU iken güvenilir. Kusurlu bir özne {@code APPROVED} görünse bile
     * authoritative değildir → tüketici (1e-c) onu DENY saymalı.
     */
    public record ProjectionOutcome(
            Map<Subject, ApprovalStatus> currentStatus,
            List<IntegrityIssue> issues,
            Set<Subject> taintedSubjects,
            boolean chainIntact) {

        public ProjectionOutcome {
            currentStatus = Map.copyOf(currentStatus);
            issues = List.copyOf(issues);
            taintedSubjects = Set.copyOf(taintedSubjects);
        }

        /**
         * Öznenin projeksiyon-cari durumu: transition yoksa {@link ApprovalStatus#UNINITIALIZED}; aksi halde
         * son GEÇERLİ transition'ın {@code toStatus}'u. null argüman → UNINITIALIZED (fail-closed).
         */
        public ApprovalStatus currentStatusOf(ModelApprovalRef ref, Capability capability) {
            if (ref == null || capability == null) {
                return ApprovalStatus.UNINITIALIZED;
            }
            return currentStatus.getOrDefault(new Subject(ref, capability), ApprovalStatus.UNINITIALIZED);
        }

        /**
         * Öznenin durumu güvenilir mi: GLOBAL zincir sağlam VE özne tainted değil. null argüman → false
         * (fail-closed). Tüketici {@code isAuthoritative && currentStatusOf==APPROVED} olmadan APPROVED'a
         * güvenmemeli.
         */
        public boolean isAuthoritative(ModelApprovalRef ref, Capability capability) {
            if (ref == null || capability == null) {
                return false;
            }
            return chainIntact && !taintedSubjects.contains(new Subject(ref, capability));
        }

        /**
         * Öznenin durumu OTORİTER-ONAYLI mı: {@link #isAuthoritative} DOĞRU VE {@link #currentStatusOf} ==
         * {@link ApprovalStatus#APPROVED}. 1e-c registry tek-kontrol tüketiminin fail-closed yüzeyi —
         * tainted-ama-APPROVED ya da authoritative-ama-REVOKED asla {@code true} dönmez. null argüman →
         * false (isAuthoritative fail-closed'ından türer).
         */
        public boolean isAuthoritativelyApproved(ModelApprovalRef ref, Capability capability) {
            return isAuthoritative(ref, capability)
                    && currentStatusOf(ref, capability) == ApprovalStatus.APPROVED;
        }
    }

    /**
     * WORM transition-listesini (GLOBAL sequence sırasında) doğrular ve {@link ProjectionOutcome} üretir.
     * Kusurlar {@link IntegrityIssue} olarak yüzeye çıkar (silent-skip YOK); yalnız geçerli geçişler özne
     * durumunu ilerletir; GLOBAL zincir kusuru {@code chainIntact=false} yapar (fail-closed).
     */
    public static ProjectionOutcome project(List<ModelGovernanceTransition> transitions) {
        List<IntegrityIssue> issues = new ArrayList<>();
        Map<Subject, ApprovalStatus> currentStatus = new LinkedHashMap<>();
        Set<Subject> tainted = new LinkedHashSet<>();
        Map<String, Subject> transitionIdOwner = new HashMap<>();
        Map<ModelApprovalRef, Capability> refCapability = new LinkedHashMap<>();
        boolean chainIntact = true;
        String expectedPreviousHash = ModelGovernanceTransitionHashChain.GENESIS_PREVIOUS_HASH;

        for (int i = 0; i < transitions.size(); i++) {
            ModelGovernanceTransition t = transitions.get(i);
            Subject subject = new Subject(t.approvalRef(), t.capability());
            String id = t.transitionId().value();

            // 1. GLOBAL sequence: monoton + boşluksuz (sequence == fiziksel index; genesis=0).
            if (t.sequence() != i) {
                issues.add(new IntegrityIssue(i, IntegrityIssue.Kind.SEQUENCE_BREAK, id));
                chainIntact = false;
            }

            // 2. Zincir bağı: previousHash == beklenen (genesis sentinel @ i==0, aksi halde önceki entryHash).
            if (!t.previousHash().equals(expectedPreviousHash)) {
                IntegrityIssue.Kind kind = (i == 0)
                        ? IntegrityIssue.Kind.GENESIS_PREVIOUS_HASH_INVALID
                        : IntegrityIssue.Kind.CHAIN_LINK_BROKEN;
                issues.add(new IntegrityIssue(i, kind, id));
                chainIntact = false;
            }

            // 3. entryHash yeniden-hesap (helper single-source) == saklanan (tamper tespiti).
            if (!ModelGovernanceTransitionHashChain.recompute(t).equals(t.entryHash())) {
                issues.add(new IntegrityIssue(i, IntegrityIssue.Kind.ENTRY_HASH_MISMATCH, id));
                chainIntact = false;
            }
            // Zincir SAKLANAN entryHash ile devam eder (sonraki CHAIN_LINK gerçek-önceki-hash'e referans versin).
            expectedPreviousHash = t.entryHash();

            // 4. transitionId GLOBAL tekilliği → duplicate HER İKİ özneyi taint eder (Codex 1e-a REVISE):
            // global-tekil id iki özneyi de belirsizleştirir; yalnız MEVCUT satırı taint etmek ilk özneyi
            // YANLIŞLIKLA authoritative APPROVED bırakırdı. chainIntact bozulmaz (özne-seviyesi kusur modeli).
            Subject firstOwner = transitionIdOwner.putIfAbsent(id, subject);
            if (firstOwner != null) {
                issues.add(new IntegrityIssue(i, IntegrityIssue.Kind.DUPLICATE_TRANSITION_ID, id));
                tainted.add(firstOwner);
                tainted.add(subject);
            }

            // 5. approvalRef ↔ capability tutarlılığı (aynı ref tek capability; içerik-adres değişmezi).
            Capability bound = refCapability.putIfAbsent(t.approvalRef(), t.capability());
            if (bound != null && bound != t.capability()) {
                issues.add(new IntegrityIssue(i, IntegrityIssue.Kind.REF_CAPABILITY_INCONSISTENT, id));
                tainted.add(subject);
                tainted.add(new Subject(t.approvalRef(), bound));
            }

            // 6. fromStatus == projeksiyon-cari + izinli-matris/gerekçe. Yalnız geçerliyse ilerlet.
            ApprovalStatus running = currentStatus.getOrDefault(subject, ApprovalStatus.UNINITIALIZED);
            if (t.fromStatus() != running) {
                issues.add(new IntegrityIssue(i, IntegrityIssue.Kind.FROM_STATUS_MISMATCH, id));
                tainted.add(subject);
            } else if (!ModelGovernanceTransitions.isValidTransition(
                    t.fromStatus(), t.toStatus(), t.reasonCode())) {
                issues.add(new IntegrityIssue(i, IntegrityIssue.Kind.ILLEGAL_TRANSITION, id));
                tainted.add(subject);
            } else {
                currentStatus.put(subject, t.toStatus());
            }
        }

        return new ProjectionOutcome(currentStatus, issues, tainted, chainIntact);
    }
}
