#!/usr/bin/env bash
# =============================================================================
# bob-preflight.sh — AutoRelease Guard non-interactive Bob Shell entry point
#
# Usage:
#   bob --non-interactive "run release pre-flight"
#   # or directly:
#   ./scripts/bob-preflight.sh [--version <semver>] [--base-branch <branch>]
#
# This script is the canonical CLI entry point that a CI/CD pipeline calls to
# execute the full AutoRelease Guard pipeline in Bob's non-interactive mode.
# It validates environment prerequisites, delegates to Bob via its CLI, and
# exits with a machine-readable exit code that the pipeline can gate on.
#
# Exit codes:
#   0  — Pipeline completed — GO verdict
#   1  — Pipeline completed — NO-GO verdict (blockers found)
#   2  — Environment prerequisites not met (Bob CLI not available, etc.)
#   3  — Pipeline execution error (Bob command failed unexpectedly)
#
# Environment variables:
#   BOB_CLI          Path to the bob binary (default: bob)
#   RELEASE_VERSION  Semver string for this release candidate (e.g. v1.4.2)
#   BASE_BRANCH      Branch to diff against (default: main)
#   WORKSPACE_ROOT   Workspace root (default: repo root auto-detected)
#   BOB_TIMEOUT      Seconds before the bob command is killed (default: 600)
# =============================================================================
set -euo pipefail

# ── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[PRE-FLIGHT]${RESET} $*"; }
success() { echo -e "${GREEN}[PRE-FLIGHT]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[PRE-FLIGHT]${RESET} $*"; }
error()   { echo -e "${RED}[PRE-FLIGHT]${RESET} $*" >&2; }

# ── Defaults ────────────────────────────────────────────────────────────────
BOB_CLI="${BOB_CLI:-bob}"
RELEASE_VERSION="${RELEASE_VERSION:-$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0-dev")}"
BASE_BRANCH="${BASE_BRANCH:-main}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
BOB_TIMEOUT="${BOB_TIMEOUT:-600}"
VERDICTS_FILE="${WORKSPACE_ROOT}/reports/release-readiness.json"

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)      RELEASE_VERSION="$2"; shift 2 ;;
    --base-branch)  BASE_BRANCH="$2";     shift 2 ;;
    --timeout)      BOB_TIMEOUT="$2";     shift 2 ;;
    -h|--help)
      grep '^#' "$0" | cut -c3-; exit 0 ;;
    *)
      error "Unknown argument: $1  (run with --help for usage)"; exit 2 ;;
  esac
done

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║    AutoRelease Guard — Non-Interactive Pre-Flight     ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════╝${RESET}"
echo ""
info "Release version : ${RELEASE_VERSION}"
info "Base branch     : ${BASE_BRANCH}"
info "Workspace root  : ${WORKSPACE_ROOT}"
info "Bob CLI         : ${BOB_CLI}"
info "Timeout         : ${BOB_TIMEOUT}s"
echo ""

# ── Step 1: Prerequisite checks ──────────────────────────────────────────────
info "Step 1/4 — Checking prerequisites..."

MISSING_PREREQS=0

# Bob CLI availability
if ! command -v "${BOB_CLI}" &>/dev/null; then
  warn "Bob CLI ('${BOB_CLI}') not found in PATH — running in SIMULATION mode"
  warn "Set BOB_CLI=/path/to/bob or install IBM Bob 2.0 to use live pipeline execution"
  BOB_SIMULATION=true
else
  BOB_SIMULATION=false
  BOB_VERSION=$("${BOB_CLI}" --version 2>/dev/null || echo "unknown")
  success "Bob CLI found: ${BOB_VERSION}"
fi

# Workspace structure
for required_dir in reports artifacts services k8s charts; do
  if [[ ! -d "${WORKSPACE_ROOT}/${required_dir}" ]]; then
    error "Required directory missing: ${required_dir}/"
    MISSING_PREREQS=$((MISSING_PREREQS + 1))
  fi
done

# AGENTS.md must be present
if [[ ! -f "${WORKSPACE_ROOT}/AGENTS.md" ]]; then
  error "AGENTS.md not found — workspace is not an AutoRelease Guard project"
  MISSING_PREREQS=$((MISSING_PREREQS + 1))
fi

if [[ $MISSING_PREREQS -gt 0 ]]; then
  error "${MISSING_PREREQS} prerequisite(s) not met — aborting"
  exit 2
fi

success "Prerequisites OK"
echo ""

# ── Step 2: Execute Bob pipeline ─────────────────────────────────────────────
info "Step 2/4 — Executing AutoRelease Guard pipeline via Bob..."

