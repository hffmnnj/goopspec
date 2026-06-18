import { describe, expect, it } from "bun:test";

import { TASK_MODES } from "../../core/constants.js";

import {
  type SpecContract,
  checkContractGate,
  shouldEnforceContractGate,
  validateSpecContract,
} from "./validation-contract.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function completeContract(): SpecContract {
  return {
    vision: "Build a spec-driven development plugin",
    mustHaves: ["MH1: Core workflow", "MH2: Memory system"],
    outOfScope: ["Web panel", "Daemon"],
    risks: ["SDK hooks may not work"],
    constraints: ["Bun runtime only"],
  };
}

// ---------------------------------------------------------------------------
// validateSpecContract
// ---------------------------------------------------------------------------

describe("validateSpecContract", () => {
  it("returns valid for a complete contract", () => {
    const result = validateSpecContract(completeContract());
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.reason).toBeUndefined();
  });

  it("reports missing vision when absent", () => {
    const contract = { ...completeContract(), vision: undefined };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("vision");
  });

  it("reports missing vision when empty string", () => {
    const contract = { ...completeContract(), vision: "" };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("vision");
  });

  it("reports missing vision when whitespace-only", () => {
    const contract = { ...completeContract(), vision: "   " };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("vision");
  });

  it("reports missing mustHaves when absent", () => {
    const contract = { ...completeContract(), mustHaves: undefined };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("mustHaves");
  });

  it("reports missing mustHaves when empty array", () => {
    const contract = { ...completeContract(), mustHaves: [] };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("mustHaves");
  });

  it("reports missing outOfScope when absent", () => {
    const contract = { ...completeContract(), outOfScope: undefined };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("outOfScope");
  });

  it("reports missing outOfScope when empty array", () => {
    const contract = { ...completeContract(), outOfScope: [] };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("outOfScope");
  });

  it("reports missing risks when absent", () => {
    const contract = { ...completeContract(), risks: undefined };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("risks");
  });

  it("reports missing risks when empty array", () => {
    const contract = { ...completeContract(), risks: [] };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("risks");
  });

  it("reports missing constraints when absent", () => {
    const contract = { ...completeContract(), constraints: undefined };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("constraints");
  });

  it("reports missing constraints when empty array", () => {
    const contract = { ...completeContract(), constraints: [] };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("constraints");
  });

  it("reports all missing sections for an empty contract", () => {
    const result = validateSpecContract({});
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["vision", "mustHaves", "outOfScope", "risks", "constraints"]);
    expect(result.reason).toContain("vision");
    expect(result.reason).toContain("mustHaves");
  });

  it("reports multiple missing sections together", () => {
    const contract: SpecContract = {
      vision: "A valid vision",
      mustHaves: ["MH1"],
    };
    const result = validateSpecContract(contract);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["outOfScope", "risks", "constraints"]);
  });
});

// ---------------------------------------------------------------------------
// shouldEnforceContractGate
// ---------------------------------------------------------------------------

describe("shouldEnforceContractGate", () => {
  it("returns false for quick mode", () => {
    expect(shouldEnforceContractGate("quick")).toBe(false);
  });

  it("returns true for standard mode", () => {
    expect(shouldEnforceContractGate("standard")).toBe(true);
  });

  it("returns true for comprehensive mode", () => {
    expect(shouldEnforceContractGate("comprehensive")).toBe(true);
  });

  it("returns true for milestone mode", () => {
    expect(shouldEnforceContractGate("milestone")).toBe(true);
  });

  it("returns true for all non-quick modes", () => {
    const nonQuick = TASK_MODES.filter((m) => m !== "quick");
    for (const mode of nonQuick) {
      expect(shouldEnforceContractGate(mode)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// checkContractGate
// ---------------------------------------------------------------------------

describe("checkContractGate", () => {
  it("bypasses validation in quick mode even with empty contract", () => {
    const result = checkContractGate({}, "quick");
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("enforces validation in standard mode", () => {
    const result = checkContractGate({}, "standard");
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBe(5);
  });

  it("enforces validation in comprehensive mode", () => {
    const result = checkContractGate({}, "comprehensive");
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBe(5);
  });

  it("enforces validation in milestone mode", () => {
    const result = checkContractGate({}, "milestone");
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBe(5);
  });

  it("passes in standard mode with complete contract", () => {
    const result = checkContractGate(completeContract(), "standard");
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("passes in comprehensive mode with complete contract", () => {
    const result = checkContractGate(completeContract(), "comprehensive");
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
