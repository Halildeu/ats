# mfe-interview-evidence UI image - digest-authority artifact.
#
# Until this existed the bundle was built by CI on every push and then thrown
# away: nothing published it, so the review workspace (competency criteria on
# the left, citation-backed answer analysis) could not be opened in any
# deployed environment even though its API was live. vite.config.ts already
# said as much - "Prod serving/deploy ayri wiring dilimi" - and this is that
# slice.
#
# Build context = repo root (the app has file: deps on packages/ui and imports
# schemas from contracts/):
#   docker build -f web/mfe-interview-evidence/Dockerfile .
#
# Trust evidence is the DIGEST; sha-<short> is a human-readable alias, and
# GitOps consumes image@sha256:... - same contract as backend/app-boot.

FROM node:20-alpine AS build
WORKDIR /src

# @ats/ui is a file: dependency, so its own install has to happen first or the
# app's npm ci cannot resolve it. Same ordering as the CI build job.
COPY packages/ui/package.json packages/ui/package-lock.json ./packages/ui/
RUN cd packages/ui && npm ci --no-audit --no-fund

COPY web/mfe-interview-evidence/package.json \
     web/mfe-interview-evidence/package-lock.json ./web/mfe-interview-evidence/
COPY packages/ui ./packages/ui
RUN cd web/mfe-interview-evidence && npm ci --no-audit --no-fund

# Sources last: dependency layers stay cached across app-only changes.
# web/i18n carries the tr-TR catalogue that src/i18n.ts imports - hardcoded UI
# text is banned (ATS-0011 I18N-2), so the build fails without it.
COPY contracts ./contracts
COPY web/i18n ./web/i18n
COPY web/mfe-interview-evidence ./web/mfe-interview-evidence
RUN cd web/mfe-interview-evidence && npm run build

# Base tag, not digest - same convention as backend/app-boot, and trust
# evidence is the published digest either way. Consequence to know: a tag
# floats, so a base that scans clean today can go CRITICAL tomorrow and the
# fail-closed Trivy gate will refuse to publish. That is the gate working, not
# a regression; bump the tag to one whose packages carry the fix.
#
# 1.27-alpine was rejected on 2026-07-27: alpine 3.21.3 shipped openssl
# 3.3.3-r0, two CRITICAL findings for CVE-2026-31789 (fixed in 3.3.7-r0).
# 1.29-alpine is alpine 3.23.x with openssl 3.5.6-r0 - measured, not assumed.
FROM nginx:1.29-alpine
# UID/GID 10001 NUMERIC: kubelet's runAsNonRoot check cannot resolve a named
# user ("non-numeric user" CreateContainerConfigError).
RUN addgroup -g 10001 -S ats && adduser -u 10001 -S -G ats ats

# Served under a base path so the shared ingress can route one prefix here
# without owning the whole origin. vite builds with the same base, so asset
# URLs already carry it.
COPY --from=build /src/web/mfe-interview-evidence/dist/ \
     /usr/share/nginx/html/ats/interview-evidence/
COPY web/mfe-interview-evidence/nginx.conf.template /etc/nginx/nginx.conf.template
COPY web/mfe-interview-evidence/docker-entrypoint.sh /docker-entrypoint-ats.sh
RUN chmod 0555 /docker-entrypoint-ats.sh

USER 10001:10001
EXPOSE 8080
# Writable paths are emptyDir mounts in the deployment (/tmp, /var/cache/nginx,
# /var/run), so the root filesystem can stay read-only.
ENTRYPOINT ["/docker-entrypoint-ats.sh"]
