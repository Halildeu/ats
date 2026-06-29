# G0 — Execution Sistemi (M6 kriter 7)

> Junior tek-ekip (Salih) + bus-factor=1 riskine karşı **yazılı operating model**. 3-AI mutabakatı M4. Bu sistem kurulmadan P1 kodu başlamamalı (kriter 7).
>
> Temel ilke: teknik varlık (Faz 24 STT/diar/citation) ≠ ürünleşmiş kalite. Aradaki farkı **disiplin** kapatır, kahramanlık değil.

---

## 1. Roller
| Rol | Kim | Sorumluluk |
|---|---|---|
| Implementer | **Salih** (junior) | Dar acceptance'lı modülleri yazar; tek-hat. |
| Reviewer / mimari | **Halil + Claude** | Her PR review; mimari karar; acceptance gate sahibi. |
| **Senior buddy** | [atanacak — 8-10h/hafta] | Mimari mentorluk + kritik PR review + Salih tıkanınca yol açma. **Günlük implementer DEĞİL.** |
| Cross-AI gate | Codex (OpenAI) / başka sağlayıcı | Kod review = farklı sağlayıcı (HARD RULE). AGREE → merge. |
| Owner QA | **Halil** | "Çalışıyor gibi" demo yetmez; acceptance gate'i owner kapatır. |

> Bus-factor=1 mitigasyonu: senior buddy + Claude/Codex review zinciri + golden fixtures (bilgi tek kişide kilitli kalmaz).

## 2. Acceptance contract (her iş için zorunlu)
Her board issue/PR şu 4'lü olmadan "done" sayılmaz:
1. **Input fixture** — gerçekçi girdi (Türkçe mülakat kaydı/transcript örneği).
2. **Expected output** — beklenen çıktı açıkça tanımlı (örn. "şu segment → şu citation").
3. **Test + demo** — otomatik test geçer + çalışır demo.
4. **Review gate** — Halil/Claude review + cross-AI (Codex) AGREE.

## 3. Tek paralel hat (single track)
- Aynı anda STT + UI + compliance + ATS-entegrasyon + on-prem **yürütülmez**.
- **Haftalık tek deliverable.** Sıralı, dar dilimler. Örnek sıra:
  1. Teams/Graph kaydından transcript ingest
  2. Türkçe STT entegrasyonu (fixture'da WER ölçümü)
  3. Diarization (DER ölçümü)
  4. Transcript segment view (UI)
  5. Rubric/evidence mapping + claim-level citation UI
  6. Human edit/approve + audit log
  7. Consent/retention/access compliance floor
  8. Evidence packet export (PDF/secure-link)
  9. (opsiyonel, 3-koşul varsa) narrow ATS write-back

## 4. Golden fixtures (kalite ölçüm tabanı — kriter 6 girdisi)
- **Gerçek Türkçe panel-mülakat** kayıt/transcript regression set (3+ konuşmacı dahil).
- Ölçülen metrikler (her STT/diar/citation değişikliğinde re-run):
  - **WER** (STT kelime hata oranı)
  - **DER** (diarization hata oranı, konuşmacı overlap dayanımı)
  - **Citation precision/recall**
  - **Hallucination fail-closed oranı** (desteklenmeyen iddia yakalanıyor mu)
- Owner/Zeynep gerçek kayıt sağlar (KVKK-temiz, rıza alınmış sentetik/gönüllü); agent ölçer + raporlar.
- > Kriter 6'nın "ölçülmüş baseline" şartı bu fixture set olmadan kapanmaz.

## 5. Scope kill rule
- LOI / ücretli-pilot'a bağlı OLMAYAN custom entegrasyon/özellik **yazılmaz** → backlog.
- Her talep [P1 scope freeze](./g0-p1-scope-freeze.md) dokümanına karşı test edilir.

## 6. Cross-AI review zinciri (HARD RULE)
- Kodu Claude/Salih yazdıysa → **Codex (OpenAI)** review → AGREE → normal squash merge (admin bypass YASAK, CI yeşil şart).
- PR body: Implementer + Reviewer (farklı sağlayıcı) + Codex thread + Verdict.
- KVKK gate her PR (aday-veri boundary).

## 7. Definition of Done (P1 issue'ları için)
- [ ] Acceptance contract 4'lüsü (fixture/expected/test+demo/review)
- [ ] Cross-AI (Codex) AGREE
- [ ] CI yeşil (kırmızıyla merge YASAK)
- [ ] KVKK/compliance floor ihlali yok
- [ ] Golden fixture metriği regresyon yok (ilgiliyse)
- [ ] Owner QA onayı (demo + gerçek davranış)
- [ ] Board Status → Done (acceptance sonrası)

---

**Durum:** Execution sistemi YAZILDI (M6 kriter 7 ✅ agent-completable). Aktivasyon = senior buddy atanması + golden fixture'ın gerçek Türkçe kayıtla doldurulması (owner/Zeynep) anında tamamlanır.
