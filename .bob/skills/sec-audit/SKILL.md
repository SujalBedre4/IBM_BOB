---
name: sec-audit
description: >-
  Use when performing a security audit on changed source files — runs OWASP ASVS checks,
  dependency CVE scanning, and secret detection, then writes a SARIF 2.1.0 report.
---

# SecOps Auditor Skill

Perform a thorough security analysis of the changed files in the current PR/branch.
Follow every step. Write all findings to `reports/security.sarif.json`.

---

## Step 1 — Read Rules and Context

1. Read `.bobrules` for security output requirements.
2. Read `AGENTS.md` for compliance baseline (OWASP ASVS Level 2).
3. Confirm which files are in scope (received from orchestrator or determine via git diff).

---

## Step 2 — Dependency Vulnerability Scan

Run the appropriate dependency scanner based on the project type detected in changed files.
Use `execute_command` for each applicable tool:

**Node.js** (if `package.json` or `package-lock.json` changed):
```bash
npm audit --json 2>/dev/null || echo '{"error":"npm not available"}'
```

**Python** (if `requirements.txt`, `pyproject.toml`, or `setup.py` changed):
```bash
pip-audit --format json 2>/dev/null || safety check --json 2>/dev/null || echo '{"error":"pip-audit/safety not available"}'
```

**Go** (if `go.mod` or `go.sum` changed):
```bash
govulncheck -json ./... 2>/dev/null || echo '{"error":"govulncheck not available"}'
```

If tools are unavailable, perform a manual review: read the dependency manifest files and
cross-reference any unfamiliar packages against known CVE patterns (outdated major versions,
packages with known compromise history).

---

## Step 3 — Source Code Static Analysis

For each changed source file, read it with `read_file` and scan for:

### OWASP ASVS Level 2 — Critical Checks

| Rule ID | Check | Severity |
|---------|-------|----------|
| ASVS-2.1.1 | Passwords/secrets not hardcoded | Critical |
| ASVS-3.4.1 | Session tokens not in URLs | High |
| ASVS-5.2.1 | SQL/NoSQL injection (raw query strings with user input) | Critical |
| ASVS-5.3.1 | OS command injection (exec/spawn with unvalidated input) | Critical |
| ASVS-7.1.1 | No credentials in log statements | High |
| ASVS-8.3.1 | No PII or sensitive data in GET params or logs | High |
| ASVS-10.3.1 | No eval() or dynamic code execution with user input | Critical |
| ASVS-12.3.1 | No path traversal via user-controlled file paths | High |
| ASVS-13.2.1 | API endpoints validate Content-Type and input schema | Medium |
| ASVS-14.2.1 | No use of deprecated/vulnerable crypto (MD5, SHA1 for auth) | High |

### Secret Detection Patterns (regex scan)

Look for these patterns in every changed file:
- `(?i)(api[_-]?key|secret|password|token|credentials?)\s*[:=]\s*['"][^'"]{8,}['"]`
- `-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----`
- `AIza[0-9A-Za-z-_]{35}` (Google API key)
- `sk-[a-zA-Z0-9]{48}` (OpenAI key)
- `ghp_[a-zA-Z0-9]{36}` (GitHub PAT)
- `xox[baprs]-[0-9a-zA-Z]{10,}` (Slack token)

---

## Step 4 — Gitleaks Pattern Scan

Run Gitleaks if available:
```bash
gitleaks detect --source . --report-format json --report-path /tmp/gitleaks.json --no-git 2>/dev/null && cat /tmp/gitleaks.json || echo '{"error":"gitleaks not available"}'
```

If unavailable, note this in the report and rely on Step 3 manual scan.

---

## Step 5 — Build SARIF 2.1.0 Report

Construct the SARIF JSON from all findings collected in Steps 2–4.
Write to `reports/security.sarif.json` using `write_file`.

Use this schema:

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "AutoRelease Guard SecAuditor",
          "version": "1.0.0",
          "rules": []
        }
      },
      "results": []
    }
  ],
  "x-autorelease-summary": {
    "timestamp": "",
    "findings_by_severity": { "critical": 0, "high": 0, "medium": 0, "low": 0 },
    "blocked": false,
    "blocking_reason": ""
  }
}
```

**Severity mapping:**
- SARIF `error` = Critical or High (blocks release)
- SARIF `warning` = Medium
- SARIF `note` = Low / Informational

Set `x-autorelease-summary.blocked = true` if any `critical` or `high` findings exist.

Each `results` entry must include:
```json
{
  "ruleId": "ASVS-X.X.X or CVE-XXXX-XXXXX",
  "level": "error|warning|note",
  "message": { "text": "Human-readable finding description with remediation" },
  "locations": [{
    "physicalLocation": {
      "artifactLocation": { "uri": "relative/path/to/file.ts" },
      "region": { "startLine": 42 }
    }
  }]
}
```

---

## Step 6 — Output Summary

After writing the SARIF file, report the summary:
- Total findings by severity
- Whether the release is BLOCKED
- Top 3 most critical findings with file locations
- Recommended remediation steps for each blocker
