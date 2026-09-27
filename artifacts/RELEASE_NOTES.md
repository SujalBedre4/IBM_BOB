# Release Notes — api-gateway / worker-service v1.4.2

**Release Date:** 2025-07-14  
**Branch:** release/1.4.2  
**Services:** api-gateway v1.4.2, worker-service v1.4.2  
**Release Engineer:** AutoRelease Guard  
**Pipeline Status:** ❌ NO-GO — security and infrastructure blockers must be resolved before deployment

---

## [1.4.2] — 2025-07-14

### Added
- `api-gateway` (Node.js, port 3000): JWT-based authentication middleware, role-based access
  control (`validateJWT`, `requireRole`), login and token-refresh endpoints, user profile and
  deletion routes.
- `worker-service` (Python, port 8080): Job enqueue endpoint (`POST /jobs`), filename sanitisation
  (`sanitize_filename`), priority scoring (`calculate_priority_score`), health endpoint
  (`GET /health`).
- Kubernetes manifests for both services targeting the `production` namespace.
- Helm chart `autorelease-demo` with configurable values.
- GitHub Actions CI pipeline (`ci.yml`) with hadolint, kubeval, and pip-audit steps.

### Changed
- N/A (initial scan baseline — no prior release detected in workspace)

### Fixed
- N/A

### Security

> ⚠️ **RELEASE BLOCKED** — 1 CRITICAL and 5 HIGH security findings must be resolved before
> this release can be deployed to any environment.

| Severity | Finding | Location | Status |
|----------|---------|----------|--------|
| **CRITICAL** | Hardcoded bcrypt password hash for `admin@example.com` in `MOCK_USERS` — any matching credential grants admin access | `services/api-gateway/src/routes/auth.ts:14` | ❌ OPEN |
| **HIGH** | JWT algorithm confusion — `jwt.verify()` in `validateJWT` middleware accepts any algorithm (no `algorithms` restriction) | `services/api-gateway/src/middleware/auth.ts:33` | ❌ OPEN |
| **HIGH** | JWT algorithm confusion — `jwt.verify()` on `/auth/refresh` also lacks algorithm restriction | `services/api-gateway/src/routes/auth.ts:62` | ❌ OPEN |
| **HIGH** | IDOR — ownership check in `GET /users/:id` compares email string (`sub`) against a numeric/UUID ID param; results unpredictable | `services/api-gateway/src/routes/users.ts:14` | ❌ OPEN |
| **HIGH** | Missing rate limiting on `POST /auth/login` — unlimited brute-force possible | `services/api-gateway/src/routes/auth.ts:23` | ❌ OPEN |
| **HIGH** | `axios ^1.6.2` vulnerable to CVE-2024-39338 (SSRF) and CVE-2024-28849 (credential leak on redirect) | `services/api-gateway/package.json:18` | ❌ OPEN |
| **HIGH** | `fastapi==0.109.0` vulnerable to CVE-2024-24762 (ReDoS via crafted Content-Type) | `services/worker-service/requirements.txt:1` | ❌ OPEN |
| MEDIUM | `POST /auth/login` accepts unbounded password length — bcrypt DoS possible | `services/api-gateway/src/routes/auth.ts:24` | ⚠️ OPEN |
| MEDIUM | API key comparison uses non-constant-time `!=` — timing-attack risk | `services/worker-service/src/main.py:45` | ⚠️ OPEN |
| MEDIUM | Job IDs derived from non-cryptographic `hash()` — predictable/enumerable identifiers | `services/worker-service/src/main.py:49` | ⚠️ OPEN |
| MEDIUM | `pydantic==2.5.3` vulnerable to CVE-2024-3772 (ReDoS in email validator) | `services/worker-service/requirements.txt:3` | ⚠️ OPEN |
| LOW | `bcryptjs@2.4.3` unmaintained since 2017 | `services/api-gateway/package.json:16` | ℹ️ ADVISORY |
| LOW | `httpx` listed twice in `requirements.txt` | `services/worker-service/requirements.txt:9` | ℹ️ ADVISORY |

**Dependency audit:** 13 packages flagged (manual cross-reference; run `npm audit` and
`pip-audit` in CI with internet access for a complete scan).

### Infrastructure

> ⚠️ **RELEASE BLOCKED** — 5 HIGH infrastructure findings must be resolved before deployment.

