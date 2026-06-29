#!/usr/bin/env bash
# ATS-0001 boundary guard (gate-safe).
#
# Faz 25 ATS bağımsız bir üründür: platform (autonomous-orchestrator /
# platform-backend / platform-web) İÇ paketlerine kod bağımlılığı YASAKTIR
# (ADR-0001). Reuse yalnız yayınlanmış interface/imaj üzerinden.
#
# Bu guard sadece import satırlarını değil, package dependency string'lerini de
# tarar (Codex cross-AI guardrail #4). rg yoksa grep -rE fallback.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Yasak iç-paket / repo pattern'leri (boundary ihlali sinyali).
FORBIDDEN='(@platform/|platform-backend|platform-web|platform-k8s-gitops|autonomous-orchestrator)'

# Taranan uzantılar + dosyalar.
INCLUDE_GLOBS=(
  '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
  '*.json' '*.java' '*.py' '*.go'
)
EXCLUDE_DIRS='.git|node_modules|dist|build|coverage|.venv|__pycache__|target'

hits=""
if command -v rg >/dev/null 2>&1; then
  globs=()
  for g in "${INCLUDE_GLOBS[@]}"; do globs+=(--glob "$g"); done
  hits="$(rg -n --no-heading \
    --glob '!**/{.git,node_modules,dist,build,coverage,.venv,__pycache__,target}/**' \
    "${globs[@]}" \
    "$FORBIDDEN" . || true)"
else
  # grep fallback
  ext_pattern='\.(ts|tsx|js|jsx|mjs|cjs|json|java|py|go)$'
  files="$(find . -type f | grep -vE "/($EXCLUDE_DIRS)/" | grep -E "$ext_pattern" || true)"
  if [ -n "$files" ]; then
    hits="$(printf '%s\n' "$files" | xargs grep -nE "$FORBIDDEN" 2>/dev/null || true)"
  fi
fi

if [ -n "$hits" ]; then
  echo "BOUNDARY İHLALİ (ATS-0001): platform iç-paket/repo referansı bulundu:" >&2
  echo "$hits" >&2
  echo "" >&2
  echo "Reuse yalnız yayınlanmış interface/imaj üzerinden olmalı (ADR-0001)." >&2
  exit 1
fi

echo "boundary guard OK — platform iç-paket referansı yok."
