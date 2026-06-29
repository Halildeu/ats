# G0 — Pilot-Open Release Checklist (ADR gate'leri tek kapıda)

> Codex residual (thread 019ef3d9): ADR-0001/0003/0004/0005 kapıları **aynı release checklist'inde kırmızı/yeşil** olmalı. Bu doküman pilot-open için TÜM teknik+governance kapısını birleştirir. **Hepsi yeşil olmadan ilk pilot açılmaz** (G0=GO ticari kapısı [g0-design-partner-gate.md] ile birlikte).
>
> İki kapı birlikte = pilot başlar: **(A) ticari** (G0 M6 7-kriter: LOI/DPO/ICP) + **(B) teknik/governance** (bu checklist).

## A. ATS-0001 — Boundary & contract test
- [ ] 4 MVP sözleşmesi (`IdentityTenant`, `EvidenceLedger`, `AIProvider`, `ATSConnector`) tanımlı + **contract test geçiyor**.
- [ ] Platform iç-paketine import YOK (CI guard yeşil).

## B. ATS-0003 — KVKK/consent & erasure
- [ ] consent/recording domain canlı: disclosure + açık rıza + withdrawal + recording-permission-state.
- [ ] retention timer + DSR/erasure workflow çalışıyor.
- [ ] **Erasure test yeşil:** silme sonrası hiçbir WORM/log alanından aday bireye **re-link edilemiyor** (unlinkable tombstone + salt-key destruction).
- [ ] WORM payload minimize + HMAC pseudonymize doğrulandı.

## C. ATS-0004 — Eval-gate (sayısal — golden Türkçe fixture)
> Hedefler ilk fixture'da **kilitlenir** (gerçek sayı; placeholder bırakılmaz — Codex residual). Sonra regresyon-gate.
- [ ] **WER** (STT) ≤ **[kilitli hedef]**
- [ ] **DER** (diarization) ≤ **[kilitli hedef]** · 3+ konuşmacı overlap dayanımı doğrulandı
- [ ] **Citation precision** ≥ **[kilitli hedef]** · **recall** ≥ **[kilitli hedef]**
- [ ] **Unsupported-claim rate** ≤ **[kilitli hedef]**
- [ ] **Hallucination fail-closed = %100** (sert invariant — desteklenmeyen iddia asla onaysız gösterilmez)
- [ ] Seçili provider (self-host VEYA pilot-cloud) bu eşikleri **kanıtladı** (eval-gate-first).

## D. ATS-0005 — Governance gate
- [ ] MVP'de numeric/comparative **scoring YOK** (yalnız evidence checklist + human-authored rationale).
- [ ] affect/emotion analizi YOK · otonom auto-reject YOK (kod-seviye guard).
- [ ] AI-use disclosure + model/version log + human-oversight log aktif.
- [ ] human-in-the-loop zorunlu (insan onayı olmadan kanıt dosyası finalize olmaz).

## E. ATS-0002 — Tenant izolasyon (P0 — en riskli)
- [ ] **Tenant-boundary contract test yeşil** — TÜM seviyelerde: DB/RLS + API + object-store key + background job + log + export + backup. Tek kaçak sorgu/yanlış object-key/job-bug = ürün güveni biter.
- [ ] cross-tenant erişim kod-seviye fail-closed + residency politikası uygulanıyor.

## F. ATS-0007 — Security & key-management
- [ ] per-tenant **KMS/Vault** encryption + secret rotation + **backup şifreli** + erasure salt-key destruction.
- [ ] RBAC least-privilege (audit-reader≠editor≠admin) + admin-impersonation loglu + **break-glass** time-boxed/dual-control/immutable + ATS-connector cred least-privilege/per-tenant.
- [ ] **AI threat controls:** prompt-injection (içerik-veri/talimat ayrımı) + malicious-attachment sandbox + transcript-poisoning kaynak-doğrulama + model-output-leak PII guard + citation-tamper (entailment+fail-closed).
- [ ] **Supply-chain:** signed images/artifacts + SBOM + dependency/container vuln-scan + model provenance/hash + patch SLA + on-prem update **rollback drill**.
- [ ] **egress/network allowlist** (model/provider/ATS-connector veri-sızıntı kanalı kapalı).
- [ ] **incident-response runbook** + audit-evidence export hazır ("olay olursa ne gösteriyoruz").

## Karar kuralı
**Pilot açılır ANCAK:** A+B+C+D+E+F hepsi yeşil **VE** G0 ticari kapısı (≥3 LOI + ≥2 DPO + ATS yolu + ICP kilitli) GO. Herhangi biri kırmızı → pilot açılmaz (CI Kırmızıyken Merge YASAK disipliniyle aynı: kapı dürüst).

> Not: A/B/D yapısal (kod hazır olunca yeşillenir); C **golden Türkçe fixture** gerektirir (owner/Zeynep gerçek kayıt sağlar → agent ölçer/kilitler). C, P1 geliştirme sırasında doldurulur, pilot-open'da yeşil olmalı.
