# AGENTS.md — Ask Mode

This file provides guidance to agents when working with code in this repository.

## Non-Obvious Documentation Context

- **`reports/` files are the authoritative source of truth** for all pipeline findings — not README.md or inline code comments. When asked about findings, always read the report files directly.

- **`reports/security.sarif.json` has a non-standard top-level key** — `"x-autorelease-summary"` is outside the SARIF 2.1.0 spec `runs[]` array. This custom key holds the human-readable counts and the `blocked` boolean that the orchestrator reads for its GO/NO-GO decision.

- **`services/api-gateway/__tests__/` contains 5 test files** covering the same routes with different angles — `auth.test.ts` and `auth.routes.test.ts` both test `POST /auth/login` but with different assertion styles (one uses `toMatch(/regex/)`, the other checks exact strings). This is deliberate redundancy from synthesis; it is not a refactoring target.

- **`services/worker-service/tests/test_sanitize.py` is intentionally minimal** (1 test, happy path only) — it is the "before" state the test-synthesizer was working from. The full coverage is in `test_utils.py`. Do not delete `test_sanitize.py`.

- **The `metrics-exporter` service is defined in `AGENTS.md` but does not exist in `services/`** — it is referenced as a planned third microservice (Go 1.22, distroless, port 9090). There is no source code for it yet.

- **`charts/autorelease-demo/` is a single-service Helm chart** — it only templates `api-gateway-deployment.yaml`. The worker-service is deployed via raw K8s manifests in `k8s/`, not through Helm.

- **`.bobrules` is the machine-readable compliance policy file** — it contains the rules that all agents are required to enforce. When asked "why is X a blocker?", the answer is usually in `.bobrules`, not in the SARIF report.

- **`scripts/bob-preflight.sh` exit code 0 means GO** — this is the opposite of typical shell convention where non-zero means failure. Exit 1 is NO-GO (blockers found), not "script error". Exit 2/3 are genuine errors.

- **`artifacts/DEPLOY_CHECKLIST.md` currently shows ⛔ NO-GO** at the top — the workspace is in a deliberately broken state to demonstrate the pipeline's ability to catch issues. The 13 blockers listed are real findings in the codebase.
