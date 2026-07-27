/**
 * Tests for the shared pending-compaction expiry helpers.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  createMockCompactionHandoff,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { PENDING_COMPACTION_TTL_MS } from "./constants.js";
import {
  describePendingCompaction,
  getLivePendingCompaction,
  isPendingCompactionExpired,
} from "./pending-compaction.js";
import type { PluginContext } from "./types.js";

describe("pending-compaction expiry helpers", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("pending-compaction");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  function queuePending(
    sessionID: string,
    status: "queued" | "in-flight",
    queuedAtMs: number,
  ): void {
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "test-provider", modelID: "test-model" },
      status,
      queuedAtMs,
    });
  }

  describe("isPendingCompactionExpired", () => {
    it("returns false exactly at the TTL boundary", () => {
      const nowMs = 1_000_000;
      const pending = {
        model: { providerID: "p", modelID: "m" },
        status: "queued" as const,
        queuedAtMs: nowMs - PENDING_COMPACTION_TTL_MS,
      };
      expect(isPendingCompactionExpired(pending, nowMs)).toBe(false);
    });

    it("returns true one millisecond past the TTL", () => {
      const nowMs = 1_000_000;
      const pending = {
        model: { providerID: "p", modelID: "m" },
        status: "queued" as const,
        queuedAtMs: nowMs - PENDING_COMPACTION_TTL_MS - 1,
      };
      expect(isPendingCompactionExpired(pending, nowMs)).toBe(true);
    });

    it("returns false one millisecond before the TTL", () => {
      const nowMs = 1_000_000;
      const pending = {
        model: { providerID: "p", modelID: "m" },
        status: "queued" as const,
        queuedAtMs: nowMs - PENDING_COMPACTION_TTL_MS + 1,
      };
      expect(isPendingCompactionExpired(pending, nowMs)).toBe(false);
    });

    it("treats in-flight and queued identically", () => {
      const nowMs = 1_000_000;
      const queuedAtMs = nowMs - PENDING_COMPACTION_TTL_MS - 1;

      expect(
        isPendingCompactionExpired(
          {
            model: { providerID: "p", modelID: "m" },
            status: "queued",
            queuedAtMs,
          },
          nowMs,
        ),
      ).toBe(true);
      expect(
        isPendingCompactionExpired(
          {
            model: { providerID: "p", modelID: "m" },
            status: "in-flight",
            queuedAtMs,
          },
          nowMs,
        ),
      ).toBe(true);
    });
  });

  describe("getLivePendingCompaction", () => {
    it("returns undefined for a missing entry without mutating maps", () => {
      expect(getLivePendingCompaction(ctx, "missing", 1_000_000)).toBeUndefined();
      expect(ctx.pendingCompactions.has("missing")).toBe(false);
      expect(ctx.compactionHandoff.has("missing")).toBe(false);
    });

    it("returns the entry when it is within the TTL", () => {
      const nowMs = 1_000_000;
      queuePending("session-a", "queued", nowMs - PENDING_COMPACTION_TTL_MS + 1);

      const live = getLivePendingCompaction(ctx, "session-a", nowMs);
      expect(live).toBeDefined();
      expect(live?.status).toBe("queued");
      expect(ctx.pendingCompactions.has("session-a")).toBe(true);
    });

    it("clears expired entries from both maps and returns undefined", () => {
      const nowMs = 1_000_000;
      queuePending("session-a", "queued", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      ctx.compactionHandoff.set("session-a", createMockCompactionHandoff("next step for a"));

      expect(getLivePendingCompaction(ctx, "session-a", nowMs)).toBeUndefined();
      expect(ctx.pendingCompactions.has("session-a")).toBe(false);
      expect(ctx.compactionHandoff.has("session-a")).toBe(false);
    });

    it("clears in-flight expired entries from both maps", () => {
      const nowMs = 1_000_000;
      queuePending("session-a", "in-flight", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      ctx.compactionHandoff.set("session-a", createMockCompactionHandoff("handoff for a"));

      expect(getLivePendingCompaction(ctx, "session-a", nowMs)).toBeUndefined();
      expect(ctx.pendingCompactions.has("session-a")).toBe(false);
      expect(ctx.compactionHandoff.has("session-a")).toBe(false);
    });

    it("only removes entries for the requested session", () => {
      const nowMs = 1_000_000;
      queuePending("session-a", "queued", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      queuePending("session-b", "queued", nowMs - PENDING_COMPACTION_TTL_MS + 1);
      ctx.compactionHandoff.set("session-a", createMockCompactionHandoff("handoff for a"));
      ctx.compactionHandoff.set("session-b", createMockCompactionHandoff("handoff for b"));

      expect(getLivePendingCompaction(ctx, "session-a", nowMs)).toBeUndefined();

      expect(ctx.pendingCompactions.has("session-a")).toBe(false);
      expect(ctx.compactionHandoff.has("session-a")).toBe(false);
      expect(ctx.pendingCompactions.has("session-b")).toBe(true);
      expect(ctx.compactionHandoff.has("session-b")).toBe(true);
    });

    it("reclaims a different expired session while looking up an unrelated missing session", () => {
      const nowMs = 1_000_000;
      queuePending("stale-session", "queued", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      ctx.compactionHandoff.set("stale-session", createMockCompactionHandoff("handoff for stale"));

      expect(getLivePendingCompaction(ctx, "unrelated", nowMs)).toBeUndefined();

      expect(ctx.pendingCompactions.has("stale-session")).toBe(false);
      expect(ctx.compactionHandoff.has("stale-session")).toBe(false);
      expect(ctx.pendingCompactions.has("unrelated")).toBe(false);
    });

    it("reclaims session B when looking up expired session A, leaving live session C intact", () => {
      const nowMs = 1_000_000;
      queuePending("session-a", "queued", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      queuePending("session-b", "queued", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      queuePending("session-c", "queued", nowMs - PENDING_COMPACTION_TTL_MS + 1);
      ctx.compactionHandoff.set("session-a", createMockCompactionHandoff("handoff for a"));
      ctx.compactionHandoff.set("session-b", createMockCompactionHandoff("handoff for b"));
      ctx.compactionHandoff.set("session-c", createMockCompactionHandoff("handoff for c"));

      expect(getLivePendingCompaction(ctx, "session-a", nowMs)).toBeUndefined();

      expect(ctx.pendingCompactions.has("session-a")).toBe(false);
      expect(ctx.compactionHandoff.has("session-a")).toBe(false);
      expect(ctx.pendingCompactions.has("session-b")).toBe(false);
      expect(ctx.compactionHandoff.has("session-b")).toBe(false);
      expect(ctx.pendingCompactions.has("session-c")).toBe(true);
      expect(ctx.compactionHandoff.has("session-c")).toBe(true);
    });

    it("does not delete a handoff whose pending entry is still live during cross-session sweep", () => {
      const nowMs = 1_000_000;
      queuePending("session-a", "queued", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      queuePending("session-b", "in-flight", nowMs - PENDING_COMPACTION_TTL_MS + 1);
      ctx.compactionHandoff.set("session-a", createMockCompactionHandoff("handoff for a"));
      ctx.compactionHandoff.set("session-b", createMockCompactionHandoff("handoff for b"));

      expect(getLivePendingCompaction(ctx, "session-a", nowMs)).toBeUndefined();

      expect(ctx.pendingCompactions.has("session-a")).toBe(false);
      expect(ctx.compactionHandoff.has("session-a")).toBe(false);
      expect(ctx.pendingCompactions.has("session-b")).toBe(true);
      expect(ctx.compactionHandoff.has("session-b")).toBe(true);
    });

    it("returns the live requested session while also sweeping other expired sessions", () => {
      const nowMs = 1_000_000;
      queuePending("session-a", "queued", nowMs - PENDING_COMPACTION_TTL_MS + 1);
      queuePending("session-b", "queued", nowMs - PENDING_COMPACTION_TTL_MS - 1);
      ctx.compactionHandoff.set("session-a", createMockCompactionHandoff("handoff for a"));
      ctx.compactionHandoff.set("session-b", createMockCompactionHandoff("handoff for b"));

      const live = getLivePendingCompaction(ctx, "session-a", nowMs);
      expect(live).toBeDefined();
      expect(live?.status).toBe("queued");

      expect(ctx.pendingCompactions.has("session-a")).toBe(true);
      expect(ctx.compactionHandoff.has("session-a")).toBe(true);
      expect(ctx.pendingCompactions.has("session-b")).toBe(false);
      expect(ctx.compactionHandoff.has("session-b")).toBe(false);
    });
  });

  describe("TTL and event clearing compose", () => {
    function queueForSession(sessionID: string, queuedAtMs: number): void {
      ctx.pendingCompactions.set(sessionID, {
        model: { providerID: "test-provider", modelID: "test-model" },
        status: "queued",
        queuedAtMs,
      });
      ctx.compactionHandoff.set(sessionID, createMockCompactionHandoff(`handoff ${sessionID}`));
    }

    it("event clearing removes an entry before TTL expiry", () => {
      const sessionID = "event-cleared";
      const nowMs = 1_000_000;
      queueForSession(sessionID, nowMs - 1_000);

      // Simulate session.compacted clearing the maps via clearCompactionState.
      ctx.pendingCompactions.delete(sessionID);
      ctx.compactionHandoff.delete(sessionID);

      expect(getLivePendingCompaction(ctx, sessionID, nowMs)).toBeUndefined();
      expect(ctx.compactionHandoff.has(sessionID)).toBe(false);
    });

    it("TTL reclaims an entry that never receives an event", () => {
      const sessionID = "ttl-reclaimed";
      const nowMs = 1_000_000;
      queueForSession(sessionID, nowMs - PENDING_COMPACTION_TTL_MS - 1);

      expect(getLivePendingCompaction(ctx, sessionID, nowMs)).toBeUndefined();
      expect(ctx.pendingCompactions.has(sessionID)).toBe(false);
      expect(ctx.compactionHandoff.has(sessionID)).toBe(false);
    });

    it("survives overlapping signals without throwing and leaves maps empty", () => {
      const sessionID = "overlapping-signals";
      const nowMs = 1_000_000;
      queueForSession(sessionID, nowMs - 30_000);

      // Compacting hook / dispatch observes the request.
      const pending = getLivePendingCompaction(ctx, sessionID, nowMs);
      expect(pending).toBeDefined();
      if (pending) pending.status = "in-flight";

      // Host sends session.compacted before observeCompaction settles.
      ctx.pendingCompactions.delete(sessionID);
      ctx.compactionHandoff.delete(sessionID);

      // A late observeCompaction-style settle checks the map and finds nothing.
      const afterEvent = ctx.pendingCompactions.get(sessionID);
      if (afterEvent) {
        afterEvent.status = "in-flight";
      }

      expect(() => getLivePendingCompaction(ctx, sessionID, nowMs)).not.toThrow();
      expect(ctx.pendingCompactions.has(sessionID)).toBe(false);
      expect(ctx.compactionHandoff.has(sessionID)).toBe(false);
    });
  });

  describe("describePendingCompaction", () => {
    it("includes the status and a human-readable age in seconds", () => {
      const pending = {
        model: { providerID: "p", modelID: "m" },
        status: "queued" as const,
        queuedAtMs: 1_000_000 - 42_000,
      };
      const description = describePendingCompaction(pending, 1_000_000);
      expect(description).toContain("queued");
      expect(description).toContain("42s");
    });

    it("includes minutes and seconds for older entries", () => {
      const pending = {
        model: { providerID: "p", modelID: "m" },
        status: "in-flight" as const,
        queuedAtMs: 1_000_000 - (3 * 60_000 + 12_000),
      };
      const description = describePendingCompaction(pending, 1_000_000);
      expect(description).toContain("in-flight");
      expect(description).toContain("3m 12s");
    });

    it("uses only seconds when the age is under a minute", () => {
      const pending = {
        model: { providerID: "p", modelID: "m" },
        status: "queued" as const,
        queuedAtMs: 1_000_000 - 59_000,
      };
      const description = describePendingCompaction(pending, 1_000_000);
      expect(description).toBe("queued 59s ago");
    });
  });
});
