import { afterEach, describe, expect, it } from "bun:test";

import { createPluginContextV2 } from "./context-v2.js";
import type { V2RuntimeContext } from "./v2-compat.js";

describe("createPluginContextV2()", () => {
  const contexts: Awaited<ReturnType<typeof createPluginContextV2>>[] = [];

  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.db.close();
    }
  });

  it("returns every GoopSpec PluginContext field", async () => {
    const context = await createPluginContextV2({} as V2RuntimeContext);
    contexts.push(context);

    expect(context.sdk).toBeDefined();
    expect(context.db).toBeDefined();
    expect(context.stateManager).toBeDefined();
    expect(context.memory).toBeDefined();
    expect(context.resolver).toBeDefined();
    expect(context.session).toBeDefined();
    expect(context.sessionManager).toBeDefined();
  });

  it("uses the process working directory when V2 provides no directory", async () => {
    const context = await createPluginContextV2({} as V2RuntimeContext);
    contexts.push(context);

    expect(context.sdk.directory).toBe(process.cwd());
    expect(context.sdk.worktree).toBe(process.cwd());
  });
});
