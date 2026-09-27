# Deployment Checklist — api-gateway / worker-service v1.4.2

**Deployment Window:** ___________________________  
**Deployer:** ___________________________  
**Environment:** Production  
**Namespace:** `production`  
**AutoRelease Guard Pipeline:** ✅ Complete — reports generated 2025-07-14

---

> ## ⛔ CURRENT STATUS: NO-GO
>
> This release is **blocked from deployment** by 6 critical/high security findings and
> 5 high infrastructure findings. All items marked ❌ in Section 1 must be resolved and
> re-verified before the release can proceed. Do not advance past Section 1 until all
> blockers are cleared.

---

## 1. Pre-Deployment Gate — AutoRelease Guard Results

Items marked ❌ are **hard blockers**. Items marked ⚠️ are advisory (must be acknowledged).
Items marked ✅ are pre-verified by the pipeline.

### 1a. Security Audit (`reports/security.sarif.json`)

- [ ] ❌ **[CRITICAL]** Hardcoded admin credential hash removed from `auth.ts:14`
- [ ] ❌ **[HIGH]** `jwt.verify()` algorithm restriction added in `middleware/auth.ts:33`
- [ ] ❌ **[HIGH]** `jwt.verify()` algorithm restriction added in `auth.ts:62`
- [ ] ❌ **[HIGH]** IDOR fix merged — `sub` claim and user ID types aligned in `users.ts:14`
- [ ] ❌ **[HIGH]** `express-rate-limit` added to `POST /auth/login` (`auth.ts:23`)
- [ ] ❌ **[HIGH]** `axios` upgraded to `>=1.7.4` in `api-gateway/package.json`
- [ ] ❌ **[HIGH]** `fastapi` upgraded to `>=0.109.1` in `worker-service/requirements.txt`
- [ ] ⚠️ **[MEDIUM]** Password max-length check added before `bcrypt.compare()` (`auth.ts:24`)
- [ ] ⚠️ **[MEDIUM]** API key comparison uses `hmac.compare_digest()` (`main.py:45`)
- [ ] ⚠️ **[MEDIUM]** Job IDs use `uuid.uuid4()` or `secrets.token_hex(8)` (`main.py:49`)
- [ ] ⚠️ **[MEDIUM]** `pydantic` upgraded to `>=2.7.0` in `requirements.txt`
- [ ] ℹ️ **[LOW]** `bcryptjs` replaced with maintained alternative (advisory — not a hard blocker)
- [ ] ℹ️ **[LOW]** Duplicate `httpx` entry removed from `requirements.txt` (advisory)

**Security status:** ❌ BLOCKED — 1 critical, 5 high open  
**Re-scan required** after fixes: run `npm audit --audit-level=moderate` and `pip-audit -r requirements.txt` in CI

### 1b. Infrastructure Lint (`reports/infra-check.json`)

- [ ] ❌ **[HIGH]** `node:20-alpine` Dockerfile base image pinned to SHA digest (`api-gateway/Dockerfile:1`)
- [ ] ❌ **[HIGH]** `python:3.11-slim` Dockerfile base image pinned to SHA digest (`worker-service/Dockerfile:1`)
- [ ] ❌ **[HIGH]** `kubeval` download pinned to version + checksum verified (`ci.yml:106`)
- [ ] ❌ **[HIGH]** `|| true` removed from `pip-audit` CI step (`ci.yml:96`)
- [ ] ❌ **[HIGH]** `no-fail: false` set on both `hadolint-action` steps (`ci.yml:64`)
- [ ] ⚠️ **[MEDIUM]** `readOnlyRootFilesystem: true` added to `worker-service` container securityContext
- [ ] ⚠️ **[MEDIUM]** `NetworkPolicy` created for `production` namespace (default-deny + explicit allow-list)

**Infrastructure status:** ❌ BLOCKED — 5 high open  

### 1c. Test Coverage (`reports/coverage-gaps.json`)

- [ ] ⚠️ `services/api-gateway/__tests__/auth.test.ts` executed in CI — all tests pass
- [ ] ⚠️ `services/worker-service/tests/test_main.py` executed in CI — all tests pass
- [ ] ⚠️ 6 high-risk uncovered symbols confirmed covered by synthesized tests

