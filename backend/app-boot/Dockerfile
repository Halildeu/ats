# ATS app-boot imajı (ATS-0019 39d-1) — digest-authority artifact.
# (Base imaj TAG-pinli; tam reproducibility icin base digest-pin follow-up —
#  guven kaniti her zaman YAYINLANAN imaj digest'idir, tag degil.)
# Build context = repo'nun backend/ dizini:
#   docker build -f backend/app-boot/Dockerfile backend
# Güven kanıtı DIGEST'tir; sha-<short> tag'i insan-okunur alias'tır
# (GitOps tüketimi image@sha256:... ile yapılır).
#
# Güvenlik duruşu (Codex 019f4c6c):
#  - multi-stage: builder katmanları (maven repo, kaynak) final image'a girmez
#  - non-root kullanıcı; minimal JRE taban
#  - read-only rootfs uyumlu: yazma yalnız /tmp (deploy'da emptyDir mount)
#  - context hijyeni backend/.dockerignore ile (target/.git/settings.xml yok)

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY . .
# Reactor'dan yalnız app-boot + bağımlılık modülleri; testler CI'nın ayrı
# kapısında koşar (mvn -B test) — image build'i derleme+paketlemedir.
RUN mvn -B -q -pl app-boot -am package -DskipTests

FROM eclipse-temurin:21-jre-alpine
# UID/GID 10001 NUMERIK: kubelet runAsNonRoot dogrulamasi isimli
# kullaniciyi dogrulayamaz ("non-numeric user" CreateContainerConfigError)
RUN addgroup -g 10001 -S ats && adduser -u 10001 -S -G ats ats
COPY --from=build /src/app-boot/target/app-boot-*.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
# Bellek sınırı container limitinden türesin (cgroup-aware JVM).
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
