---
name: daemon-context
description: Understanding and using the GoopSpec daemon for multi-project orchestration
category: daemon
triggers:
  - daemon
  - projects
  - work items
  - workflow sessions
version: 0.1.0
---

# GoopSpec Daemon Context

## What is the GoopSpec Daemon?

The GoopSpec daemon is a long-running local process that provides:

- **Multi-project tracking** — Register and monitor multiple GoopSpec projects from a single dashboard.
- **Work item management** — Track features, bugs, and chores with priorities and statuses.
- **Workflow session visibility** — See active, paused, and completed workflow sessions across all projects.
- **Real-time updates** — WebSocket/SSE transport for live status in the web panel.

The daemon runs on `http://localhost:7331` by default and stores data in a local SQLite database. It is local-first, single-user, and requires no authentication.

## Available Daemon Tools

### `goop_daemon_status`

Check whether the daemon is running and view its health.

```
goop_daemon_status()
```

Returns: daemon status, version, uptime, project count, active workflow count.
If the daemon is not running, returns a helpful message with start instructions.

### `goop_daemon_projects`

Manage projects registered with the daemon.

```
goop_daemon_projects({ action: "list" })
goop_daemon_projects({ action: "register", name: "my-app", path: "/path/to/project" })
goop_daemon_projects({ action: "deregister", id: "proj-abc123" })
```

- **list** — Show all registered projects.
- **register** — Register the current project (or a specific path) with the daemon. Uses the project name from state if not provided.
- **deregister** — Remove a project by its ID.

### `goop_daemon_workflow`

Query workflow sessions tracked by the daemon.

```
goop_daemon_workflow({ action: "status" })
goop_daemon_workflow({ action: "history", projectId: "proj-abc123" })
goop_daemon_workflow({ action: "get", sessionId: "sess-xyz789" })
```

- **status** — Show currently active (running/pending) workflow sessions.
- **history** — List all workflow sessions, optionally filtered by project.
- **get** — Get detailed information about a specific session.

### `goop_daemon_items`

Manage work items (features, bugs, chores) for a project.

```
goop_daemon_items({ action: "list", projectId: "proj-abc123" })
goop_daemon_items({ action: "get", projectId: "proj-abc123", itemId: "item-1" })
goop_daemon_items({ action: "create", projectId: "proj-abc123", title: "Add OAuth", type: "feature", priority: "high" })
goop_daemon_items({ action: "update", projectId: "proj-abc123", itemId: "item-1", status: "done" })
```

- **list** — Show all work items for a project.
- **get** — Get detailed information about a specific item.
- **create** — Create a new work item with title, type, priority, tags, etc.
- **update** — Update an existing item's status, priority, or other fields.

## Graceful Degradation

All daemon tools are **always registered** regardless of whether the daemon is running. When the daemon is unavailable:

- Tools return a clear message: "GoopSpec Daemon is not running. Start it with: `bun run daemon`"
- No errors are thrown to the agent
- The plugin continues to function normally for all non-daemon operations

## Common Workflows

### First-time setup

1. Start the daemon: `bun run daemon`
2. Check status: `goop_daemon_status()`
3. Register your project: `goop_daemon_projects({ action: "register" })`

### Tracking work

1. Create work items: `goop_daemon_items({ action: "create", projectId: "...", title: "...", type: "feature" })`
2. Update status as work progresses: `goop_daemon_items({ action: "update", ..., status: "in_progress" })`
3. View active workflows: `goop_daemon_workflow({ action: "status" })`

### Multi-project overview

1. List all projects: `goop_daemon_projects({ action: "list" })`
2. View workflow history: `goop_daemon_workflow({ action: "history" })`
3. Check specific session: `goop_daemon_workflow({ action: "get", sessionId: "..." })`

## Architecture Notes

- The daemon exposes a REST API consumed by both the plugin tools and the web panel.
- Data is persisted in SQLite — no external database required.
- The daemon is optional — the plugin works fully without it.
- Communication uses the shared `DaemonClient` class with 5-second request timeouts.