**Test status:** ⚠️ ADVISORY — tests synthesized but CI execution not yet confirmed  

### 1d. Release Artifacts

- [✅] Release notes generated → `artifacts/RELEASE_NOTES.md`
- [✅] Rollback runbook generated → `artifacts/ROLLBACK_RUNBOOK.md`
- [✅] Deployment checklist generated → `artifacts/DEPLOY_CHECKLIST.md`

---

## 2. Pre-Deployment Manual Checks

Complete these after all Section 1 blockers are resolved:

- [ ] All Section 1 ❌ blockers confirmed resolved (security re-scan clean, infra re-lint clean)
- [ ] Minimum 2 code-review approvals on the release PR
- [ ] All CI/CD pipeline jobs green (lint, test, audit, kubeval)
- [ ] Staging environment deployment completed and smoke-tested
- [ ] Rollback runbook reviewed and validated by on-call SRE
- [ ] Deployment window confirmed with team in Slack `#releases`
- [ ] Monitoring baseline captured (Grafana / Datadog dashboard screenshot)
- [ ] No active incidents or elevated error rates in production before deployment

---

## 3. Deployment Execution

- [ ] Deployment started:
  ```bash
  # Option A — raw manifests
  kubectl apply -f k8s/ -n production

  # Option B — Helm
  helm upgrade autorelease-demo ./charts/autorelease-demo \
    --namespace production --install --atomic --timeout 5m
  ```
- [ ] Tag images with release version `v1.4.2` before pushing:
  ```bash
  docker tag <registry>/api-gateway:latest <registry>/api-gateway:v1.4.2
  docker tag <registry>/worker-service:latest <registry>/worker-service:v1.4.2
  docker push <registry>/api-gateway:v1.4.2
  docker push <registry>/worker-service:v1.4.2
  ```
- [ ] `api-gateway` rollout healthy:
  ```bash
  kubectl rollout status deployment/api-gateway -n production --timeout=5m
  ```
- [ ] `worker-service` rollout healthy:
  ```bash
  kubectl rollout status deployment/worker-service -n production --timeout=5m
  ```
- [ ] All pods in `Running` state, readiness probes green:
  ```bash
  kubectl get pods -n production
  ```
- [ ] No error spike in application logs (tail 5 min post-deploy):
  ```bash
  kubectl logs -n production -l app=api-gateway --tail=100 --follow &
  kubectl logs -n production -l app=worker-service --tail=100 --follow &
  ```

---

## 4. Post-Deployment Smoke Tests

- [ ] `api-gateway` health endpoint returns 200:
  ```bash
  curl -f http://<API_GW_HOST>:3000/health
  ```
- [ ] `api-gateway` auth endpoint reachable (expect 400/401 on probe credentials):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://<API_GW_HOST>:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"probe@example.com","password":"probe"}'
  ```
- [ ] `worker-service` health endpoint returns 200:
  ```bash
  curl -f http://<WORKER_HOST>:8080/health
  ```
- [ ] `worker-service` jobs endpoint reachable (expect 401/422 on probe request):
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://<WORKER_HOST>:8080/jobs \
    -H "Content-Type: application/json" \
    -d '{}'
  ```
- [ ] Key metrics stable — no latency spike, error rate, or CPU anomaly (5 min post-deploy)
- [ ] No new alerts firing in PagerDuty / Datadog

---

## 5. Rollback Trigger Conditions

Initiate rollback (`artifacts/ROLLBACK_RUNBOOK.md`) immediately if any of the following occur
within 30 minutes of deployment:

- Any smoke test health endpoint returns non-200
- Error rate increases > 5% above pre-deployment baseline
- p99 latency increases > 200 ms above baseline
- Any P1/P2 alert fires in PagerDuty attributable to this deployment
- Pod crash-looping (> 2 restarts in 5 min)

---

## 6. Sign-Off

All three sign-offs are required before the deployment window is closed.

| Role | Name | Signature | Timestamp |
|------|------|-----------|-----------|
| Release Engineer | | | |
| Security Approval | | | |
| Infrastructure Approval | | | |

---

**Deployment Status:** [ ] IN PROGRESS &nbsp;&nbsp; [ ] SUCCESS &nbsp;&nbsp; [ ] ROLLED BACK

*Generated by AutoRelease Guard v1.0.0*
