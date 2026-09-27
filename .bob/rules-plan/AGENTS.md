# AGENTS.md — Plan Mode

This file provides guidance to agents when working with code in this repository.

## Non-Obvious Architectural Constraints

### Pipeline Ordering (Hard Constraint)
`pr-artifact-gen` **must not run** until all three of `sec-auditor`, `infra-validator`, and `test-synthesizer` have written their reports. The orchestrator (`release-planner`) gates on file existence and non-empty content of all three report files before spawning `pr-artifact-gen`. This is not a soft guideline — the artifact generator reads all three reports to produce consistent release notes.

### `test-synthesizer` is the Only Write-Capable Source Agent
All other agents (`sec-auditor`, `infra-validator`, `release-planner`) are **read-only on source files**. Only `test-synthesizer` may create new files, and only inside `services/*/tests/` or `services/*/__tests__/`. Plans that involve patching source vulnerabilities (e.g. fixing the hardcoded credential) must note this is out-of-scope for pipeline agents — those are developer tasks.

### `sub` Claim Type Mismatch Is a Load-Bearing Bug
The `users.ts` IDOR (`sub` = email string vs `:id` = opaque identifier) is the most architecturally impactful open finding. Any plan to fix it must account for the fact that changing `sub` from email to a UUID requires simultaneously updating `auth.ts:43` (JWT signing), `middleware/auth.ts:33` (payload type), and all existing tests that construct tokens with `{ sub: 'user@example.com' }`. There is no migration path — this is a breaking change to the JWT contract.

### Python Worker Has No Async Test Infrastructure
`test_enqueue_job.py` uses synchronous `TestClient` despite FastAPI supporting async. `pytest-asyncio==0.23.3` is installed but no existing tests use `@pytest.mark.asyncio`. Plans adding async tests must configure `asyncio_mode = "auto"` in `pytest.ini` or `pyproject.toml` (neither currently exists) before using `async def test_*`.

### Duplicate `httpx` in `requirements.txt` Is Intentional Demo Content
`requirements.txt` line 4 and line 9 both list `httpx==0.26.0`. This is a known-bad fixture for the security audit demo (finding `DEP-ADVISORY-004`). Do not "fix" it without understanding it is intentional test data for the scanner.

### CI Pipeline Has Intentional Weaknesses
`.github/workflows/ci.yml` has three intentional weaknesses used as infra-validator findings:
1. `pip-audit … || true` (line 96) — audit never blocks
2. `hadolint no-fail: true` (lines 64, 71) — lint never blocks
3. `kubeval` downloaded at `latest` with no checksum (line 106)

Plans to "fix CI" must coordinate with the demo narrative — these are meant to be caught by the pipeline, not pre-fixed.

### Bob Shell Scripts Depend on Python 3 for Verdict Parsing
`scripts/bob-preflight.sh` and `scripts/run-release-preflight.sh` both use `python3` to parse `reports/release-readiness.json`. They fall back to `grep` if Python fails, but the formatted summary box requires Python. Plans deploying these scripts to minimal containers (e.g., Alpine without Python) must account for this dependency.

### No Database, No Migration Risk
Neither service has database connectivity in this codebase — the `MOCK_USERS` dict and in-memory job IDs are the only state. Rollback complexity is explicitly `LOW` in `release-readiness.json`. Plans must not introduce DB migrations without updating the rollback runbook template.
