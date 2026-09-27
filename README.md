# AutoRelease Guard & SRE Copilot

**Autonomous Release Readiness, Pre-Flight Verification, and Incident Auto-Remediation**

> An IBM Bob 2.0 multi-agent orchestration pipeline that validates pull requests, lints infrastructure, synthesizes missing tests, and drafts full deployment packages with zero manual toil.

---

## Architecture

```
┌────────────────────────────────────────────┐
│        IBM Bob 2.0 — release-planner       │
│         Release Orchestrator Agent         │
└───────────────────┬────────────────────────┘
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
[sec-auditor]  [infra-validator]  [test-synthesizer]
OWASP/CVE scan  Docker/K8s/Helm   Coverage gaps +
SARIF report    infra-check.json  test synthesis
      │             │             │
      └─────────────┼─────────────┘
                    ▼
         [pr-artifact-gen]
         Release Notes
         Rollback Runbook
         Deploy Checklist
                    ▼
         release-readiness.json
         GO / NO-GO Verdict
```

---

## Quick Start

### 1. Open the workspace in IBM Bob

### 2. Switch to Release Planner mode
In the Bob mode picker, select **Release Planner**.

### 3. Run the pipeline
Say: *"Run AutoRelease Guard on the current branch"*

Bob will activate the `autorelease-guard` skill and launch the full pipeline.

---

## Custom Modes

| Mode Slug | Name | Purpose |
|-----------|------|---------|
| `release-planner` | Release Planner | Orchestrates the full pipeline, produces final GO/NO-GO |
| `sec-auditor` | SecOps Auditor | OWASP ASVS + CVE + secret scan → SARIF output |
| `infra-validator` | Infra Validator | Docker/K8s/Helm/CI lint → infra-check.json |
| `test-synthesizer` | Test Synthesizer | Coverage gap analysis + test file synthesis |

Mode definitions: [`.bob/custom_modes.yaml`](.bob/custom_modes.yaml)

---

## Skills

| Skill | Trigger | What It Does |
|-------|---------|-------------|
| `autorelease-guard` | *"Run AutoRelease Guard"* | Full pipeline orchestration |
| `sec-audit` | *"Run security audit"* | Standalone security scan |
| `infra-validate` | *"Validate infrastructure"* | Standalone infra lint |
| `test-synthesizer` | *"Find coverage gaps"* | Standalone coverage + test gen |
| `pr-artifact-gen` | *"Generate release package"* | Standalone artifact creation |

Skill definitions: [`.bob/skills/`](.bob/skills/)

---

## Project Structure

```
.
├── AGENTS.md                          # Workspace agent context
├── .bobrules                          # Enforced rules for all agents
├── .bob/
│   ├── custom_modes.yaml              # 4 custom Bob modes
│   └── skills/
│       ├── autorelease-guard/         # Orchestrator skill
│       ├── sec-audit/                 # Security skill
│       ├── infra-validate/            # Infra lint skill
│       ├── test-synthesizer/          # Test synthesis skill
│       └── pr-artifact-gen/           # Artifact generation skill
├── services/
│   ├── api-gateway/                   # Node.js 20 + TypeScript (port 3000)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── middleware/auth.ts
│   │   │   └── routes/
│   │   ├── __tests__/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── worker-service/               # Python 3.11 + FastAPI (port 8080)
│       ├── src/main.py
│       ├── tests/
│       ├── Dockerfile
│       └── requirements.txt
├── k8s/                               # Kubernetes manifests
│   ├── api-gateway-deployment.yaml
│   └── worker-service-deployment.yaml
├── charts/autorelease-demo/           # Helm chart
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
├── .github/workflows/ci.yml           # GitHub Actions CI
├── reports/                           # Pipeline outputs (auto-generated)
└── artifacts/                         # Release package (auto-generated)
```

---

## Pipeline Outputs

| File | Author | Contents |
|------|--------|----------|
| `reports/security.sarif.json` | sec-auditor | SARIF 2.1.0 security findings |
| `reports/infra-check.json` | infra-validator | CIS/K8s violations + linter output |
| `reports/coverage-gaps.json` | test-synthesizer | Uncovered symbols + generated test list |
| `reports/release-readiness.json` | release-planner | Final GO/NO-GO with full summary |
| `artifacts/RELEASE_NOTES.md` | pr-artifact-gen | Keep-a-Changelog release notes |
| `artifacts/ROLLBACK_RUNBOOK.md` | pr-artifact-gen | kubectl rollback steps + smoke test |
| `artifacts/DEPLOY_CHECKLIST.md` | pr-artifact-gen | Sign-off checklist for deploy window |

---

## Compliance Baseline

- **Security:** OWASP ASVS Level 2
- **Containers:** CIS Docker Benchmark v1.6
- **Commits:** Conventional Commits enforced
- **Findings Output:** SARIF 2.1.0
- **Secret Scanning:** Gitleaks + regex pattern matching
- **Kubernetes:** `runAsNonRoot`, resource limits, probes required

---

## Branch Policy

| Branch | Gate |
|--------|------|
| `main` | 2 approvals + AutoRelease Guard sign-off |
| `release/*` | 1 approval + AutoRelease Guard sign-off |
| `feat/*` | Pipeline runs on PR open (informational) |

---

## Bob Shell Automation

AutoRelease Guard exposes a **non-interactive Bob Shell entry point** so any CI/CD
system (GitHub Actions, Jenkins, Tekton, ArgoCD pre-sync hooks) can call Bob as a
gating command without a human in the loop.

### Canonical invocation

```bash
# IBM Bob 2.0 non-interactive mode — the pipeline executes headlessly
bob --non-interactive "run release pre-flight for v1.4.2 against main" \
    --mode release-planner \
    --workspace .
```

### Scripts

| Script | Purpose |
|--------|---------|
| [`scripts/bob-preflight.sh`](scripts/bob-preflight.sh) | Thin wrapper: validates prerequisites, calls `bob --non-interactive`, parses verdict from `release-readiness.json`, exits with a machine-readable code |
| [`scripts/run-release-preflight.sh`](scripts/run-release-preflight.sh) | Full mock CI/CD pipeline simulator: 4-stage run with animated Bob simulation, artifact inspection, and gate decision — ideal for demos and judges |

### CI/CD workflow job

The [`bob-shell-preflight`](.github/workflows/ci.yml) job in `ci.yml` runs **after** all other jobs (`needs: [build-and-test, docker-lint, dependency-audit, k8s-validate]`) and:

1. Calls `./scripts/run-release-preflight.sh` — the same script a developer would run locally
2. **Uploads all 7 report + artifact files** as a downloadable GitHub Actions artifact
3. **Posts a verdict comment** on every pull request with a structured findings table
4. **Exits non-zero** on NO-GO, blocking any downstream `docker push` / `helm upgrade` steps

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | GO — release cleared for deployment |
| `1` | NO-GO — blockers found, pipeline gates closed |
| `2` | Prerequisites not met (missing directories, no AGENTS.md) |
| `3` | Pipeline execution error (unexpected Bob failure) |

### Local demo run

```bash
# Full 4-stage CI simulation (simulation mode when Bob CLI not installed)
./scripts/run-release-preflight.sh --version v1.4.2 --base-branch main

# Override verdict to GO for demonstration purposes
SIMULATE_CLEAN=true ./scripts/run-release-preflight.sh

# Thin preflight wrapper only
./scripts/bob-preflight.sh --version v1.4.2
```
# IBM_BOB
