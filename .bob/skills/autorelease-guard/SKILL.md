---
name: autorelease-guard
description: >-
  Use when the user wants to run a full AutoRelease Guard pipeline — orchestrating
  parallel security, infrastructure, and test-coverage validation on a pull request
  or branch diff, then generating a release package with notes, rollback plan, and
  deployment checklist.
---

# AutoRelease Guard — Orchestrator Skill

This skill drives the full multi-agent release readiness pipeline. Follow every step in order.
Do not proceed to a later step until the previous one is verified complete.

---

## Step 1 — Load Workspace Context

1. Read `AGENTS.md` to load microservice constraints, branch policies, port mappings, and
   output directory structure.
2. Read `.bobrules` to confirm output format requirements and compliance rules.
3. Confirm the target branch or PR. If not specified, ask the user:
   - What branch or PR number is being validated?
   - What is the target base branch (default: `main`)?

---

## Step 2 — Collect the Diff

Run the following to obtain changed files and their diffs:

```bash
git diff origin/main...HEAD --name-only
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

Use `execute_command` for all three. Store the file list mentally for the next step.

---

## Step 3 — Decompose Into Parallel Tracks

Analyze the diff and categorize each changed file into one or more tracks:

| Track | File Patterns |
|-------|--------------|
| **Security** | All source files (`*.ts`, `*.js`, `*.py`, `*.go`), `package.json`, `requirements.txt`, `go.mod` |
| **Infrastructure** | `Dockerfile*`, `*.yaml`, `*.yml`, `*.tf`, `*.hcl`, `helmfile*`, `charts/` |
| **Test Coverage** | All source files with logic changes (exclude pure config/docs) |

Produce a mental manifest of which files each subagent should focus on.

---

## Step 4 — Launch Three Parallel Subagents

Use `spawn_subagent` to launch all three simultaneously (they are independent — no dependencies
between them at this stage):

### Subagent A — SecOps Auditor
```
description: "Run the sec-audit skill on the following changed files: [LIST]. 
Produce reports/security.sarif.json with SARIF 2.1.0 findings and an 
x-autorelease-summary block. Read AGENTS.md and .bobrules first."
fork_context: true
```

### Subagent B — InfraLint Validator
```
description: "Run the infra-validate skill on the following changed infrastructure 
files: [LIST]. Produce reports/infra-check.json. Read AGENTS.md and .bobrules first."
fork_context: true
```

### Subagent C — Test Synthesizer
```
description: "Run the test-synthesizer skill on the following changed source files: 
[LIST]. Produce reports/coverage-gaps.json and synthesize any missing tests. 
Read AGENTS.md and .bobrules first."
fork_context: true
```

Wait for all three subagents to complete before proceeding.

---

## Step 5 — Verify Subagent Outputs

After all three subagents return, verify that the following files exist and are non-empty:
- `reports/security.sarif.json`
- `reports/infra-check.json`
- `reports/coverage-gaps.json`

Use `read_file` on each to confirm they are valid JSON. If any is missing or malformed,
re-run that subagent alone before continuing.

---

## Step 6 — Run PR Artifact Generator

Activate the `pr-artifact-gen` skill (or spawn a subagent with that skill activated) to:
1. Parse all three reports
2. Generate `artifacts/RELEASE_NOTES.md`
3. Generate `artifacts/ROLLBACK_RUNBOOK.md`
4. Generate `artifacts/DEPLOY_CHECKLIST.md`

---

## Step 7 — Produce Final Release-Readiness Roll-Up

Read all five report/artifact files and compute the final verdict:

**NO-GO conditions (any one is sufficient):**
- `security.sarif.json` has `x-autorelease-summary.blocked: true` (critical or high findings)
- `infra-check.json` has `blocked: true`
- `coverage-gaps.json` has uncovered high-risk symbols with no `test_file_generated`

**GO conditions:** All three subagents completed with no blockers.

Write `reports/release-readiness.json` using `write_file`:

```json
{
  "verdict": "GO | NO-GO",
  "timestamp": "<ISO 8601>",
  "commit_sha": "<git rev-parse HEAD>",
  "pipeline_run": {
    "sec_auditor": { "report": "reports/security.sarif.json", "blocked": false },
    "infra_validator": { "report": "reports/infra-check.json", "blocked": false },
    "test_synthesizer": { "report": "reports/coverage-gaps.json", "blocked": false }
  },
  "findings_summary": {
    "critical": 0, "high": 0, "medium": 0, "low": 0,
    "infra_violations": 0,
    "uncovered_high_risk_symbols": 0,
    "tests_generated": 0
  },
  "artifacts": [
    "artifacts/RELEASE_NOTES.md",
    "artifacts/ROLLBACK_RUNBOOK.md",
    "artifacts/DEPLOY_CHECKLIST.md"
  ],
  "release_engineer_notes": ""
}
```

---

## Step 8 — Report to User

Present a concise summary in this format:

```
╔══════════════════════════════════════════════════╗
║         AutoRelease Guard — Pipeline Complete     ║
╠══════════════════════════════════════════════════╣
║  Verdict:      ✅ GO  /  ❌ NO-GO                 ║
║  Security:     X critical, X high, X medium       ║
║  Infra:        X violations, X warnings           ║
║  Coverage:     X gaps found, X tests synthesized  ║
╠══════════════════════════════════════════════════╣
║  Artifacts generated:                             ║
║    • artifacts/RELEASE_NOTES.md                  ║
║    • artifacts/ROLLBACK_RUNBOOK.md               ║
║    • artifacts/DEPLOY_CHECKLIST.md               ║
║    • reports/release-readiness.json              ║
╚══════════════════════════════════════════════════╝
```

If verdict is NO-GO, list each blocking finding with its file location and remediation step.
