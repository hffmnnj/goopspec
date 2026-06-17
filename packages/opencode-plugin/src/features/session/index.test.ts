import { beforeEach, describe, expect, it } from "bun:test";

import type { SessionEvent, SessionManager } from "./index.js";
import { createSessionManager } from "./index.js";

describe("SessionManager", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = createSessionManager();
  });

  // =========================================================================
  // create
  // =========================================================================

  describe("create", () => {
    it("creates a session with the given id", () => {
      const record = mgr.create("sess-1");
      expect(record.info.id).toBe("sess-1");
      expect(record.info.startedAt).toBeTruthy();
      expect(record.meta.lastActivity).toBeGreaterThan(0);
      expect(record.meta.idleSince).toBeNull();
    });

    it("returns existing session if id already exists", () => {
      const first = mgr.create("sess-1", { agent: "agent-a" });
      const second = mgr.create("sess-1", { agent: "agent-b" });
      expect(first).toBe(second);
      expect(first.meta.agent).toBe("agent-a");
    });

    it("binds to workflow on creation when provided", () => {
      mgr.create("sess-1", { workflowId: "wf-alpha" });
      expect(mgr.getWorkflowId("sess-1")).toBe("wf-alpha");
    });

    it("sets agent metadata", () => {
      const record = mgr.create("sess-1", { agent: "goop-executor-high" });
      expect(record.info.agent).toBe("goop-executor-high");
      expect(record.meta.agent).toBe("goop-executor-high");
    });

    it("fires 'created' event", () => {
      const events: SessionEvent[] = [];
      mgr.on((event) => {
        events.push(event);
      });
      mgr.create("sess-1");
      expect(events).toEqual(["created"]);
    });
  });

  // =========================================================================
  // get / list / size
  // =========================================================================

  describe("get / list / size", () => {
    it("returns undefined for unknown session", () => {
      expect(mgr.get("nonexistent")).toBeUndefined();
    });

    it("lists all sessions", () => {
      mgr.create("a");
      mgr.create("b");
      mgr.create("c");
      expect(mgr.list()).toHaveLength(3);
      expect(mgr.size()).toBe(3);
    });

    it("list returns empty array when no sessions", () => {
      expect(mgr.list()).toEqual([]);
      expect(mgr.size()).toBe(0);
    });
  });

  // =========================================================================
  // workflow binding
  // =========================================================================

  describe("workflow binding", () => {
    it("binds a session to a workflow", () => {
      mgr.create("sess-1");
      mgr.bindToWorkflow("sess-1", "wf-beta");
      expect(mgr.getWorkflowId("sess-1")).toBe("wf-beta");
    });

    it("rebinds a session to a different workflow", () => {
      mgr.create("sess-1", { workflowId: "wf-alpha" });
      mgr.bindToWorkflow("sess-1", "wf-beta");
      expect(mgr.getWorkflowId("sess-1")).toBe("wf-beta");
    });

    it("throws when binding a nonexistent session", () => {
      expect(() => mgr.bindToWorkflow("ghost", "wf-1")).toThrow('Session "ghost" not found');
    });

    it("returns undefined workflow for unbound session", () => {
      mgr.create("sess-1");
      expect(mgr.getWorkflowId("sess-1")).toBeUndefined();
    });

    it("finds sessions by workflow", () => {
      mgr.create("s1", { workflowId: "wf-1" });
      mgr.create("s2", { workflowId: "wf-2" });
      mgr.create("s3", { workflowId: "wf-1" });

      const found = mgr.findByWorkflow("wf-1");
      expect(found).toHaveLength(2);
      expect(found.map((r) => r.info.id).sort()).toEqual(["s1", "s3"]);
    });

    it("returns empty array for workflow with no sessions", () => {
      expect(mgr.findByWorkflow("wf-none")).toEqual([]);
    });
  });

  // =========================================================================
  // touch / idle
  // =========================================================================

  describe("touch / idle", () => {
    it("updates lastActivity on touch", () => {
      const record = mgr.create("sess-1");
      const before = record.meta.lastActivity;

      // touch uses Date.now() internally
      mgr.touch("sess-1");
      expect(record.meta.lastActivity).toBeGreaterThanOrEqual(before);
    });

    it("clears idleSince on touch", () => {
      mgr.create("sess-1");
      mgr.markIdle("sess-1");
      expect(mgr.get("sess-1")?.meta.idleSince).not.toBeNull();

      mgr.touch("sess-1");
      expect(mgr.get("sess-1")?.meta.idleSince).toBeNull();
    });

    it("throws when touching nonexistent session", () => {
      expect(() => mgr.touch("ghost")).toThrow('Session "ghost" not found');
    });

    it("marks session as idle and fires event", () => {
      const events: SessionEvent[] = [];
      mgr.on((event) => {
        events.push(event);
      });
      mgr.create("sess-1");
      mgr.markIdle("sess-1");

      expect(mgr.get("sess-1")?.meta.idleSince).not.toBeNull();
      expect(events).toContain("idle");
    });

    it("does not fire idle event twice", () => {
      const events: SessionEvent[] = [];
      mgr.on((event) => {
        events.push(event);
      });
      mgr.create("sess-1");
      mgr.markIdle("sess-1");
      mgr.markIdle("sess-1");

      const idleEvents = events.filter((e) => e === "idle");
      expect(idleEvents).toHaveLength(1);
    });

    it("throws when marking nonexistent session idle", () => {
      expect(() => mgr.markIdle("ghost")).toThrow('Session "ghost" not found');
    });
  });

  // =========================================================================
  // delete / clear
  // =========================================================================

  describe("delete / clear", () => {
    it("removes a session", () => {
      mgr.create("sess-1");
      mgr.delete("sess-1");
      expect(mgr.get("sess-1")).toBeUndefined();
      expect(mgr.size()).toBe(0);
    });

    it("fires 'deleted' event", () => {
      const events: SessionEvent[] = [];
      mgr.on((event) => {
        events.push(event);
      });
      mgr.create("sess-1");
      mgr.delete("sess-1");
      expect(events).toContain("deleted");
    });

    it("is a no-op for nonexistent session", () => {
      mgr.delete("ghost"); // should not throw
      expect(mgr.size()).toBe(0);
    });

    it("clears all sessions and fires events", () => {
      const deletedIds: string[] = [];
      mgr.on((event, record) => {
        if (event === "deleted") deletedIds.push(record.info.id);
      });

      mgr.create("a");
      mgr.create("b");
      mgr.create("c");
      mgr.clear();

      expect(mgr.size()).toBe(0);
      expect(deletedIds.sort()).toEqual(["a", "b", "c"]);
    });
  });

  // =========================================================================
  // resolveForWorkflow
  // =========================================================================

  describe("resolveForWorkflow", () => {
    it("returns the single session bound to a workflow", () => {
      mgr.create("sess-1", { workflowId: "wf-1" });
      mgr.create("sess-2", { workflowId: "wf-2" });

      const resolved = mgr.resolveForWorkflow("wf-1");
      expect(resolved?.info.id).toBe("sess-1");
    });

    it("returns the most recently active session when multiple are bound", () => {
      const s1 = mgr.create("sess-1", { workflowId: "wf-1" });
      const s2 = mgr.create("sess-2", { workflowId: "wf-1" });

      // Make sess-1 more recent
      s1.meta.lastActivity = Date.now() + 1000;
      s2.meta.lastActivity = Date.now() - 1000;

      const resolved = mgr.resolveForWorkflow("wf-1");
      expect(resolved?.info.id).toBe("sess-1");
    });

    it("falls back to the only session when none are bound to the workflow", () => {
      mgr.create("only-one");
      const resolved = mgr.resolveForWorkflow("wf-any");
      expect(resolved?.info.id).toBe("only-one");
    });

    it("returns undefined when multiple unbound sessions exist", () => {
      mgr.create("a");
      mgr.create("b");
      const resolved = mgr.resolveForWorkflow("wf-any");
      expect(resolved).toBeUndefined();
    });

    it("returns undefined when no sessions exist", () => {
      expect(mgr.resolveForWorkflow("wf-1")).toBeUndefined();
    });

    it("does not fall back when bound sessions exist for other workflows", () => {
      mgr.create("s1", { workflowId: "wf-other" });
      mgr.create("s2", { workflowId: "wf-other" });
      const resolved = mgr.resolveForWorkflow("wf-target");
      expect(resolved).toBeUndefined();
    });
  });

  // =========================================================================
  // event listeners
  // =========================================================================

  describe("event listeners", () => {
    it("supports multiple listeners", () => {
      const events1: SessionEvent[] = [];
      const events2: SessionEvent[] = [];

      mgr.on((event) => {
        events1.push(event);
      });
      mgr.on((event) => {
        events2.push(event);
      });

      mgr.create("sess-1");
      expect(events1).toEqual(["created"]);
      expect(events2).toEqual(["created"]);
    });

    it("unsubscribe removes the listener", () => {
      const events: SessionEvent[] = [];
      const unsub = mgr.on((event) => {
        events.push(event);
      });

      mgr.create("sess-1");
      expect(events).toHaveLength(1);

      unsub();
      mgr.create("sess-2");
      expect(events).toHaveLength(1); // no new event
    });

    it("swallows listener errors without crashing", () => {
      mgr.on(() => {
        throw new Error("listener boom");
      });

      // Should not throw
      expect(() => mgr.create("sess-1")).not.toThrow();
      expect(mgr.size()).toBe(1);
    });

    it("handles async listeners without blocking", () => {
      mgr.on(async () => {
        await new Promise<void>((r) => setTimeout(r, 10));
      });

      mgr.create("sess-1");
      // The create call returns synchronously; async listener runs in background
      expect(mgr.size()).toBe(1);
    });
  });

  // =========================================================================
  // custom idle threshold
  // =========================================================================

  describe("options", () => {
    it("accepts custom idle threshold", () => {
      const custom = createSessionManager({ idleThresholdMs: 1000 });
      // Just verify it creates without error — threshold is used by
      // external idle-detection logic, not internally by the manager.
      const record = custom.create("sess-1");
      expect(record.info.id).toBe("sess-1");
    });
  });
});
