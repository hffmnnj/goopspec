import { describe, expect, it } from "bun:test";
import { V2Plugin, type V2PluginContext, type V2PluginDefinition } from "./v2-compat.js";

describe("v2-compat", () => {
  it("exposes a namespace-style V2 plugin definition facade", () => {
    const plugin: V2PluginDefinition = V2Plugin.define({
      id: "goopspec-test",
      setup(_context: V2PluginContext) {},
    });

    expect(plugin.id).toBe("goopspec-test");
    expect(typeof plugin.setup).toBe("function");
  });
});
