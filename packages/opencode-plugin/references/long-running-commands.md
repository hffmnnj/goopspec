# Long-Running Commands

Run dev servers, watch-mode test runners, build watchers, and slow suites inside detached tmux sessions so they survive the blocking `bash` tool's timeout.

## Important: Shell State Does Not Persist Between Tool Calls

Each `bash` tool call runs in a fresh shell. `$$`, `$PWD`, and any shell variables are gone on the next call. Session names and file paths must be **deterministic** so a later tool call can find them. If you need per-run uniqueness, write the chosen name to a stable file such as `/tmp/goopspec-runs/current-session` and read it back on the next call. Prefer absolute paths; the working directory resets to the project root each call.

## When to Use tmux vs. Blocking `bash`

| Use blocking `bash` | Use a detached tmux session |
|---------------------|-----------------------------|
| The command self-terminates in well under the ~2-minute OpenCode ceiling. | The command never exits on its own. |
| You need the exit code on the next line of the same tool call. | Output must be inspected while you continue working. |
| No mid-run interaction is required. | The run may exceed the timeout or you need to poll progress. |

**Default rule:** start with blocking `bash` for short, self-terminating commands. Escalate to tmux only when duration, non-termination, or mid-run observation demands it. All six executor tiers have the `bash` tool; the orchestrator does not.

## Core Lifecycle

The verified command forms use tmux 3.7b flags. Do not substitute other flags.

### Start a detached session

```bash
S=gsrun-build; tmux new-session -d -s "$S" 'bun test --watch'
```

### Check liveness

```bash
S=gsrun-build; tmux has-session -t "$S" && echo alive || echo dead
```

### Capture recent pane output

```bash
S=gsrun-build; tmux capture-pane -p -t "$S"
```

Capture the full scrollback, including blank-prefixed lines, with:

```bash
S=gsrun-build; tmux capture-pane -p -S - -t "$S"
```

### Kill the session

```bash
S=gsrun-build; tmux kill-session -t "$S"
```

## Critical: tmux Destroys the Session When the Pane Command Exits

The moment the command running in a tmux pane exits, tmux destroys the session by default. A post-exit `capture-pane` recovers nothing. To preserve output and exit status, either redirect to a log file or keep the pane alive.

## Pattern A — Sentinel Exit-Status File (Primary)

Run the command in a subshell that writes both output and a sentinel file, then poll for the sentinel and read its value.

```bash
S=gsrun-build
mkdir -p /tmp/goopspec-runs
TMUX_CMD='bun run --cwd packages/opencode-plugin build'
tmux new-session -d -s "$S" \
  "sh -c '$TMUX_CMD > /tmp/goopspec-runs/log-$S 2>&1; printf %s \$? > /tmp/goopspec-runs/exit-$S'"
```

Bounded poll across tool calls:

```bash
S=gsrun-build
for i in 1 2 3 4 5; do
  if [ -f "/tmp/goopspec-runs/exit-$S" ]; then
    echo "exit=$(cat /tmp/goopspec-runs/exit-$S)"
    break
  fi
  echo "waiting..."; sleep 10
done
```

Read the captured log regardless of exit status:

```bash
S=gsrun-build; cat "/tmp/goopspec-runs/log-$S" | tail -n 80
```

This pattern is portable, works with any command, and does not depend on tmux keeping the pane open.

## Pattern B — `remain-on-exit` Plus `#{pane_dead_status}` (Alternative)

Inside the pane, enable `remain-on-exit` before the command runs, then query the pane's dead status.

```bash
S=gsrun-test
tmux new-session -d -s "$S" \
  'tmux set -p remain-on-exit on; bun test packages/opencode-plugin/'
```

Check whether the pane has died and what exit status it recorded:

```bash
S=gsrun-test; tmux display-message -p -t "$S" '#{pane_dead_status}'
```

The value is empty while the command runs, `0` on success, or another number on failure. Always set `remain-on-exit` from inside the pane, not as a chained `\; set -p` on the same `new-session` command; the chained form races the pane's startup and is unreliable.

## Readiness Detection and Bounded Polling

Never wait unbounded in a single `bash` tool call. Use short, explicit polls and resume on the next tool call if the process is not ready.