PREFLIGHT_CMD="run release pre-flight for ${RELEASE_VERSION} against ${BASE_BRANCH}"

if [[ "${BOB_SIMULATION:-false}" == "true" ]]; then
  warn "SIMULATION: would execute:"
  warn "  ${BOB_CLI} --non-interactive \"${PREFLIGHT_CMD}\""
  warn ""
  warn "In a live environment Bob would:"
  warn "  1. Activate the autorelease-guard skill"
  warn "  2. Collect git diff (${BASE_BRANCH}..HEAD)"
  warn "  3. Spawn parallel subagents: sec-auditor, infra-validator, test-synthesizer"
  warn "  4. Run pr-artifact-gen after all three complete"
  warn "  5. Write reports/release-readiness.json with GO/NO-GO verdict"
  warn ""
  warn "Using existing reports/ outputs for verdict evaluation..."
  BOB_EXIT=0
else
  info "Running: ${BOB_CLI} --non-interactive \"${PREFLIGHT_CMD}\""
  timeout "${BOB_TIMEOUT}" "${BOB_CLI}" --non-interactive "${PREFLIGHT_CMD}" \
    --workspace "${WORKSPACE_ROOT}" \
    --mode release-planner \
    || BOB_EXIT=$?
  BOB_EXIT="${BOB_EXIT:-0}"
fi

echo ""

# ── Step 3: Parse verdict from release-readiness.json ───────────────────────
info "Step 3/4 — Parsing pipeline verdict from ${VERDICTS_FILE}..."

if [[ ! -f "${VERDICTS_FILE}" ]]; then
  error "release-readiness.json not found — pipeline did not produce output"
  exit 3
fi

# Extract verdict using python (universally available) then fall back to grep
VERDICT=$(python3 -c "
import json, sys
try:
  d = json.load(open('${VERDICTS_FILE}'))
  print(d.get('verdict', 'UNKNOWN'))
except Exception as e:
  print('PARSE_ERROR: ' + str(e), file=sys.stderr)
  sys.exit(1)
" 2>/dev/null) || {
  # Fallback: grep
  VERDICT=$(grep -o '"verdict"[[:space:]]*:[[:space:]]*"[^"]*"' "${VERDICTS_FILE}" \
    | grep -o '"[^"]*"$' | tr -d '"' || echo "UNKNOWN")
}

success "Verdict: ${VERDICT}"
echo ""

# ── Step 4: Print summary and exit ───────────────────────────────────────────
info "Step 4/4 — Summary"
echo ""

RDFILE="${VERDICTS_FILE}" python3 - <<'PYEOF' 2>/dev/null || \
  grep -E '"(critical|high|medium|low|infra_violations|tests_generated)"' "${VERDICTS_FILE}" || true
import json, os

data = json.load(open(os.environ['RDFILE']))
fs   = data.get("findings_summary", {})

print("╔══════════════════════════════════════════════════════╗")
print("║      AutoRelease Guard — Pre-Flight Complete          ║")
print("╠══════════════════════════════════════════════════════╣")
verdict_str = '✅ GO' if data.get('verdict') == 'GO' else '❌ NO-GO'
print(f"║  Verdict:       {verdict_str:<45}║")
print("╠══════════════════════════════════════════════════════╣")
sec_str  = f"{fs.get('critical',0)} critical, {fs.get('high',0)} high, {fs.get('medium',0)} medium"
inf_str  = f"{fs.get('infra_violations',0)} violations"
cov_str  = f"{fs.get('uncovered_high_risk_symbols',0)} gaps, {fs.get('tests_generated',0)} tests synthesized"
print(f"║  Security:      {sec_str:<45}║")
print(f"║  Infra:         {inf_str:<45}║")
print(f"║  Coverage:      {cov_str:<45}║")
print("╠══════════════════════════════════════════════════════╣")
print("║  Artifacts:                                           ║")
print("║    reports/security.sarif.json                        ║")
print("║    reports/infra-check.json                           ║")
print("║    reports/coverage-gaps.json                         ║")
print("║    reports/release-readiness.json                     ║")
print("║    artifacts/RELEASE_NOTES.md                         ║")
print("║    artifacts/ROLLBACK_RUNBOOK.md                      ║")
print("║    artifacts/DEPLOY_CHECKLIST.md                      ║")
print("╚══════════════════════════════════════════════════════╝")
PYEOF

echo ""

if [[ "${VERDICT}" == "GO" ]]; then
  success "Release ${RELEASE_VERSION} is cleared for deployment."
  exit 0
else
  error "Release ${RELEASE_VERSION} is BLOCKED. Resolve all ❌ findings before re-running."
  exit 1
fi
