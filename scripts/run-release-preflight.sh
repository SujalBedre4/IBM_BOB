#!/usr/bin/env bash
# =============================================================================
# run-release-preflight.sh — Mock CI/CD pipeline simulator for Bob Shell
#
# Simulates what happens when a CI/CD system (GitHub Actions, Jenkins, Tekton,
# ArgoCD pre-sync hook) calls Bob non-interactively to gate a release.
#
# This script is the DEMO / JUDGE artifact that exercises the full pipeline:
#   Stage 1 — Environment setup & validation
#   Stage 2 — Bob non-interactive pre-flight invocation
#   Stage 3 — Verdict evaluation & artifact inspection
#   Stage 4 — Gate decision (would block a real CI push on NO-GO)
#
# Usage:
#   ./scripts/run-release-preflight.sh
#   ./scripts/run-release-preflight.sh --version v1.4.2 --base-branch main
#   SIMULATE_CLEAN=true ./scripts/run-release-preflight.sh   # override to GO
#
# Environment variables:
#   SIMULATE_CLEAN   Set to 'true' to override verdict to GO (demo purposes)
#   BOB_CLI          Path to bob binary (default: bob, falls back to simulation)
#   RELEASE_VERSION  Semver string (default: v1.4.2)
# =============================================================================
set -euo pipefail

# ── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; BOLD='\033[1m'; RESET='\033[0m'

stage()   { echo ""; echo -e "${BOLD}${MAGENTA}══ $* ══${RESET}"; echo ""; }
info()    { echo -e "${CYAN}[CI]${RESET} $*"; }
success() { echo -e "${GREEN}[CI]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[CI]${RESET} $*"; }
error()   { echo -e "${RED}[CI]${RESET} $*" >&2; }
step()    { echo -e "  ${BOLD}→${RESET} $*"; }

# ── Defaults ────────────────────────────────────────────────────────────────
RELEASE_VERSION="${RELEASE_VERSION:-v1.4.2}"
BASE_BRANCH="${BASE_BRANCH:-main}"
SIMULATE_CLEAN="${SIMULATE_CLEAN:-false}"
BOB_CLI="${BOB_CLI:-bob}"
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERDICTS_FILE="${WORKSPACE_ROOT}/reports/release-readiness.json"
PIPELINE_START=$(date +%s)

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)     RELEASE_VERSION="$2"; shift 2 ;;
    --base-branch) BASE_BRANCH="$2";     shift 2 ;;
    -h|--help)     grep '^#' "$0" | cut -c3-; exit 0 ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Pipeline header ──────────────────────────────────────────────────────────
clear 2>/dev/null || true
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║         🚀  AutoRelease Guard  —  Mock CI/CD Pipeline        ║${RESET}"
echo -e "${BOLD}║              IBM Bob 2.0  •  Non-Interactive Mode             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Release:${RESET}   ${RELEASE_VERSION}"
echo -e "  ${BOLD}Base:${RESET}      ${BASE_BRANCH}"
echo -e "  ${BOLD}Workspace:${RESET} ${WORKSPACE_ROOT}"
echo -e "  ${BOLD}Timestamp:${RESET} $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# ╔══════════════════════════════════════════════════════════════════════════╗
# Stage 1 — Environment Setup
# ╚══════════════════════════════════════════════════════════════════════════╝
stage "Stage 1/4 — Environment Setup"

step "Checking workspace structure..."
MISSING=0
for d in reports artifacts services k8s charts .bob; do
  if [[ -d "${WORKSPACE_ROOT}/${d}" ]]; then
    echo -e "       ${GREEN}✓${RESET} ${d}/"
  else
    echo -e "       ${RED}✗${RESET} ${d}/ (MISSING)"
    MISSING=$((MISSING + 1))
  fi
done

if [[ $MISSING -gt 0 ]]; then
  error "Workspace structure incomplete — ${MISSING} directories missing"
  exit 2
fi

step "Checking AGENTS.md and .bobrules..."
for f in AGENTS.md .bobrules; do
  [[ -f "${WORKSPACE_ROOT}/${f}" ]] \
    && echo -e "       ${GREEN}✓${RESET} ${f}" \
    || { error "${f} not found"; exit 2; }
done

step "Detecting Bob CLI..."
if command -v "${BOB_CLI}" &>/dev/null; then
  BOB_VERSION=$("${BOB_CLI}" --version 2>/dev/null || echo "unknown")
  success "Bob CLI detected: ${BOB_VERSION}"
  BOB_MODE="live"
else
  warn "Bob CLI not found — running in SIMULATION mode (reports already on disk)"
  BOB_MODE="simulation"
fi

echo ""
success "Stage 1 complete"

# ╔══════════════════════════════════════════════════════════════════════════╗
# Stage 2 — Bob Non-Interactive Pre-Flight
# ╚══════════════════════════════════════════════════════════════════════════╝
stage "Stage 2/4 — Bob Non-Interactive Pre-Flight"

