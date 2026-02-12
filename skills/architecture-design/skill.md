---
name: architecture-design
description: Design system architecture and make structural decisions
category: core
triggers:
  - architecture
  - design
  - structure
  - system
version: 0.2.6
requires:
  - goop-core
---

# Architecture Design Skill

## Design Principles

### 1. Separation of Concerns
Each module has a single, well-defined responsibility.

### 2. Dependency Inversion
Depend on abstractions, not concretions.

### 3. Interface Segregation
Many specific interfaces over one general-purpose interface.

### 4. Open/Closed
Open for extension, closed for modification.

### 5. Single Source of Truth
Each piece of data has exactly one authoritative source.

## Architecture Patterns

### Layered Architecture

```
┌─────────────────────────────┐
│      Presentation Layer     │
├─────────────────────────────┤
│      Application Layer      │
├─────────────────────────────┤
│       Domain Layer          │
├─────────────────────────────┤
│    Infrastructure Layer     │
└─────────────────────────────┘
```

### Clean Architecture

```
┌─────────────────────────────────────┐
│            Frameworks               │
│  ┌─────────────────────────────┐   │
│  │      Interface Adapters      │   │
│  │  ┌─────────────────────┐    │   │
│  │  │    Use Cases        │    │   │
│  │  │  ┌─────────────┐    │    │   │
│  │  │  │  Entities   │    │    │   │
│  │  │  └─────────────┘    │    │   │
│  │  └─────────────────────┘    │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Hexagonal (Ports & Adapters)

```
         ┌─────────────┐
    ┌────┤   Adapter   ├────┐
    │    └─────────────┘    │
    │                       │
┌───┴───┐   ┌───────┐   ┌───┴───┐
│ Port  │───│ Core  │───│ Port  │
└───┬───┘   └───────┘   └───┬───┘
    │                       │
    │    ┌─────────────┐    │
    └────┤   Adapter   ├────┘
         └─────────────┘
```

## Decision Framework

### When Making Architecture Decisions

1. **Identify the problem** - What specific issue needs solving?
2. **List constraints** - Budget, time, team skills, scale requirements
3. **Consider options** - At least 3 viable approaches
4. **Evaluate tradeoffs** - Pros/cons of each option
5. **Document decision** - Record in ADL with rationale

## Technology Evaluation Framework

Use this when comparing frameworks, platforms, or core stack choices.

### Rubric (Score 1-5)

| Criterion | What to Evaluate |
|-----------|------------------|
| Fit | Requirement alignment, domain constraints, team familiarity |
| Complexity | Build/run/debug complexity and operational overhead |
| Scalability | Headroom for traffic, data growth, and team scaling |
| Risk | Security, delivery, lock-in, and migration exposure |
| Maintainability | Testability, readability, upgrade cadence, hiring impact |

### Recommendation Output Pattern

1. Present 2-4 realistic alternatives.
2. Show rubric scores and one-line rationale per criterion.
3. Recommend one option with explicit context-based reasoning.
4. State when that option is not appropriate.
5. Name a fallback option if core assumptions change.

### Neutrality Guardrails

- Start from constraints, not preferred tools.
- Avoid single-framework bias; include a credible alternative.
- Make assumptions explicit when context is incomplete.
- Tie final choice to measurable outcomes (delivery speed, reliability, cost, risk).

### Decision Template

```markdown
### AD-XXX: {Decision Title}

**Context:** {What situation prompted this decision?}

**Options Considered:**
1. {Option A} - {Brief description}
2. {Option B} - {Brief description}
3. {Option C} - {Brief description}

**Decision:** {Which option was chosen}

**Rationale:** {Why this option?}

**Consequences:**
- {Positive consequence}
- {Negative consequence/tradeoff}

**Related:** {Links to related decisions}
```

## Common Patterns

### Repository Pattern
Abstracts data access behind a collection-like interface.

### Service Layer
Coordinates application operations and transactions.

### Factory Pattern
Encapsulates object creation logic.

### Observer Pattern
Defines one-to-many dependency for state changes.

### Strategy Pattern
Defines family of interchangeable algorithms.

## Project Structure

### Feature-Based (Recommended)
```
src/
├── features/
│   ├── auth/
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   └── auth.test.ts
│   └── users/
│       ├── create-user.ts
│       └── users.test.ts
├── shared/
│   ├── database/
│   └── utils/
└── index.ts
```

### Layer-Based
```
src/
├── controllers/
├── services/
├── repositories/
├── models/
└── utils/
```

## Best Practices

1. **Document decisions** - Every architectural choice in ADL
2. **Start simple** - Add complexity only when needed
3. **Defer decisions** - Make reversible choices when uncertain
4. **Vertical slices** - Complete features over horizontal layers
5. **Test boundaries** - Focus tests on public interfaces