| Severity | Finding | File | Status |
|----------|---------|------|--------|
| **HIGH** | Base image `node:20-alpine` not pinned to SHA digest (CIS-4.9) | `services/api-gateway/Dockerfile:1` | ❌ OPEN |
| **HIGH** | Base image `python:3.11-slim` not pinned to SHA digest (CIS-4.9) | `services/worker-service/Dockerfile:1` | ❌ OPEN |
| **HIGH** | `kubeval` downloaded from internet at runtime with no checksum verification (CICD-003) | `.github/workflows/ci.yml:106` | ❌ OPEN |
| **HIGH** | `pip-audit` step ends with `\|\| true` — security failures never block CI (CICD-006) | `.github/workflows/ci.yml:96` | ❌ OPEN |
| **HIGH** | Both `hadolint-action` steps set `no-fail: true` — Dockerfile lint never blocks CI (CICD-006) | `.github/workflows/ci.yml:64` | ❌ OPEN |
| MEDIUM | `worker-service` container missing `readOnlyRootFilesystem: true` (K8S-SEC-004) | `k8s/worker-service-deployment.yaml:57` | ⚠️ OPEN |
| MEDIUM | No `NetworkPolicy` defined for `production` namespace (K8S-NET-001) | `k8s/worker-service-deployment.yaml:1` | ⚠️ OPEN |

### Tests

- Coverage gaps identified: **11 symbols** across both services
- High-risk uncovered symbols: **6** (JWT middleware, RBAC middleware, login, refresh, IDOR route, job enqueue)
- Tests synthesized by AutoRelease Guard: **2 test files**
  - `services/api-gateway/__tests__/auth.test.ts`
  - `services/worker-service/tests/test_main.py`
- Estimated coverage delta: +~40% on security-critical paths

---

## Deployment Notes

**Services affected:** api-gateway, worker-service  
**Database migrations:** None detected  
**Breaking changes:** None detected  
**Rollback complexity:** Low (no DB migrations; `kubectl rollout undo` is sufficient)

---

## Required Pre-Release Actions

The following must be completed **before** this release is approved for production deployment:

1. **[SEC-CRITICAL]** Remove hardcoded `MOCK_USERS` credential store from `auth.ts:14`. Load user records from a secrets-managed data source.
2. **[SEC-HIGH]** Add `{ algorithms: ['HS256'] }` to both `jwt.verify()` calls (`auth.ts:33` and `auth.ts:62` / `middleware/auth.ts:33`).
3. **[SEC-HIGH]** Fix IDOR in `GET /users/:id` — align `sub` claim type with route parameter type.
4. **[SEC-HIGH]** Add `express-rate-limit` to `POST /auth/login` (max 10 req / 15 min per IP).
5. **[SEC-HIGH]** Upgrade `axios` to `>=1.7.4` in `api-gateway/package.json`.
6. **[SEC-HIGH]** Upgrade `fastapi` to `>=0.109.1` in `worker-service/requirements.txt`.
7. **[INFRA-HIGH]** Pin `node:20-alpine` and `python:3.11-slim` Dockerfile base images to SHA digests.
8. **[INFRA-HIGH]** Pin `kubeval` version in CI and verify download checksum.
9. **[INFRA-HIGH]** Remove `|| true` from `pip-audit` CI step.
10. **[INFRA-HIGH]** Set `no-fail: false` on both `hadolint-action` steps in CI.
11. **[TEST]** Execute synthesized test files and confirm all tests pass in CI.

---

## Security Sign-Off

| Check | Status | Details |
|-------|--------|---------|
| OWASP ASVS Level 2 | ❌ BLOCKED | 1 critical, 5 high findings open |
| Dependency CVE Scan | ❌ BLOCKED | axios (×2 CVEs), fastapi (×1 CVE), pydantic (×1 CVE) — manual scan only; CI scan required |
| Secret Detection | ❌ BLOCKED | Hardcoded admin credential hash in source |
| Infrastructure Lint | ❌ BLOCKED | 5 high-severity CI/CD and Dockerfile findings |
| Test Coverage | ⚠️ ADVISORY | 6 high-risk symbols uncovered; test files synthesized but not yet executed in CI |

---

*Generated by AutoRelease Guard v1.0.0*
