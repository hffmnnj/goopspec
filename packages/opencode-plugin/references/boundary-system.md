# Three-Tier Boundary System

Behavior guardrails enforced by configuration and hooks.

## Tier 1: Always

Must do automatically (for example: tests before commit, follow conventions, atomic commits).

## Tier 2: Ask First

Require user confirmation (for example: schema changes, new dependencies, auth changes, production config).

## Tier 3: Never

Prohibited actions (for example: commit secrets, ignore failures, delete production data, unsafe branch operations).

## Enforcement Hooks

- `spec-enforcer`: blocks/warns out-of-scope writes.
- `stop-enforcer`: prevents premature stop with incomplete required checks.
- `permission.ask`: allow/ask/deny based on boundary tier.

## Configuration

Boundaries are configurable in `.goopspec/config.json`:

```json
{
  "boundaries": {
    "always": ["run_tests_before_commit"],
    "ask_first": ["schema_changes"],
    "never": ["commit_secrets"]
  }
}
```

## Usage Guidance

- Start strict, relax intentionally.
- Log justified exceptions to ADL.
- Revisit boundaries based on recurring violations.

*Boundary System*
