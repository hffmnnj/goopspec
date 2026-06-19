import { describe, expect, it } from "bun:test";
import {
  DB_FILENAME,
  DOC_TYPES,
  EXECUTOR_TIERS,
  GOOPSPEC_DIR,
  OMP_DETECTION_ENV,
  PI_EVENTS,
  PI_RUNTIME_ENV,
  STATUS_SYMBOLS,
  TASK_MODES,
  WORKFLOW_PHASES,
} from "./constants.js";

describe("WORKFLOW_PHASES", () => {
  it("contains exactly 5 phases", () => {
    expect(WORKFLOW_PHASES).toHaveLength(5);
  });

  it("includes all expected phases", () => {
    expect(WORKFLOW_PHASES).toContain("discuss");
    expect(WORKFLOW_PHASES).toContain("plan");
    expect(WORKFLOW_PHASES).toContain("execute");
    expect(WORKFLOW_PHASES).toContain("accept");
    expect(WORKFLOW_PHASES).toContain("confirm");
  });
});

describe("DOC_TYPES", () => {
  it("contains exactly 7 document types", () => {
    expect(DOC_TYPES).toHaveLength(7);
  });

  it("includes spec and blueprint", () => {
    expect(DOC_TYPES).toContain("spec");
    expect(DOC_TYPES).toContain("blueprint");
  });
});

describe("TASK_MODES", () => {
  it("contains exactly 4 modes", () => {
    expect(TASK_MODES).toHaveLength(4);
  });
});

describe("EXECUTOR_TIERS", () => {
  it("contains exactly 5 tiers", () => {
    expect(EXECUTOR_TIERS).toHaveLength(5);
  });

  it("includes frontend tiers", () => {
    expect(EXECUTOR_TIERS).toContain("frontend-low");
    expect(EXECUTOR_TIERS).toContain("frontend-high");
  });
});

describe("directory constants", () => {
  it("GOOPSPEC_DIR is .goopspec", () => {
    expect(GOOPSPEC_DIR).toBe(".goopspec");
  });

  it("DB_FILENAME is goopspec.db", () => {
    expect(DB_FILENAME).toBe("goopspec.db");
  });
});

describe("STATUS_SYMBOLS", () => {
  it("has all expected symbols", () => {
    expect(STATUS_SYMBOLS.OK).toBe("[OK]");
    expect(STATUS_SYMBOLS.FAIL).toBe("[FAIL]");
    expect(STATUS_SYMBOLS.WARN).toBe("[WARN]");
    expect(STATUS_SYMBOLS.WORK).toBe("[WORK]");
    expect(STATUS_SYMBOLS.WAIT).toBe("[WAIT]");
    expect(STATUS_SYMBOLS.GATE).toBe("[GATE]");
  });
});

describe("PI_EVENTS", () => {
  it("has all expected event names", () => {
    expect(PI_EVENTS.SESSION_START).toBe("session_start");
    expect(PI_EVENTS.BEFORE_AGENT_START).toBe("before_agent_start");
    expect(PI_EVENTS.TOOL_CALL).toBe("tool_call");
  });
});

describe("runtime detection env vars", () => {
  it("OMP_DETECTION_ENV is OMP_VERSION", () => {
    expect(OMP_DETECTION_ENV).toBe("OMP_VERSION");
  });

  it("PI_RUNTIME_ENV is PI_RUNTIME", () => {
    expect(PI_RUNTIME_ENV).toBe("PI_RUNTIME");
  });
});
