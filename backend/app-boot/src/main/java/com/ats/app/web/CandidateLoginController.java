package com.ats.app.web;

import com.ats.application.CandidateLoginService;
import com.ats.application.CandidateLoginStore.CandidateApplicationRow;
import com.ats.kernel.Outcome;
import com.ats.kernel.OutcomeCode;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * #235: aday girişi uçları — e-posta + tek kullanımlık kod.
 *
 * <p>Enumeration sözleşmesi: {@code /request} adresin kayıtlı olup olmadığını
 * asla ayırt ettirmez; kayıtlı olmayan adres de, kota dolmuş adres de aynı 202
 * cevabını alır. 503 yalnız gönderim altyapısı çalışmıyorken döner ve
 * adres-bağımsızdır (fail-closed — sessiz sahte "gönderdim" YASAK).
 */
@RestController
class CandidateLoginController {

    private final CandidateLoginService service;

    CandidateLoginController(CandidateLoginService service) {
        this.service = service;
    }

    // Kapalı şema disiplini (mevcut sözleşmenin geri kalanıyla aynı):
    // additionalProperties=false + required. Açık şema, istemcinin fazladan alan
    // göndermesini sessizce kabul eder ve ileride o alan anlam kazandığında
    // sözleşme farkı görünmez olur.
    @Schema(name = "CandidateLoginRequest",
            requiredProperties = {"email"},
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record LoginRequestDto(@NotBlank @Schema(example = "aday@example.test") String email) {}

    @Schema(name = "CandidateLoginVerifyRequest",
            requiredProperties = {"email", "code"},
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record LoginVerifyDto(
            @NotBlank @Schema(example = "aday@example.test") String email,
            @NotBlank @Schema(example = "123456", pattern = "^[0-9]{6}$") String code) {}

    @Schema(name = "CandidateLoginSession",
            requiredProperties = {"sessionToken", "expiresInSeconds"},
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record SessionDto(String sessionToken, String expiresInSeconds) {}

    @Schema(name = "CandidateLoginApplication",
            requiredProperties = {"publicRef", "jobSlug", "jobTitle", "status",
                    "createdAt", "updatedAt"},
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record LoginApplicationDto(
            String publicRef, String jobSlug, String jobTitle, String status,
            String createdAt, String updatedAt) {}

    /** Liste sarmalayıcı: çıplak dizi dönmek ileride alan eklemeyi kırıcı yapar. */
    @Schema(name = "CandidateLoginApplications",
            requiredProperties = {"items"},
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record LoginApplicationsDto(List<LoginApplicationDto> items) {}

    @Schema(name = "CandidateLoginError",
            requiredProperties = {"error", "reason"},
            additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
    record ApiErrorDto(String error, String reason) {}

    @PostMapping("/api/v1/candidate/login/request")
    @ApiResponses({
            @ApiResponse(responseCode = "202",
                    description = "İstek alındı. Kod GÖNDERİLDİĞİNİ KANITLAMAZ — adres "
                            + "kayıtlı değilse veya kota dolduysa da bu cevap döner."),
            @ApiResponse(responseCode = "400", description = "E-posta şekli geçersiz",
                    content = @Content(schema = @Schema(implementation = ApiErrorDto.class))),
            @ApiResponse(responseCode = "429", description = "IP başına istek sınırı"),
            @ApiResponse(responseCode = "503", description = "Kod gönderimi yapılandırılmamış "
                    + "veya çalışmıyor (fail-closed)",
                    content = @Content(schema = @Schema(implementation = ApiErrorDto.class)))
    })
    ResponseEntity<?> request(@RequestBody LoginRequestDto body) {
        Outcome<Void> outcome = service.requestCode(body.email());
        if (outcome instanceof Outcome.Fail<Void> fail) {
            return switch (fail.code()) {
                case INVALID -> ResponseEntity.badRequest()
                        .body(Map.of("error", "INVALID", "reason", fail.reason()));
                // NOT_CONFIGURED + kalan altyapı hataları tek tip 503: adres
                // hakkında hiçbir şey söylemez, arıza da görünmez kalmaz.
                default -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body(Map.of("error", "UNAVAILABLE",
                                "reason", "kod gönderimi şu anda kullanılamıyor"));
            };
        }
        return ResponseEntity.accepted()
                .body(Map.of("status", "ACCEPTED"));
    }

    @PostMapping("/api/v1/candidate/login/verify")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Kısa ömürlü oturum anahtarı",
                    content = @Content(schema = @Schema(implementation = SessionDto.class))),
            @ApiResponse(responseCode = "401", description = "Kod geçersiz veya süresi geçmiş",
                    content = @Content(schema = @Schema(implementation = ApiErrorDto.class))),
            @ApiResponse(responseCode = "429",
                    description = "Deneme bütçesi tükendi — yeni kod istenmeli",
                    content = @Content(schema = @Schema(implementation = ApiErrorDto.class)))
    })
    ResponseEntity<?> verify(@RequestBody LoginVerifyDto body) {
        Outcome<String> outcome = service.verify(body.email(), body.code());
        if (outcome instanceof Outcome.Fail<String> fail) {
            return switch (fail.code()) {
                case DENIED -> ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .body(Map.of("error", "LOCKED", "reason", fail.reason()));
                case INVALID -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "INVALID", "reason", fail.reason()));
                default -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body(Map.of("error", "UNAVAILABLE", "reason", "doğrulama şu anda yapılamıyor"));
            };
        }
        String token = ((Outcome.Ok<String>) outcome).value();
        return ResponseEntity.ok(new SessionDto(
                token, String.valueOf(CandidateLoginService.SESSION_TTL.toSeconds())));
    }

    @GetMapping("/api/v1/candidate/login/applications")
    @ApiResponses({
            @ApiResponse(responseCode = "200",
                    description = "Bu adrese ait TÜM başvurular (aday-güvenli alanlar)",
                    content = @Content(schema = @Schema(implementation = LoginApplicationsDto.class))),
            @ApiResponse(responseCode = "401", description = "Oturum geçersiz veya süresi geçmiş",
                    content = @Content(schema = @Schema(implementation = ApiErrorDto.class)))
    })
    ResponseEntity<?> applications(
            @RequestHeader(value = "X-ATS-Candidate-Session", required = false) String session) {
        Outcome<List<CandidateApplicationRow>> outcome = service.applications(session);
        if (outcome instanceof Outcome.Fail<List<CandidateApplicationRow>> fail) {
            HttpStatus status = fail.code() == OutcomeCode.UNAUTHENTICATED
                    ? HttpStatus.UNAUTHORIZED
                    : HttpStatus.SERVICE_UNAVAILABLE;
            return ResponseEntity.status(status)
                    .body(Map.of("error", fail.code().name(), "reason", fail.reason()));
        }
        List<LoginApplicationDto> items =
                ((Outcome.Ok<List<CandidateApplicationRow>>) outcome).value().stream()
                        .map(row -> new LoginApplicationDto(
                                row.publicRef(), row.jobSlug(), row.jobTitle(),
                                row.status().name(), row.createdAt(), row.updatedAt()))
                        .toList();
        return ResponseEntity.ok(new LoginApplicationsDto(items));
    }
}