info "Invoking Bob Shell in non-interactive mode..."
info "Command: bob --non-interactive \"run release pre-flight for ${RELEASE_VERSION} against ${BASE_BRANCH}\""
echo ""

if [[ "${BOB_MODE}" == "live" ]]; then
  # ── Live Bob execution ──────────────────────────────────────────────────
  BOB_EXIT=0
  timeout 600 "${BOB_CLI}" \
    --non-interactive \
    --mode release-planner \
    --workspace "${WORKSPACE_ROOT}" \
    "run release pre-flight for ${RELEASE_VERSION} against ${BASE_BRANCH}" \
    || BOB_EXIT=$?

  if [[ $BOB_EXIT -ne 0 && $BOB_EXIT -ne 1 ]]; then
    error "Bob CLI exited with unexpected code ${BOB_EXIT}"
    exit 3
  fi
else
  # ── Simulation mode: show what Bob would do ─────────────────────────────
  echo -e "${YELLOW}  ┌─ BOB SHELL (non-interactive simulation) ─────────────────────${RESET}"

  STEPS=(
    "Activating skill: autorelease-guard"
    "Reading AGENTS.md and .bobrules..."
    "Collecting git diff: ${BASE_BRANCH}..HEAD"
    "Decomposing changes into 3 parallel tracks..."
    ""
    "Spawning subagent: sec-auditor ──────────────────────────────────┐"
    "Spawning subagent: infra-validator ────────────────────────────  │"
    "Spawning subagent: test-synthesizer ─────────────────────────┐  │"
    "                                                              │  │"
    "  sec-auditor:     OWASP ASVS checks + CVE scan...           │  │"
    "  infra-validator: Docker/K8s/Helm/CI lint...                 │  │"
    "  test-synthesizer: coverage gap analysis...                  │  │"
    "                                                              │  │"
    "  sec-auditor:     writing reports/security.sarif.json ◄──────┘  │"
    "  infra-validator: writing reports/infra-check.json ◄────────────┘"
    "  test-synthesizer: writing reports/coverage-gaps.json ◄──────────"
    ""
    "All 3 subagents complete — spawning pr-artifact-gen..."
    "  pr-artifact-gen: generating artifacts/RELEASE_NOTES.md"
    "  pr-artifact-gen: generating artifacts/ROLLBACK_RUNBOOK.md"
    "  pr-artifact-gen: generating artifacts/DEPLOY_CHECKLIST.md"
    ""
    "Computing final verdict → reports/release-readiness.json"
  )

  for s in "${STEPS[@]}"; do
    if [[ -z "$s" ]]; then
      echo -e "${YELLOW}  │${RESET}"
    else
      echo -e "${YELLOW}  │${RESET}  ${s}"
    fi
    sleep 0.08
  done

  echo -e "${YELLOW}  └───────────────────────────────────────────────────────────────${RESET}"
  echo ""
  success "Simulation complete — pipeline outputs already present on disk"
fi

echo ""
success "Stage 2 complete"

# ╔══════════════════════════════════════════════════════════════════════════╗
# Stage 3 — Artifact Inspection & Verdict
# ╚══════════════════════════════════════════════════════════════════════════╝
stage "Stage 3/4 — Artifact Inspection & Verdict"

step "Verifying all 7 output files exist..."
ALL_OK=true
declare -a OUTPUT_FILES=(
  "reports/security.sarif.json"
  "reports/infra-check.json"
  "reports/coverage-gaps.json"
  "reports/release-readiness.json"
  "artifacts/RELEASE_NOTES.md"
  "artifacts/ROLLBACK_RUNBOOK.md"
  "artifacts/DEPLOY_CHECKLIST.md"
)

for f in "${OUTPUT_FILES[@]}"; do
  if [[ -f "${WORKSPACE_ROOT}/${f}" ]]; then
    SIZE=$(wc -c < "${WORKSPACE_ROOT}/${f}" | tr -d ' ')
    echo -e "       ${GREEN}✓${RESET} ${f}  (${SIZE} bytes)"
  else
    echo -e "       ${RED}✗${RESET} ${f}  (MISSING)"
    ALL_OK=false
  fi
done

if [[ "${ALL_OK}" == "false" ]]; then
  error "One or more output files are missing — pipeline did not complete"
  exit 3
fi

echo ""
step "Parsing verdict from release-readiness.json..."

