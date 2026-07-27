import { describe, expect, it } from "bun:test";

import { installHint } from "./install-hints.js";

describe("installHint()", () => {
  it("returns a hint for ast-grep mentioning the npm package", () => {
    const hint = installHint("ast-grep");
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("@ast-grep/cli");
    expect(hint).toContain("ast-grep");
    expect(hint).toContain("binaryPaths.ast-grep");
  });

  it("returns a hint for scip mentioning the GitHub release and TypeScript indexer", () => {
    const hint = installHint("scip");
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("scip");
    expect(hint).toContain("@sourcegraph/scip-typescript");
    expect(hint).toContain("binaryPaths.scip");
  });

  it("returns a hint for scip-typescript mentioning the npm package", () => {
    const hint = installHint("scip-typescript");
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("@sourcegraph/scip-typescript");
    expect(hint).toContain("binaryPaths.scip-typescript");
  });

  it("returns a hint for difft mentioning Homebrew / Cargo options", () => {
    const hint = installHint("difft");
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("difftastic");
    expect(hint).toContain("binaryPaths.difft");
  });

  it("returns a generic fallback for an unrecognized key", () => {
    const hint = installHint("some-unknown-binary");
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("some-unknown-binary");
    expect(hint).toContain("binaryPaths.some-unknown-binary");
  });
});
