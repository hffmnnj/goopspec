# Security Checklist

Use during verification; prioritize critical-path risks.

## Authentication and Authorization

- Strong credential/session handling.
- Protected endpoints enforce authorization.
- No privilege escalation paths.

## Input and Injection Defense

- Validate all external input server-side.
- Enforce type, length, and format constraints.
- Prevent SQL/NoSQL/command/XSS injection vectors.

## Data Protection

- HTTPS/TLS and secure cookie settings.
- Encryption for sensitive data at rest.
- No secrets in code, logs, or responses.

## API Security

- Rate limits and request size limits.
- Robust token/API-key validation.
- Safe error handling — no stack trace leakage.
- Strict CORS and content headers.

## Infrastructure and Dependency Hygiene

- Production-safe config (no debug defaults).
- Dependency vulnerability scanning.
- Security event logging and alerting.

## Code Review Security Pass

- No hardcoded secrets.
- Safe crypto and randomness usage.
- Security-focused review for critical changes.

## OWASP Top 10 Compact Checklist

| # | Risk | Checks |
|---|------|--------|
| 1 | Broken access control | Authorization on every endpoint; no privilege escalation; CORS configured |
| 2 | Cryptographic failures | TLS in transit; encryption at rest; strong password hashing |
| 3 | Injection | Parameterized queries; input validation; output encoding |
| 4 | Insecure design | Threat model exists; secure defaults; security requirements defined |
| 5 | Misconfiguration | Debug disabled in production; default credentials changed; security headers set |
| 6 | Vulnerable components | Dependencies up to date; no known CVEs |
| 7 | Auth failures | Strong passwords; account lockout; secure sessions |
| 8 | Data integrity | Signed updates; integrity checks; input validation |
| 9 | Logging failures | Security events logged; no secrets in logs; log integrity protected |
| 10 | SSRF | URL validation; restricted outbound requests; network segmentation |

## Audit Report Template

```markdown
# Security Audit Report

**Date:** YYYY-MM-DD
**Scope:** [what was audited]
**Risk Level:** Critical/High/Medium/Low

## Executive Summary
[Brief overview of findings]

## Critical Findings
[Immediate attention]

## High / Medium / Low Priority
[Issues by severity]

## Recommendations
[Prioritized action items]
```

## Verification Commands

```bash
bun audit
semgrep --config auto .
gitleaks detect
```

## Severity Priority

| Severity | Response |
|----------|----------|
| Critical | Fix immediately |
| High | Within 24 hours |
| Medium | Within a week |
| Low | Next release |

---

*Security Checklist v1.0 — GoopSpec Reference*
