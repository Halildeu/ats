# G0 — P1 Scope Freeze (M6 kriter 5)

> P1 = **"Audit-ready Interview Evidence Packet MVP"**. Bu doküman P1 kapsamını **dondurur** + açık **yasak liste** verir. 3-AI mutabakatı (M3) canonical. Scope kill rule: bu listede olmayan hiçbir custom iş, LOI/ücretli-pilot'a bağlı olmadan yazılmaz.
>
> Amaç: junior tek-ekiple "scope creep" = execution failure'ı engellemek. Her yeni özellik talebi bu dokümana karşı test edilir: "P1-içi mi, yasak mı, gated-sonra mı?"

---

## P1 — DAHİL (yapılacak)

### Çekirdek akış
1. **Ingest:** MS Teams/Graph kaydı **veya** dosya upload (audio/video/transcript). Tek kanal: Microsoft ekosistemi.
2. **Türkçe STT + diarization:** faster-whisper (STT) + pyannote (konuşmacı ayrımı). Faz 24 motoru.
3. **Transcript segment view:** zaman-damgalı, konuşmacı-etiketli görünüm.
4. **Rubric / evidence mapping:** yapılandırılmış mülakat rubric alanları + her alana **claim-level citation** (kaynak transkript alıntısına tıkla-git). **MVP evidence-ONLY** (ATS-0004/0005): AI sayısal/karşılaştırmalı puan ÜRETMEZ → evidence checklist + **human-authored decision rationale**. Numeric scoring/ranking = sonraki gated regüle alt-sistem. İlk satış cümlesi "AI puan veriyor" değil → "AI kanıt çıkarır, insan değerlendirir".
5. **Human edit / approve:** insan düzenler, onaylar; AI yalnız kanıt önerir.
6. **Audit log:** değiştirilemez (immutable) event trail.
7. **Çıktı:** evidence packet **export tabanı** (PDF + secure link + e-posta/webhook + kimlik eşleşmesi) + **opsiyonel narrow write-back** (yalnız 3-koşul: ATS adı belli + API doğrulanmış + LOI'de ücretli pilot).

### Compliance floor (P1-içi, MVP-zorunlu — pilot kabul altyapısı)
- consent / disclosure template + recording permission state
- retention (saklama) süresi ayarı
- delete / export request workflow
- access log + human approval log + model/version log
- no-emotion / no-auto-reject policy flag
- immutable audit event trail

### Mimari kısıt
- Multi-tenant izolasyon (Keycloak identity reuse, stable interface).
- AI provider abstraction (cloud-pilot → self-host; Faz 24 ADR-0043 deseni).
- Ürün boundary AYRI (platform primitives stable-interface reuse, coupling YOK).

---

## P1 — YASAK (bu fazda KESİNLİKLE yapılmayacak)

| Yasak | Nereye |
|---|---|
| Full ATS (job board / career-site / pipeline / offer / onboarding) | P6 gated |
| Çoklu ATS entegrasyonu / marketplace | P4 |
| HRIS sync | P4 |
| SSO/SCIM | P4 |
| On-prem production SKU (teslimat) | P5 (mimari hazır, teslim sonra) |
| SOC2 / ISO sertifikasyon | P5 |
| Tam EU AI Act technical file | P3 |
| Full DSR automation | P3 |
| Bias-audit dashboard | P6 |
| Quality-of-hire analytics | P6 |
| Agentic / otomatik aday eleme / ranking | P6 (gated) |
| Duygu/affect analizi | **HİÇBİR ZAMAN** (EU yasak) |
| Otomatik (insansız) auto-reject | **HİÇBİR ZAMAN** |
| Çoklu video platformu (Zoom/Meet) | sonra (tek kanal MS önce) |
| Kariyer.net / job-board entegrasyonu | P4 opsiyonel |

---

## Scope kill rule (operasyonel)
Yeni bir özellik/talep geldiğinde sıra:
1. **P1-DAHİL listesinde mi?** → evet ise yap.
2. **YASAK listesinde mi?** → reddet, ilgili faza yaz (backlog).
3. **Hiçbirinde yok + bir LOI/ücretli-pilot bunu şart koşuyor mu?** → evet ise mini-ADR + scope'a ekle; hayır ise **yazma** (backlog'a).

> Doğrulama: P1 "AI hiring intelligence platform" diye büyümemeli. İlk satılabilir = **regüle kurumlar için Türkçe, insan-onaylı, kaynak-alıntılı, denetlenebilir mülakat kanıt dosyası.** Nokta.

---

**Durum:** P1 scope DONDURULDU (M6 kriter 5 ✅ agent-completable kısmı). Gerçek "freeze commit" = G0 GO anında bu doküman + ilk LOI kapsamıyla teyit edilip değiştirilemez işaretlenir.
