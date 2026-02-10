# XML Response Schema

All GoopSpec agents use a standardized XML envelope for machine-parseable handoffs while keeping content human-readable in Markdown.

## Why XML + Markdown Hybrid?

1. **Machine Parsing**: Orchestrator can reliably extract status, next actions, and state
2. **Human Readability**: Markdown inside XML remains easy to read
3. **Structured Handoffs**: Clean session boundaries with explicit next steps
4. **State Continuity**: Exact phase/wave/task tracking across sessions

## Response Envelope Structure

Every agent response MUST include this XML block at the END of their response:

```xml
<goop_report version="0.2.6">
  <status>COMPLETE|PARTIAL|BLOCKED|CHECKPOINT</status>
  <agent>goop-[type]</agent>
  <task_id>W[wave].T[task]</task_id>
  <task_name>Brief task description</task_name>
  
  <state>
    <phase>plan|specify|execute|accept|research</phase>
    <wave current="N" total="M"/>
    <task current="X" total="Y"/>
    <spec_locked>true|false</spec_locked>
    <interview_complete>true|false</interview_complete>
  </state>
  
  <summary>1-2 sentence summary of what was accomplished</summary>
  
  <artifacts>
    <files>
      <file path="path/to/file" action="created|modified|deleted">
        Brief description of change
      </file>
    </files>
    <commits>
      <commit sha="abc1234">type(scope): commit message</commit>
    </commits>
  </artifacts>
  
  <memory>
    <saved type="decision|observation|note" importance="0.8">
      Title of memory saved
    </saved>
  </memory>
  
  <verification>
    <check name="tests" passed="true|false">bun test - 42 passed</check>
    <check name="typecheck" passed="true|false">No errors</check>
    <check name="manual" passed="true|false">Description</check>
  </verification>
  
  <handoff>
    <ready>true|false</ready>
    <next_action agent="goop-[type]">
      Exact description of next task
    </next_action>
    <files_to_read>
      <file>.goopspec/SPEC.md</file>
      <file>.goopspec/BLUEPRINT.md</file>
    </files_to_read>
    <blockers>None | Description of blocker</blockers>
    <suggest_new_session>true|false</suggest_new_session>
    <next_command>/goop-[command]</next_command>
  </handoff>
</goop_report>
```

## Status Values

| Status | When to Use | Orchestrator Action |
|--------|-------------|---------------------|
| `COMPLETE` | Task fully finished, verified | Move to next task |
| `PARTIAL` | Some progress, need to continue | Resume same task |
| `BLOCKED` | Cannot proceed without input | Assess blocker, may need user |
| `CHECKPOINT` | Natural stopping point | Save state, may suggest new session |

## Required vs Optional Elements

### Always Required
- `<status>` - Current completion status
- `<agent>` - Which agent is responding
- `<state>` - Current workflow state
- `<summary>` - What was accomplished
- `<handoff>` - Next steps

### Required When Applicable
- `<artifacts>` - When files changed or commits made
- `<memory>` - When memory was persisted
- `<verification>` - When verification commands were run

### Optional
- `<task_id>` - May not exist in research/explore phases
- `<blockers>` - Only when blocked

## Examples by Agent Type

### Executor Response
```xml
<goop_report version="0.2.6">
  <status>COMPLETE</status>
  <agent>goop-executor-high</agent>
  <task_id>W2.T3</task_id>
  <task_name>Implement user authentication</task_name>
  
  <state>
    <phase>execute</phase>
    <wave current="2" total="3"/>
    <task current="3" total="4"/>
    <spec_locked>true</spec_locked>
  </state>
  
  <summary>Implemented JWT-based authentication with login/logout endpoints and middleware.</summary>
  
  <artifacts>
    <files>
      <file path="src/auth/service.ts" action="created">Auth service with JWT generation</file>
      <file path="src/auth/middleware.ts" action="created">Auth middleware for protected routes</file>
      <file path="src/auth/types.ts" action="created">Auth type definitions</file>
    </files>
    <commits>
      <commit sha="a1b2c3d">feat(auth): implement JWT authentication service</commit>
    </commits>
  </artifacts>
  
  <memory>
    <saved type="decision" importance="0.8">Used jose library for JWT over jsonwebtoken</saved>
  </memory>
  
  <verification>
    <check name="tests" passed="true">bun test src/auth/ - 12 passed</check>
    <check name="typecheck" passed="true">No errors</check>
  </verification>
  
  <handoff>
    <ready>true</ready>
    <next_action agent="goop-executor-medium">W2.T4: Implement session management</next_action>
    <files_to_read>
      <file>src/auth/service.ts</file>
    </files_to_read>
    <blockers>None</blockers>
    <suggest_new_session>false</suggest_new_session>
  </handoff>
</goop_report>
```

### Planner Response
```xml
<goop_report version="0.2.6">
  <status>COMPLETE</status>
  <agent>goop-planner</agent>
  <task_name>Create execution blueprint</task_name>
  
  <state>
    <phase>plan</phase>
    <spec_locked>false</spec_locked>
    <interview_complete>true</interview_complete>
  </state>
  
  <summary>Created 3-wave blueprint with 8 tasks covering all must-haves from SPEC.md.</summary>
  
  <artifacts>
    <files>
      <file path=".goopspec/BLUEPRINT.md" action="created">Execution blueprint</file>
      <file path=".goopspec/SPEC.md" action="modified">Added traceability mapping</file>
    </files>
  </artifacts>
  
  <memory>
    <saved type="decision" importance="0.7">Wave 1 foundation parallel, Wave 2-3 sequential</saved>
  </memory>
  
  <handoff>
    <ready>true</ready>
    <next_action agent="orchestrator">Review blueprint with user, confirm lock in /goop-plan, then /goop-execute</next_action>
    <files_to_read>
      <file>.goopspec/BLUEPRINT.md</file>
    </files_to_read>
    <blockers>None</blockers>
    <suggest_new_session>true</suggest_new_session>
    <next_command>/goop-execute</next_command>
  </handoff>
</goop_report>
```

### Blocked Response
```xml
<goop_report version="0.2.6">
  <status>BLOCKED</status>
  <agent>goop-executor-high</agent>
  <task_id>W2.T2</task_id>
  <task_name>Implement payment integration</task_name>
  
  <state>
    <phase>execute</phase>
    <wave current="2" total="3"/>
    <task current="2" total="4"/>
    <spec_locked>true</spec_locked>
  </state>
  
  <summary>Cannot proceed - architectural decision required about payment provider.</summary>
  
  <handoff>
    <ready>false</ready>
    <blockers>
      RULE 4 DEVIATION: Need user decision on payment provider.
      Options: A) Stripe (recommended, better docs), B) PayPal (wider reach)
    </blockers>
    <suggest_new_session>false</suggest_new_session>
  </handoff>
</goop_report>
```

## Parsing Guidelines for Orchestrator

1. **Extract status first** - Determines routing logic
2. **Check blockers** - If blocked, present to user
3. **Update CHRONICLE.md** - From artifacts and state
4. **Route next action** - Based on handoff.next_action
5. **Session boundary** - If suggest_new_session=true, generate HANDOFF.md

## Validation Rules

- Status must be one of: COMPLETE, PARTIAL, BLOCKED, CHECKPOINT
- Agent must match the subagent_type that was invoked
- State.phase must match current workflow phase
- If COMPLETE, verification should have at least one check
- If BLOCKED, blockers must be non-empty
- handoff.next_action must specify which agent continues

---

*GoopSpec XML Response Schema v0.2.6*