VERDICT=$(python3 -c "
import json, sys
d = json.load(open('${VERDICTS_FILE}'))
v = d.get('verdict','UNKNOWN')
fs = d.get('findings_summary',{})
pr = d.get('pipeline_run',{})
print(v)
print(fs.get('critical',0), fs.get('high',0), fs.get('medium',0), fs.get('low',0))
print(fs.get('infra_violations',0))
print(fs.get('uncovered_high_risk_symbols',0), fs.get('tests_generated',0))
sec_blocked = str(pr.get('sec_auditor',{}).get('blocked',False))
inf_blocked  = str(pr.get('infra_validator',{}).get('blocked',False))
tst_blocked  = str(pr.get('test_synthesizer',{}).get('blocked',False))
print(sec_blocked, inf_blocked, tst_blocked)
" 2>/dev/null)

VERDICT_LINE=$(echo "${VERDICT}" | sed -n '1p')
COUNTS=$(echo "${VERDICT}"       | sed -n '2p')
INFRA=$(echo "${VERDICT}"        | sed -n '3p')
TESTS=$(echo "${VERDICT}"        | sed -n '4p')
BLOCKED=$(echo "${VERDICT}"      | sed -n '5p')

CRIT=$(echo "$COUNTS" | awk '{print $1}')
HIGH=$(echo "$COUNTS" | awk '{print $2}')
MED=$(echo "$COUNTS"  | awk '{print $3}')
LOW=$(echo "$COUNTS"  | awk '{print $4}')
IVIOL=$(echo "$INFRA" | awk '{print $1}')
UGAPS=$(echo "$TESTS" | awk '{print $1}')
TGEN=$(echo "$TESTS"  | awk '{print $2}')
SEC_B=$(echo "$BLOCKED" | awk '{print $1}')
INF_B=$(echo "$BLOCKED" | awk '{print $2}')
TST_B=$(echo "$BLOCKED" | awk '{print $3}')

# Allow SIMULATE_CLEAN override for demo purposes
if [[ "${SIMULATE_CLEAN}" == "true" ]]; then
  warn "SIMULATE_CLEAN=true — overriding verdict to GO for demonstration"
  VERDICT_LINE="GO"
fi

PIPELINE_END=$(date +%s)
ELAPSED=$((PIPELINE_END - PIPELINE_START))

echo ""
if [[ "${VERDICT_LINE}" == "GO" ]]; then
  echo -e "${GREEN}${BOLD}"
else
  echo -e "${RED}${BOLD}"
fi
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║         AutoRelease Guard — Pipeline Complete                ║"
echo "  ╠══════════════════════════════════════════════════════════════╣"
if [[ "${VERDICT_LINE}" == "GO" ]]; then
printf "  ║  Verdict:    ✅ GO  — cleared for deployment%-17s║\n" ""
else
printf "  ║  Verdict:    ❌ NO-GO  — BLOCKED, see findings below%-9s║\n" ""
fi
echo "  ╠══════════════════════════════════════════════════════════════╣"
printf "  ║  Security:   %d critical, %d high, %d medium, %d low%-22s║\n" \
  "$CRIT" "$HIGH" "$MED" "$LOW" ""
printf "  ║  Infra:      %d violations%-38s║\n" "$IVIOL" ""
printf "  ║  Coverage:   %d gaps, %d tests synthesized%-27s║\n" "$UGAPS" "$TGEN" ""
echo "  ╠══════════════════════════════════════════════════════════════╣"
printf "  ║  Subagents:  sec-auditor=%-5s  infra=%-5s  tests=%-5s%-10s║\n" \
  "${SEC_B}" "${INF_B}" "${TST_B}" ""
printf "  ║  Duration:   %ds%-50s║\n" "$ELAPSED" ""
echo "  ╠══════════════════════════════════════════════════════════════╣"
echo "  ║  Artifacts:                                                  ║"
echo "  ║    reports/security.sarif.json                               ║"
echo "  ║    reports/infra-check.json                                  ║"
echo "  ║    reports/coverage-gaps.json                                ║"
echo "  ║    reports/release-readiness.json                            ║"
echo "  ║    artifacts/RELEASE_NOTES.md                                ║"
echo "  ║    artifacts/ROLLBACK_RUNBOOK.md                             ║"
echo "  ║    artifacts/DEPLOY_CHECKLIST.md                             ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

success "Stage 3 complete"

# ╔══════════════════════════════════════════════════════════════════════════╗
# Stage 4 — Gate Decision
# ╚══════════════════════════════════════════════════════════════════════════╝
stage "Stage 4/4 — Gate Decision"

if [[ "${VERDICT_LINE}" == "GO" ]]; then
  success "✅  GATE: OPEN  — Release ${RELEASE_VERSION} approved for deployment"
  success "    Downstream pipeline stages (docker push, helm upgrade) may proceed."
  echo ""
  exit 0
else
  error "❌  GATE: CLOSED  — Release ${RELEASE_VERSION} is blocked"
  error ""
  error "    Resolve all critical/high blockers listed in:"
  error "      • reports/release-readiness.json   (machine-readable)"
  error "      • artifacts/DEPLOY_CHECKLIST.md    (human checklist)"
  error "      • artifacts/RELEASE_NOTES.md       (security section)"
  error ""
  error "    Then re-run this script to re-evaluate."
  echo ""
  exit 1
fi
