# ATS-0009 — CI Runner Architecture (maliyetsiz private-repo CI)

- **Durum:** Accepted (cross-AI — Codex thread `019f116f`, verdict net)
- **Tarih:** 2026-06-29
- **Karar tipi:** CI/infra + güvenlik (gate-safe)
- **Bağlam:** `ats`/`ats-gitops` PRIVATE (IP+KVKK/PII → public YASAK); GitHub-hosted Actions private'da ücretli (owner billing blocker). Maliyetsiz + kalıcı + güvenli CI gerek. [[ATS-0007]] supply-chain.

## Karar (fazlı)

Maliyetsiz private-repo CI = **self-hosted runner**. Uzun-vadeli sektör-standardı = **ephemeral, izole, least-privilege** runner. Fazlı geçiş:

| Faz | Model | Ne zaman |
|---|---|---|
| **Şimdi (bootstrap)** | **A — repo-level persistent runner** (staging-sw'de ats'e ayrı instance) | Hızlı, $0, repo-taşımasız. **"Geçici/dar"** etiketli — production-final DEĞİL. |
| **Kalıcı hedef** | **C — ephemeral runner pool** (ARC / actions-runner-controller k8s; tek job = tek runner = imha) | Asıl güvenlik/kalıcılık verdict'i. |
| **Governance olgunlaşınca** | **B+C — `Serban-a-s` org-level runner group + ephemeral** | ats+ats-gitops+diğer private repolar tek yönetim alanına girince. |

### Dar-A bootstrap kısıtları (ZORUNLU — Codex)
- ats'e **ayrı runner instance + ayrı label** (`self-hosted, ats-ci`); signing/deploy runner ile **trust zone paylaşma**.
- **Container job zorunlu** (host'a Java/Maven KURMA — drift + supply-chain yüzeyi). `node` host'ta var (contracts); Maven `maven:3.9-eclipse-temurin-21` container.
- **Minimum secret**; CI permissions **default minimum** (`permissions: contents: read`).
- **PII/transcript işleyen job YOK** bu runner'da (pre-G0 zaten yok; kalıcı kural).
- Actions **SHA-pin** veya allowlist.

### Neden A kalıcı değil (Codex)
Persistent shared runner regüle ürün için zayıf halka: workspace/docker-cache/tool-cache/credential/artifact residue; bir job kompromize olursa aynı host'taki diğer runner (signing/deploy) + gelecekte PII pipeline etkilenir. Label/scope iyileştirir ama **host-compromise riskini çözmez** → ephemeral (C) gerek.

### ATS-0007 uyumu (kalıcı hedef)
ephemeral runner · ats'e dedicated trust zone · kısa-ömürlü secret (OIDC/Vault/STS) · Actions SHA-pin · egress allowlist · SBOM + vuln-scan artifact · signing ayrı dar-yetkili path · PII job genel CI host'una yazmaz (synthetic/redacted).

## Sonuçlar
**Olumlu:** $0; staging-sw runner pattern kanıtlı (platform-agent/k8s-gitops); container job ile temiz+reproducible+provenance; kalıcı hedef net.
**Olumsuz:** dar-A geçici güvenlik borcu (ephemeral'a göç şart); ARC kurulumu ileride iş.

## Bağlantı
[[ATS-0007]] supply-chain · [[ATS-0008]] (CI satırı: PR #5 + bu ADR) · Codex `019f116f`.
