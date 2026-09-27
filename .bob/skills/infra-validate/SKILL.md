---
name: infra-validate
description: >-
  Use when validating Dockerfiles, Kubernetes manifests, Helm charts, or CI/CD pipeline
  configs for CIS benchmark compliance, security misconfigurations, and deployability issues.
  Writes an infra-check.json report.
---

# Infra Validator Skill

Systematically lint and validate all infrastructure-as-code files changed in the PR.
Write all findings to `reports/infra-check.json`.

---

## Step 1 — Load Context

1. Read `.bobrules` for infrastructure rules.
2. Read `AGENTS.md` for port mappings, allowed base images, and compliance baseline.
3. Identify all changed infrastructure files (received from orchestrator or via git diff).

Categorize files by type:
- **Dockerfiles**: `Dockerfile`, `Dockerfile.*`, `*.dockerfile`
- **Kubernetes manifests**: `*.yaml`, `*.yml` in `k8s/`, `deploy/`, `manifests/`, `charts/`
- **Helm charts**: `Chart.yaml`, `values.yaml`, `templates/*.yaml`
- **CI/CD**: `.github/workflows/*.yml`, `Jenkinsfile`, `.tekton/*.yaml`, `.gitlab-ci.yml`
- **Terraform/IaC**: `*.tf`, `*.hcl`

---

## Step 2 — Dockerfile Analysis

For each Dockerfile, run `hadolint` if available:
```bash
hadolint --format json Dockerfile 2>/dev/null || echo '{"error":"hadolint not available"}'
```

If unavailable, perform a manual check against these **CIS Docker Benchmark v1.6** rules:

| Rule ID | Check | Severity |
|---------|-------|----------|
| CIS-4.1 | Non-root USER instruction present | Critical |
| CIS-4.2 | No `--no-cache` missing in `apt-get install` (creates large layers) | Medium |
| CIS-4.3 | No `ADD` with remote URLs (use `RUN curl` instead) | High |
| CIS-4.4 | No secrets (`ENV PASSWORD=`, `ARG TOKEN=`) in image layers | Critical |
| CIS-4.6 | `HEALTHCHECK` instruction present | Medium |
| CIS-4.7 | No `update` without `install` in same layer | Low |
| CIS-4.9 | Image pinned to specific digest or version (no `:latest`) | High |
| CIS-5.4 | No `--privileged` flag in docker run instructions or compose | Critical |
| CIS-5.7 | CPU and memory limits configured | High |

Also verify port mappings match AGENTS.md specifications.

---

## Step 3 — Kubernetes Manifest Analysis

For each K8s YAML file, run validators if available:
```bash
kubeval --strict <file>.yaml 2>/dev/null || echo '{"error":"kubeval not available"}'
```

Perform a manual check for these rules regardless:

| Rule ID | Check | Severity |
|---------|-------|----------|
| K8S-SEC-001 | `securityContext.runAsNonRoot: true` on all containers | Critical |
| K8S-SEC-002 | No `securityContext.privileged: true` | Critical |
| K8S-SEC-003 | `securityContext.allowPrivilegeEscalation: false` | High |
| K8S-SEC-004 | `securityContext.readOnlyRootFilesystem: true` where applicable | Medium |
| K8S-SEC-005 | `securityContext.capabilities.drop: [ALL]` | High |
| K8S-RES-001 | `resources.limits.cpu` defined on all containers | High |
| K8S-RES-002 | `resources.limits.memory` defined on all containers | High |
| K8S-RES-003 | `resources.requests.cpu` defined | Medium |
| K8S-RES-004 | `resources.requests.memory` defined | Medium |
| K8S-PROBE-001 | `readinessProbe` defined | High |
| K8S-PROBE-002 | `livenessProbe` defined | High |
| K8S-IMG-001 | Image tag is not `:latest` | High |
| K8S-IMG-002 | Image pull policy is not `Always` without digest pinning | Medium |
| K8S-NET-001 | NetworkPolicy exists for the namespace | Medium |

---

## Step 4 — Helm Chart Analysis

For Helm charts, run `helm lint` if available:
```bash
helm lint ./charts/<chart-name> 2>/dev/null || echo '{"error":"helm not available"}'
```

Manual checks:

| Rule ID | Check | Severity |
|---------|-------|----------|
| HELM-001 | `image.tag` uses `{{ .Values.image.tag }}` not hardcoded | High |
| HELM-002 | No hardcoded secrets in `values.yaml` | Critical |
| HELM-003 | `values.yaml` has sensible defaults for resource limits | High |
| HELM-004 | All required values have documentation in `values.yaml` comments | Low |
| HELM-005 | `Chart.yaml` has `appVersion` and `version` set correctly | Medium |

---

## Step 5 — CI/CD Pipeline Analysis

For GitHub Actions / Tekton / GitLab CI files:

| Rule ID | Check | Severity |
|---------|-------|----------|
| CICD-001 | No hardcoded secrets in `env:` blocks | Critical |
| CICD-002 | All secrets use `${{ secrets.NAME }}` or environment variable references | Critical |
| CICD-003 | No `curl | bash` or `wget | sh` patterns | High |
| CICD-004 | Actions pinned to commit SHA, not tag (e.g. `actions/checkout@v4` is acceptable) | Medium |
| CICD-005 | `permissions:` block scoped to minimum required | Medium |
| CICD-006 | No `continue-on-error: true` on security-critical steps | High |

---

## Step 6 — Write infra-check.json

Write `reports/infra-check.json` using `write_file`:

```json
{
  "timestamp": "",
  "files_checked": [],
  "violations": [
    {
      "rule_id": "CIS-4.1",
      "severity": "critical|high|medium|low",
      "file": "Dockerfile",
      "line": 0,
      "message": "No USER instruction found — container runs as root",
      "remediation": "Add 'USER nonroot' or 'USER 1001' before the ENTRYPOINT/CMD instruction"
    }
  ],
  "warnings": [],
  "blocked": false,
  "blocking_reason": "",
  "linter_output": {
    "hadolint": {},
    "kubeval": {},
    "helm_lint": {}
  }
}
```

Set `blocked: true` if any `critical` or `high` violations exist.

---

## Step 7 — Output Summary

Report:
- Files checked and tools used
- Critical/High violations (blockers) with file and line
- Whether the release is blocked
- Top remediation priorities
