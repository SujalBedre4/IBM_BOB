# AGENTS.md — Agent / Coding Mode

This file provides guidance to agents when working with code in this repository.

## Non-Obvious Coding Rules

### api-gateway (TypeScript)

- **Never import `{ app }` before setting `JWT_SECRET`** — `services/api-gateway/src/middleware/auth.ts` throws `Error('JWT_SECRET environment variable is required')` at module evaluation time. In any new test file, always `process.env.JWT_SECRET = '…'` inside `beforeAll` *and* ensure the import of `app` is at the top of the file (Node hoists static imports before runtime code). Use `jest.resetModules()` + dynamic `require` if you need to test the missing-secret failure path.

- **JWT `sub` claim is the user's email, not an ID** — `auth.ts:43` signs `{ sub: email }`. When writing tests for `GET /users/:id` self-access, the `:id` param must equal the email string, not a UUID. This is an intentional known IDOR issue (tracked in `reports/security.sarif.json` ASVS-4.2.1).

- **`requireRole` is a factory** — call as `requireRole('admin')` (returns middleware), not `requireRole('admin')(req, res, next)` inline. The returned function also checks `user.role !== 'admin'` as a bypass, meaning all routes protected by any `requireRole` call are automatically open to admins.

- **Jest config is exclusively in `package.json` `"jest"` key** — do not create `jest.config.js` or `jest.config.ts`. The ts-jest inline tsconfig uses `"module": "commonjs"` which overrides `tsconfig.json`; do not use ESM-style imports in test files.

- **Tests live in `services/api-gateway/__tests__/`** — all test files must import app as `from '../../src/index'`. Relative depth matters; placing a test outside `__tests__/` at a different depth breaks the import path.
- **`--testPathPattern` vs `--testNamePattern`** — `npm test -- --testPathPattern auth.middleware` selects a file; `npm test -- --testNamePattern "returns 401"` runs tests matching a description string (regex). Both flags can be combined.

### worker-service (Python)

- **`INTERNAL_API_KEY` env var must be set before the module import** — `src/main.py` reads `os.environ.get("INTERNAL_API_KEY")` inside the handler at call time, but the FastAPI `app` instance is created at import time. If you set the env var after `from src.main import app`, the var will exist but `os.environ.setdefault(…)` in `test_enqueue_job.py` uses `setdefault` — this will NOT override an already-set value. Use `monkeypatch.setenv` in pytest fixtures for isolation.

- **`src/` has no `__init__.py`** — pytest must be invoked from `services/worker-service/`. Adding an `__init__.py` to `src/` would change import semantics and break existing tests.

- **Do not upgrade Pydantic validators to v2 style** — `JobRequest` uses `@validator` (v1 compat). The installed `pydantic==2.5.3` runs in v1-compatibility mode. Adding `@field_validator` or `model_validator` will conflict.

- **`test_enqueue_job.py` uses `raise_server_exceptions=False`** — unhandled server errors return 500 instead of raising in the test. `test_main.py` uses default `TestClient` which re-raises. Pick the right client for the test scenario; mixing them in the same class is a bug.

- **`test_utils.py` requires no env setup of its own** — it imports `sanitize_filename` and `calculate_priority_score` directly from `src.main`, neither of which reads `INTERNAL_API_KEY`. Running `pytest tests/test_utils.py` in isolation is safe; running `pytest tests/test_main.py tests/test_utils.py` together is also safe because `test_main.py` sets the env at module level before `test_utils.py` even imports.

### Pipeline / Scripts

- **`scripts/run-release-preflight.sh` is the canonical demo entry point** — it animates Bob's subagent dispatch. `scripts/bob-preflight.sh` is the thin production wrapper that calls `bob --non-interactive`. In CI, always call `run-release-preflight.sh`; it calls `bob-preflight.sh` logic internally when Bob CLI is present.

- **Verdict is read from `reports/release-readiness.json` `.verdict` field** — `"GO"` or `"NO-GO"` (exact strings). Scripts exit `1` on `"NO-GO"`. Do not read from individual subagent reports for the final gate decision.
