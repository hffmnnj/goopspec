# Git Workflow

Professional, atomic commits with universal language.

## Commit Rules

- Format: `type(scope): concise title` (<=72 chars).
- Body explains why and impact.
- One logical change per commit.
- Never reference internal phase/wave/task IDs or internal docs.

## Types

`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`

## Commit Template

```text
type(scope): concise title

[2-4 sentences explaining context and motivation.]

Changes:
- specific change with context
- specific change with impact
```

## Branch Naming

`type/short-description` (kebab-case), e.g. `feat/auth-oauth`.

## Pre-Commit Checklist

- tests pass
- type/lint checks pass
- no debug code
- no secrets staged
- message is specific and universal

## PR Guidelines

- Title: `type(scope): descriptive summary`
- Body sections: Summary, Changes, Testing, Notes
- No internal terminology in title/body

## Safety

Never:
- force push protected branches without explicit request
- commit secrets or `.env`
- skip hooks/signing without explicit request
- create empty commits

Always:
- review staged diff
- keep commits buildable

*Git Workflow Reference v1.0*
