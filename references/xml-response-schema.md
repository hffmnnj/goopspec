# XML Response Schema

Canonical response schema for all GoopSpec agents.

## Required Envelope

```xml
<goop_report>
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

  <summary>1-2 sentence outcome summary</summary>

  <artifacts>
    <files>
      <file path="path/to/file" action="created|modified|deleted">Change description</file>
    </files>
    <commits>
      <commit sha="abc1234">type(scope): commit message</commit>
    </commits>
  </artifacts>

  <memory>
    <saved type="decision|observation|note" importance="0.8">Memory title</saved>
  </memory>

  <verification>
    <check name="tests" passed="true|false">bun test - result</check>
    <check name="typecheck" passed="true|false">result</check>
    <check name="manual" passed="true|false">result</check>
  </verification>

  <handoff>
    <ready>true|false</ready>
    <next_action agent="goop-[type]">Exact next task</next_action>
    <files_to_read>
      <file>.goopspec/SPEC.md</file>
      <file>.goopspec/BLUEPRINT.md</file>
    </files_to_read>
    <blockers>None | blocker description</blockers>
    <suggest_new_session>true|false</suggest_new_session>
    <next_command>/goop-[command]</next_command>
  </handoff>
</goop_report>
```

## Validation Rules

- `status` must be one of: `COMPLETE`, `PARTIAL`, `BLOCKED`, `CHECKPOINT`.
- XML block must be the final response block.
- `BLOCKED` requires non-empty `<blockers>`.
- `PARTIAL` requires exact resume point in `handoff.next_action` (include `file:line`).
- `COMPLETE` should include verification checks.
- `state.phase` must match workflow state.

## Minimum Allowed Envelope

```xml
<goop_report>
  <status>COMPLETE</status>
  <agent>goop-[type]</agent>
  <state>
    <phase>execute</phase>
    <spec_locked>true</spec_locked>
  </state>
  <summary>Task outcome.</summary>
  <handoff>
    <ready>true</ready>
    <next_action agent="goop-[type]">Next task</next_action>
  </handoff>
</goop_report>
```

*GoopSpec XML Response Schema*
