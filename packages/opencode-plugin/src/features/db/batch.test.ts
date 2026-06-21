import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { setupTestEnvironment } from "../../test-utils.js";
import { formatBatchResult, runBatch } from "./batch.js";
import type { GoopSpecDB } from "./index.js";
import type { DocType } from "./types.js";

describe("runBatch", () => {
  let db: GoopSpecDB;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("batch-test");
    db = env.db;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("returns empty result for empty items array", () => {
    const result = runBatch(db, [], () => "unreachable");

    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, items: [] });
  });

  it("succeeds for single-element array", () => {
    const docTypes: DocType[] = ["spec"];

    const result = runBatch(db, docTypes, (docType) => {
      db.upsertDocument("wf-batch", docType, "# Spec");
      return `wrote ${docType}`;
    });

    expect(result).toEqual({
      total: 1,
      succeeded: 1,
      failed: 0,
      items: [{ index: 0, ok: true, detail: "wrote spec" }],
    });
    expect(db.getDocument("wf-batch", "spec")?.content).toBe("# Spec");
  });

  it("succeeds for multi-element array", () => {
    const docTypes: DocType[] = ["spec", "blueprint", "chronicle"];

    const result = runBatch(db, docTypes, (docType, index) => {
      db.upsertDocument("wf-batch", docType, `content ${index}`);
      return `wrote ${docType}`;
    });

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.items).toEqual([
      { index: 0, ok: true, detail: "wrote spec" },
      { index: 1, ok: true, detail: "wrote blueprint" },
      { index: 2, ok: true, detail: "wrote chronicle" },
    ]);
    expect(db.getDocument("wf-batch", "spec")?.content).toBe("content 0");
    expect(db.getDocument("wf-batch", "blueprint")?.content).toBe("content 1");
    expect(db.getDocument("wf-batch", "chronicle")?.content).toBe("content 2");
  });

  it("rolls back entire transaction on any item failure — no partial DB state", () => {
    db.runTransaction(() => {
      db.upsertWorkflow("wf-batch", { phase: "execute" });
    });

    const docTypes: DocType[] = ["spec", "blueprint"];

    const result = runBatch(db, docTypes, (docType, index) => {
      if (index === 1) {
        throw new Error("boom");
      }

      db.upsertDocument("wf-batch", docType, "should roll back");
      return `wrote ${docType}`;
    });

    expect(result).toEqual({
      total: 2,
      succeeded: 0,
      failed: 2,
      items: [
        { index: 0, ok: false, detail: "rolled back due to batch failure" },
        { index: 1, ok: false, detail: "boom" },
      ],
    });
    expect(db.getDocument("wf-batch", "spec")).toBeNull();
    expect(db.getWorkflow("wf-batch")).not.toBeNull();
  });

  it("surfaces per-item status when all fail", () => {
    const result = runBatch(db, ["first", "second"], (_item, index) => {
      throw new Error(`failed ${index}`);
    });

    expect(result).toEqual({
      total: 2,
      succeeded: 0,
      failed: 2,
      items: [
        { index: 0, ok: false, detail: "failed 0" },
        { index: 1, ok: false, detail: "not processed due to batch failure" },
      ],
    });
  });
});

describe("formatBatchResult", () => {
  it("formats all-success result", () => {
    const formatted = formatBatchResult(
      {
        total: 3,
        succeeded: 3,
        failed: 0,
        items: [
          { index: 0, ok: true, detail: "wrote spec" },
          { index: 1, ok: true, detail: "wrote blueprint" },
          { index: 2, ok: true, detail: "wrote chronicle" },
        ],
      },
      "write-db",
    );

    expect(formatted).toBe(
      "Batch write-db: 3/3 succeeded.\n- [0] OK: wrote spec\n- [1] OK: wrote blueprint\n- [2] OK: wrote chronicle",
    );
  });

  it("formats mixed result with failures", () => {
    const formatted = formatBatchResult(
      {
        total: 3,
        succeeded: 2,
        failed: 1,
        items: [
          { index: 0, ok: true, detail: "wrote spec" },
          { index: 1, ok: false, detail: "invalid doc_type" },
          { index: 2, ok: true, detail: "wrote chronicle" },
        ],
      },
      "write-db",
    );

    expect(formatted).toBe(
      "Batch write-db: 2/3 succeeded, 1 failed.\n- [0] OK: wrote spec\n- [1] FAIL: invalid doc_type\n- [2] OK: wrote chronicle",
    );
  });

  it("formats empty result", () => {
    const formatted = formatBatchResult(
      { total: 0, succeeded: 0, failed: 0, items: [] },
      "write-db",
    );

    expect(formatted).toBe("Batch write-db: 0/0 succeeded.");
  });
});
