# Rıza Metni Taslakları — Voice-Enrollment (ATS-0014)

> **Taslak/şablon** — tenant (veri sorumlusu) kendi unvan/iletişim/DPO bilgisiyle uyarlar; **hukuki görüş değildir**, owner/DPO onayıyla yayımlanır. KVKK m.10 **aydınlatma metni** ayrı belgedir; buradaki metinler m.6 **açık rıza** beyanlarıdır (rıza = özgür irade + belirli konu + bilgilendirmeye dayalı; hizmet şartına bağlanamaz).
> Kapsam: [[ATS-0014]] internal-only voice-enrollment. **Aday için enrollment rızası YOKTUR ve İSTENMEZ** (aday kategorik-dışlanmış); adaya yalnız B'deki geçici-işleme bilgi/rıza cümlesi uygulanır.

## A. İç-kullanıcı enrollment açık-rıza metni (opt-in)

> **Ses Tanıma Profili (İsteğe Bağlı) — Açık Rıza Beyanı**
>
> [TENANT UNVAN] tarafından işletilen mülakat/toplantı kayıt platformunda, toplantı transkriptlerinde **hangi konuşmayı benim yaptığımın otomatik ÖNERİLMESİ** amacıyla, sesimden bir **ses tanıma profili (ses şablonu)** oluşturulmasına ve saklanmasına **açık rıza veriyorum**. Şunları okudum ve anladım:
>
> 1. **Amaç sınırı:** Ses şablonum YALNIZCA katıldığım oturumlarda konuşmacı-eşleme ÖNERİSİ üretmek için kullanılır; performans değerlendirme, izleme, kimlik doğrulama (authentication) veya başka HİÇBİR amaçla kullanılamaz.
> 2. **Gönüllülük ve eşdeğer alternatif:** Bu özellik tamamen isteğe bağlıdır. Rıza vermezsem konuşmalarım **manuel/insan-onaylı etiketleme** ile aynı işlevsellikte eşlenmeye devam eder; **reddetmem hiçbir performans, değerlendirme veya iş sonucu doğurmaz**.
> 3. **Saklama ve silme:** Şablonum yalnız opt-in süresince saklanır. **İstediğim an** self-service olarak silebilirim (kriptografik silme); rıza geri çekme, geri çekme anına kadarki işlemenin hukukiliğini etkilemez.
> 4. **Aktarım yok:** Ses şablonum tenant sınırı dışına aktarılmaz, üçüncü tarafla paylaşılmaz, model eğitiminde kullanılmaz.
> 5. **Öneri ≠ karar:** Eşleme her zaman ÖNERİ'dir; kesinleşme insan onayıyla olur.
>
> ☐ Açık rıza veriyorum (tarih/kimlik: [SSO-kayıt])

## B. Aday kayıt-rızasına eklenecek geçici-işleme cümlesi

Mevcut kayıt-rızası akışına ([[ATS-0003]]) eklenecek ek paragraf:

> Görüşme kaydında **kim ne zaman konuştuğunun** ayrıştırılması amacıyla ses kaydınız oturum içinde geçici olarak işlenir. Bu kapsamda **geçici oturum ses temsiliniz**, görüşmeyi yapan kurum çalışanlarının (kendi açık rızalarıyla kayıtlı) ses tanıma profilleriyle **yalnızca karşılaştırılabilir**; eşleşmeyen konuşma bölütleri "muhtemel aday/misafir" **önerisi** olarak işaretlenebilir. **Sizin sesinizden kalıcı bir ses profili/şablon OLUŞTURULMAZ, saklanmaz ve herhangi bir veritabanına kaydedilmez**; karşılaştırma sonrası geçici temsil derhal silinir; öneri insan onayına tabidir ve size ait ses-kimlik referansı log'lanmaz.

## İnvariant eşleme (machine-checked kaynaklar)

- Aday enrollment YOK → [[speaker-attribution-standard]] §2 `candidate_exclusion` tokeni (guard).
- Şablon veri-sınıfı/saklama → [[data-lifecycle-register]] `voiceprint_template` (opt-in-süresince, crypto-erase, transfer none, gate-locked).
- Amaç-sınırı + öneri≠karar → [[ATS-0014]] Karar-2 + [[human-oversight-standard]].
- Runtime-enable = imzalı [[dpia-voice-enrollment]] + VERBIS güncellemesi (owner/DPO) + P1 gate.
