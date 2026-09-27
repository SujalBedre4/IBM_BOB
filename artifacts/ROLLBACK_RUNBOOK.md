# Rollback Runbook — api-gateway / worker-service v1.4.2

**Prepared:** 2025-07-14  
**Author:** AutoRelease Guard (automated)  
**Severity:** Use this runbook only if the v1.4.2 deployment causes production issues.  
**Review required by:** Release Engineer before deployment window opens.

---

## Pre-Rollback Checklist

Confirm every item before issuing any rollback command:

- [ ] Production incident confirmed and severity assessed (P1 / P2 / P3)
- [ ] Rollback decision approved by on-call lead
- [ ] Note the currently running image SHA for each service:
  ```bash
  kubectl get deployment api-gateway -n production \
    -o jsonpath='{.spec.template.spec.containers[0].image}'
  kubectl get deployment worker-service -n production \
    -o jsonpath='{.spec.template.spec.containers[0].image}'
  ```
- [ ] Database migration status confirmed — **no migrations present in v1.4.2**; rollback is safe without a DB step
- [ ] Downstream services and consumers notified via Slack `#incidents`
- [ ] Monitoring baseline (Grafana / Datadog) screenshotted before rollback for comparison

---

## Rollback Commands

Execute in order. Wait for each `rollout status` to complete before proceeding.

### api-gateway (Node.js — Port 3000)

```bash
# Step 1: View rollout history (confirm prior revision exists)
kubectl rollout history deployment/api-gateway -n production

# Step 2: Roll back to the previous version
kubectl rollout undo deployment/api-gateway -n production

# Step 3: Monitor rollback progress (waits up to 5 min)
kubectl rollout status deployment/api-gateway -n production --timeout=5m

# Step 4: Confirm pods are Running and Ready
kubectl get pods -n production -l app=api-gateway
```

### worker-service (Python — Port 8080)

```bash
# Step 1: View rollout history
kubectl rollout history deployment/worker-service -n production

# Step 2: Roll back to the previous version
kubectl rollout undo deployment/worker-service -n production

# Step 3: Monitor rollback progress
kubectl rollout status deployment/worker-service -n production --timeout=5m

# Step 4: Confirm pods are Running and Ready
kubectl get pods -n production -l app=worker-service
```

### Roll back both services at once (convenience)

```bash
kubectl rollout undo deployment/api-gateway deployment/worker-service -n production
kubectl rollout status deployment/api-gateway deployment/worker-service \
  -n production --timeout=5m
```

---

## Database Migration Rollback

**v1.4.2 contains no database migrations.** No DB rollback step is required.

If a future release introduces migrations, a DBA-approved down-migration script must be
executed before rolling back the application containers. In that case, do NOT rollback
containers before reverting schema.

---

## Smoke Tests — Post-Rollback Verification

Run the following checks immediately after rollback completes. All responses must be
`HTTP 200` before the incident can be marked resolved.

```bash
#!/bin/bash
set -e

API_GW_HOST="${API_GW_HOST:-localhost}"
WORKER_HOST="${WORKER_HOST:-localhost}"

echo "=== AutoRelease Guard Rollback Smoke Test — v1.4.2 ==="
echo ""

# --- api-gateway health ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://${API_GW_HOST}:3000/health")
if [ "$STATUS" = "200" ]; then
  echo "✅ api-gateway /health → 200 OK"
else
  echo "❌ api-gateway /health → ${STATUS} (UNHEALTHY)"
  FAILED=1
fi

# --- api-gateway auth endpoint reachable ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://${API_GW_HOST}:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"probe@example.com","password":"probe"}')
# Expect 401 (invalid creds) — confirms route is alive
if [ "$STATUS" = "401" ] || [ "$STATUS" = "400" ]; then
  echo "✅ api-gateway /auth/login is reachable (→ ${STATUS} as expected)"
else
  echo "❌ api-gateway /auth/login unexpected response: ${STATUS}"
  FAILED=1
fi

# --- worker-service health ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://${WORKER_HOST}:8080/health")
if [ "$STATUS" = "200" ]; then
  echo "✅ worker-service /health → 200 OK"
else
  echo "❌ worker-service /health → ${STATUS} (UNHEALTHY)"
  FAILED=1
fi

# --- worker-service jobs endpoint reachable ---
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://${WORKER_HOST}:8080/jobs" \
  -H "Content-Type: application/json" \
  -d '{}')
# Expect 401 / 422 (no API key / invalid body) — confirms route is alive
if [ "$STATUS" = "401" ] || [ "$STATUS" = "422" ]; then
  echo "✅ worker-service /jobs is reachable (→ ${STATUS} as expected)"
else
  echo "❌ worker-service /jobs unexpected response: ${STATUS}"
  FAILED=1
fi

echo ""
if [ "${FAILED:-0}" = "1" ]; then
  echo "❌ Smoke test FAILED — escalate immediately (see Escalation Path below)"
  exit 1
else
  echo "✅ All smoke tests passed — rollback confirmed successful"
fi
```

---

## Escalation Path

If rollback does not resolve the incident, or smoke tests continue to fail after rollback:

| Step | Who | How | Threshold |
|------|-----|-----|-----------|
| 1 | On-call SRE | PagerDuty — auto-escalates after 5 min | Immediately on smoke test failure |
| 2 | Service owner | Slack `#incidents` + direct message | Within 5 min if SRE unresponsive |
| 3 | Engineering manager | Phone call | P1 not resolved within 30 min |
| 4 | Incident commander | Declare major incident | Revenue-impacting or data-loss risk |

> **If rollback fails due to a missing prior revision** (e.g., first-ever deployment):  
> Pull the last known-good image tag from the container registry and patch the deployment
> directly: `kubectl set image deployment/api-gateway api-gateway=<registry>/<image>:<tag> -n production`

---

*Generated by AutoRelease Guard v1.0.0*
