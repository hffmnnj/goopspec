import { afterEach, describe, expect, it } from "bun:test";

import { setupTestEnvironment } from "../test-utils.js";
import { createPluginContextV2 } from "./context-v2.js";
import type { V2RuntimeContext } from "./v2-compat.js";

describe("createPluginContextV2()", () => {
  const contexts: Awaited<ReturnType<typeof createPluginContextV2>>[] = [];
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.db.close();
    }
    cleanup?.();
    cleanup = undefined;
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

  it("uses options.directory when provided by the V2 runtime", async () => {
    const env = setupTestEnvironment("ctx-v2-dir");
    cleanup = env.cleanup;

    const runtimeCtx = { options: { directory: env.testDir } } as unknown as V2RuntimeContext;
    const context = await createPluginContextV2(runtimeCtx);
    contexts.push(context);

    expect(context.sdk.directory).toBe(env.testDir);
    expect(context.sdk.worktree).toBe(env.testDir);
  });
});
