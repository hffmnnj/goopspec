# Security Checklist

Use during verification; prioritize critical-path risks.

## Authentication and Authorization

- strong credential/session handling
- protected endpoints enforce authorization
- no privilege escalation paths

## Input and Injection Defense

- validate all external input server-side
- enforce type/length/format constraints
- prevent SQL/NoSQL/command/XSS injection vectors

## Data Protection

- HTTPS/TLS and secure cookie settings
- encryption for sensitive data at rest
- no secrets in code, logs, or responses

## API Security

- rate limits and request size limits
- robust token/API-key validation
- safe error handling (no stack trace leakage)
- strict CORS and content headers

## Infrastructure and Dependency Hygiene

- production-safe config (no debug defaults)
- dependency vulnerability scanning
- security event logging and alerting

## Code Review Security Pass

- no hardcoded secrets
- safe crypto and randomness usage
- security-focused review for critical changes

## Recommended Checks

```bash
npm audit
semgrep --config auto .
gitleaks detect
```

## Severity Priority

- Critical: immediate fix
- High: 24h
- Medium: within a week
- Low: next release

*Security Checklist*
