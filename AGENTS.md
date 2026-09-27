# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## What This Workspace Is

AutoRelease Guard & SRE Copilot — a multi-agent IBM Bob 2.0 pipeline validating releases of a polyglot microservice backend (Node.js api-gateway + Python worker-service + Docker/K8s/Helm). Agents **read and analyse** source files; they do **not** modify them unless acting as `test-synthesizer`.

---

## Build / Test Commands

All commands must be run from the **service subdirectory**, not the workspace root — Jest and pytest configs are not at root level.

### api-gateway (Node.js 20 + TypeScript)
```bash
cd services/api-gateway
npm ci                            # install (uses package-lock.json)
npm test                          # jest --coverage (all tests)
npm test -- --testPathPattern auth.middleware  # single test file
npm test -- --testNamePattern "returns 401"    # single test by name (regex)
npm run build                     # tsc → dist/
```

### worker-service (Python 3.11 + FastAPI)
```bash
cd services/worker-service
pip install -r requirements.txt
pytest tests/ -v                            # all tests
pytest tests/test_sanitize.py -v            # single test file
pytest tests/test_main.py::TestEnqueueJob::test_valid_request_returns_200  # single test
```

### CI pre-flight (Bob Shell Automation)
```bash
./scripts/run-release-preflight.sh --version v1.4.2 --base-branch main
# Requires Python 3 for verdict parsing; falls back to simulation if Bob CLI absent
# SIMULATE_CLEAN=true  forces GO verdict (demo use only)
```

---

## Critical Non-Obvious Patterns

### api-gateway

- **`JWT_SECRET` throws at module load**, not at request time (`middleware/auth.ts:4-8`). Tests **must** set `process.env.JWT_SECRET` in `beforeAll` **before** any `import { app }` call resolves. Placing the env assignment after the import silently uses `undefined` and crashes.
- **`sub` claim is the user's email string**, not a UUID or numeric ID (`auth.ts:43`: `{ sub: email, … }`). The IDOR check in `users.ts:14` (`requestingUser.sub !== targetId`) only passes self-access when the route `:id` param is also the email. This is a known open finding (ASVS-4.2.1 in `reports/security.sarif.json`).
- **`requireRole` always passes for `admin`** — the guard is `role !== target && role !== 'admin'` (`middleware/auth.ts:59`). Admins bypass every `requireRole`-protected route regardless of the required role.
- **Jest config is inline in `package.json`** (`jest` key). There is no `jest.config.js`. The ts-jest tsconfig override is also inline — it diverges from `tsconfig.json` (adds `module: commonjs`).
- Express body limit is `10kb` (`index.ts:12`) — tests sending large payloads will get 413.

### worker-service

- **`INTERNAL_API_KEY` must be set before `from src.main import app`** — the env var is read at the module level inside `enqueue_job`. The late-import pattern (`os.environ["INTERNAL_API_KEY"] = "…"` then `from src.main import app`) in `test_main.py:10-12` is intentional; changing import order breaks auth in tests.
- **pytest must run from `services/worker-service/`** — imports use `from src.main import …` where `src/` is a plain directory (no `__init__.py`). Running from workspace root will produce `ModuleNotFoundError`.
- `test_enqueue_job.py` uses `starlette.testclient.TestClient(app, raise_server_exceptions=False)` — server-side exceptions are swallowed, returned as 500. `test_main.py` uses `fastapi.testclient.TestClient` (default: raises). Use the appropriate client depending on whether you want exceptions to propagate.
- `JobRequest` validators use the deprecated Pydantic v1 `@validator` decorator (not `@field_validator`) — the codebase is on `pydantic==2.5.3` in v1-compat mode. Do not add Pydantic v2-style validators.
- `job_id` is deterministic: `f"job_{job_type}_{hash(str(payload)) & 0xFFFF:04x}"` — collisions are expected for identical payloads.
- `test_utils.py` does **not** set `INTERNAL_API_KEY` itself — it relies on `test_main.py` having already set `os.environ["INTERNAL_API_KEY"]` at module level. When running `test_utils.py` in isolation (`pytest tests/test_utils.py`), this is fine because it only tests pure functions (`sanitize_filename`, `calculate_priority_score`) that don't read the env var.

---

## Pipeline Output Contract

Agents write to these exact paths and no others:

| File | Owner | Blocks release if… |
|------|-------|--------------------|
| `reports/security.sarif.json` | sec-auditor | `x-autorelease-summary.blocked: true` |
| `reports/infra-check.json` | infra-validator | `blocked: true` |
| `reports/coverage-gaps.json` | test-synthesizer | uncovered high-risk symbols with no `test_file_generated` |
| `reports/release-readiness.json` | release-planner | n/a — final roll-up |
| `artifacts/RELEASE_NOTES.md` | pr-artifact-gen | — |
| `artifacts/ROLLBACK_RUNBOOK.md` | pr-artifact-gen | — |
| `artifacts/DEPLOY_CHECKLIST.md` | pr-artifact-gen | — |

**`test-synthesizer` is the only agent permitted to create new source files** (test files only). All other agents are read-only on source.

---

## Compliance Gates (Non-Negotiable)

- SARIF output **must** be 2.1.0 with `ruleId`, `level`, `message.text`, and `physicalLocation` (file + line) on every result.
- K8s manifests require: `runAsNonRoot: true`, no `privileged: true`, CPU+memory `limits`, `readinessProbe`, `livenessProbe`.
- Helm `values.yaml` must not hardcode `imageTag: latest`.
- Dockerfiles must not use mutable tags without SHA digest (CIS-4.9).
- Commits: Conventional Commits enforced — `feat(api-gateway):`, `fix(worker-service):`, etc. Scope is required for service changes.

---

## Microservice Ports & Base Images

| Service | Port | Base Image |
|---------|------|------------|
| api-gateway | 3000 | `node:20-alpine` |
| worker-service | 8080 | `python:3.11-slim` |
| metrics-exporter | 9090 | `gcr.io/distroless/static` |

---

## Bob Shell CI Entry Points

```bash
scripts/bob-preflight.sh          # thin wrapper: validates prereqs, calls bob --non-interactive, exits 0/1/2/3
scripts/run-release-preflight.sh  # full 4-stage CI simulator (demo-grade)
```
Exit codes: `0`=GO, `1`=NO-GO, `2`=prerequisites missing, `3`=pipeline error.
The GitHub Actions job `bob-shell-preflight` in `.github/workflows/ci.yml` runs these after all other jobs.
