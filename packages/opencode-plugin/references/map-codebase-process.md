# Codebase Mapping Process

Detailed process for `/goop-map-codebase` - analyzing existing codebases for brownfield projects.

## Phase 1: Setup

### 1.1 Check for existing codebase map
```bash
[ -d .goopspec/codebase ] && echo "Codebase map already exists"
```

### 1.2 Initialize .goopspec if needed
```bash
mkdir -p .goopspec/codebase
```

### 1.3 Detect project type
```bash
# Check for common project indicators
[ -f package.json ] && echo "Node.js project"
[ -f requirements.txt ] && echo "Python project"
[ -f Cargo.toml ] && echo "Rust project"
[ -f go.mod ] && echo "Go project"
[ -f pom.xml ] && echo "Java/Maven project"
[ -f build.gradle ] && echo "Java/Gradle project"
ls -la
```

---

## Phase 2: Parallel Exploration

Spawn 7 parallel explore agents via `task` tool:

### Explorer 1: Stack Detection
```
Analyze the technology stack of this codebase.
- Programming languages
- Frameworks and libraries
- Build tools
- Database
- Testing frameworks
- Dev tools (linting, formatting, etc.)

Create .goopspec/codebase/STACK.md
```

### Explorer 2: Architecture Analysis
```
Analyze the architecture of this codebase.
- Overall pattern (MVC, layered, hexagonal, etc.)
- Component relationships
- Data flow
- Key abstractions
- Design patterns used

Create .goopspec/codebase/ARCHITECTURE.md
```

### Explorer 3: Structure Mapping
```
Map the directory and file structure.
- Top-level organization
- Module/package boundaries
- Where different types of code live
- Configuration locations
- Asset locations

Create .goopspec/codebase/STRUCTURE.md
```

### Explorer 4: Conventions Discovery
```
Identify code conventions and patterns.
- Naming conventions
- File organization
- Code style
- Import patterns
- Error handling patterns
- Documentation style

Create .goopspec/codebase/CONVENTIONS.md
```

### Explorer 5: Testing Analysis
```
Analyze the testing approach.
- Testing frameworks used
- Test organization
- Coverage patterns
- Test types (unit, integration, e2e)
- Testing gaps

Create .goopspec/codebase/TESTING.md
```

### Explorer 6: Integrations Inventory
```
Identify external integrations.
- APIs consumed
- Services used
- Third-party dependencies
- Environment requirements
- Secrets/configuration needed

Create .goopspec/codebase/INTEGRATIONS.md
```

### Explorer 7: Concerns & Debt
```
Identify issues, concerns, and tech debt.
- Code smells
- Security concerns
- Performance issues
- Outdated dependencies
- Known bugs or limitations
- Areas needing attention

Create .goopspec/codebase/CONCERNS.md
```

Wait for all explorers to complete.

---

## Phase 3: Synthesize Findings

Collect and organize findings from all 7 explorers:

1. Check for conflicts between explorers
2. Identify the most critical insights
3. Summarize for quick reference
4. Flag areas needing clarification

---

## Phase 4: Document Templates

### STACK.md Template
```markdown
# Technology Stack

**Analyzed:** [Date]
**Project Type:** [Detected type]

## Languages
- [Language] [version] - [Primary use]

## Frameworks & Libraries
### Core
- [Framework] [version] - [Purpose]

### Supporting
- [Library] [version] - [Purpose]

## Build & Dev Tools
- [Tool] - [Purpose]

## Database
- [Database] [version] - [Usage pattern]

## Testing
- [Framework] - [Test types]

## Key Dependencies
- Critical: [dep1, dep2]
- Utility: [dep3, dep4]

## Version Info
- Runtime: [version]
- Package manager: [npm/pip/cargo/etc]
```

### ARCHITECTURE.md Template
```markdown
# Architecture Overview

**Pattern:** [MVC/Layered/Hexagonal/etc]
**Complexity:** [Simple/Moderate/Complex]

## High-Level Structure
[Diagram or description of major components]

## Component Relationships

### [Component A]
- **Responsibility:** [What it does]
- **Depends on:** [Other components]
- **Used by:** [Other components]

## Data Flow
[Description of how data moves through the system]

## Key Abstractions
1. **[Abstraction]** - [Purpose and usage]

## Design Patterns
- **[Pattern]** - [Where used and why]

## Entry Points
- [Entry 1] - [Purpose]
```

### CONVENTIONS.md Template
```markdown
# Code Conventions

## Naming
- **Variables:** [convention]
- **Functions:** [convention]
- **Classes:** [convention]
- **Files:** [convention]

## Code Style
- **Indentation:** [spaces/tabs, count]
- **Line length:** [max]
- **Quotes:** [single/double]

## Organization
- **Imports:** [order and style]
- **Exports:** [pattern]

## Patterns
- **Error handling:** [pattern]
- **Async:** [pattern]
- **Null checking:** [pattern]

## Anti-Patterns Present
- [Anti-pattern] - [Where found]
```

### TESTING.md Template
```markdown
# Testing Approach

## Frameworks
- **[Framework]** - [Unit/Integration/E2E]

## Test Organization
- **Location:** [Where tests live]
- **Naming:** [Test file naming]
- **Structure:** [Describe/It blocks, etc.]

## Running Tests
[Command to run tests]

## Testing Gaps
- [Gap 1] - [Impact]
```

### INTEGRATIONS.md Template
```markdown
# External Integrations

## APIs Consumed
### [API Name]
- **Endpoint:** [URL]
- **Auth:** [Method]
- **Usage:** [How used]

## Services
### [Service Name]
- **Type:** [Database/Cache/Queue/etc]
- **Provider:** [AWS/Railway/etc]

## Environment Requirements
### Required Variables
VARIABLE_NAME=[description]

### Optional Variables
OPTIONAL_VAR=[description]
```

### CONCERNS.md Template
```markdown
# Known Issues & Concerns

## Code Smells
### [Concern 1]
- **Location:** [Files affected]
- **Issue:** [Description]
- **Impact:** [Severity]
- **Recommendation:** [What to do]

## Security Concerns
### [Security Issue]
- **Risk:** [Description]
- **Severity:** [Critical/High/Medium/Low]

## Tech Debt
### [Debt Item]
- **Description:** [What needs refactoring]
- **Effort:** [Estimated]
- **Priority:** [When to address]

## Recommended Priorities
1. **[Priority 1]** - [Why urgent]
```

---

## Phase 5: Completion

**Display completion:**

```
## 🔮 GoopSpec · Codebase Mapped

✨ 7 explorers analyzed your codebase

**Created in .goopspec/codebase/:**
- STACK.md
- ARCHITECTURE.md
- STRUCTURE.md
- CONVENTIONS.md
- TESTING.md
- INTEGRATIONS.md
- CONCERNS.md

---

### Next Step

**Initialize GoopSpec project** with brownfield context

→ `/goop-setup`

---

**Also available:**
- `cat .goopspec/codebase/CONCERNS.md` — Review issues first
- `cat .goopspec/codebase/ARCHITECTURE.md` — Understand structure
```

---

## When to Map

- Joining an existing project
- Before extending unfamiliar code
- When inheriting a codebase
- Before major refactoring

## What to Do with Concerns

- Review CONCERNS.md before planning
- Address critical security issues first
- Factor tech debt into phase planning
- Use as context for estimates

---

*Codebase Mapping Process v0.2.8*