```bash
S=gsrun-server
for i in $(seq 1 6); do
  if tmux capture-pane -p -t "$S" | grep -q 'ready'; then
    echo ready; break
  fi
  sleep 5
done
```

If the loop exhausts its budget, continue other work and poll again later. This keeps each tool call under the ~2-minute ceiling and lets the orchestration layer manage turns.

## Naming and Cleanup

Use a project-scoped prefix so parallel agents and concurrent runs do not collide.

```bash
PREFIX=gsrun-
S="${PREFIX}watch"
```

Cleanup must be scoped to your own prefix. Never run `tmux kill-server`; it terminates every tmux session on the host, including sessions owned by the user or other agents.

Prefix-scoped cleanup example:

```bash
PREFIX=gsrun-
tmux list-sessions -F '#{session_name}' | grep "^$PREFIX" | \
  while read -r name; do tmux kill-session -t "$name"; done
rm -f /tmp/goopspec-runs/log-${PREFIX}* /tmp/goopspec-runs/exit-${PREFIX}*
rmdir /tmp/goopspec-runs 2>/dev/null || true
```

**Mandatory teardown:** kill your sessions and remove your sentinel files as the final step of the task, even on error paths. If a task is interrupted, include cleanup in the next turn before resuming work.

### Surviving Children

A `setsid` daemon, a double-forked service, or a child that escapes the session's process group may survive `tmux kill-session`. If you start such a process, track its PID and kill it explicitly:

```bash
S=gsrun-dev
LOG="/tmp/goopspec-runs/dev-$S.log"
PID="/tmp/goopspec-runs/pid-$S"
mkdir -p /tmp/goopspec-runs
setsid sh -c "bun run --cwd packages/opencode-plugin dev > $LOG 2>&1" &
echo $! > "$PID"
```

Then terminate with the exact PID:

```bash
kill "$(cat /tmp/goopspec-runs/pid-$S)" 2>/dev/null || true
```

Never use `pkill -f 'pattern'` — the pattern can match the agent's own shell command and kill its own process.

## Graceful Degradation When tmux Is Absent

Check for tmux before using it. Do not add tmux as a package dependency; it is an environment capability.

```bash
if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not available; falling back to setsid + PID file"
fi
```

Fallback using `setsid`, a PID file, and redirected output:

```bash
S=gsrun-watch
LOG="/tmp/goopspec-runs/log-$S"
PID="/tmp/goopspec-runs/pid-$S"
mkdir -p /tmp/goopspec-runs
setsid sh -c "bun test --watch > $LOG 2>&1" &
echo $! > "$PID"
```

Poll the log and terminate with the recorded PID when done:

```bash
kill "$(cat "$PID")" 2>/dev/null || true
rm -f "$LOG" "$PID"
```

This fallback lacks tmux's pane capture but satisfies the same core requirement: the command outlives any single tool call without blocking it.

## Anti-Patterns

- **Forgetting `-d`.** `tmux new-session` without `-d` attaches interactively and hangs the `bash` tool call forever. Always use `-d`.
- **Using `$$` or other shell variables as session names.** Every `bash` tool call runs in a fresh shell, so `$$`-derived names change between calls and cannot be recovered. Use deterministic names like `gsrun-build`.
- **`tmux wait-for CHANNEL` without `-S`.** `wait-for` waits for a signal that may never arrive. If you use it, wrap it in `timeout` and treat timeout as a resumable condition.
- **Chaining `\; set -p remain-on-exit on`.** The set command can run before the pane exists, silently failing. Set `remain-on-exit` from inside the pane command instead.
- **`pkill -f 'pattern'`.** It matches the agent's own command line. Kill by exact PID recorded at start.
- **`tmux kill-server`.** This is nuclear. It kills every tmux session on the machine, not just yours.
- **Assuming `capture-pane -S -` is infinite.** It is bounded by the tmux `history-limit` setting; very large logs still truncate at the top.
- **Trusting `capture-pane` formatting.** tmux pads trailing blank lines; compare output against the log file for canonical content.
- **Unbounded polling loops.** A `while true; do sleep 5; done` loop will hit the tool timeout and waste a turn. Always cap the iteration count and sleep budget.

---

*Long-Running Commands v1.0 — GoopSpec Reference*
