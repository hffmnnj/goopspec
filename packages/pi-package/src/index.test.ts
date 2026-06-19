import { describe, expect, it } from "bun:test";
import type { PiExtensionAPI } from "./core/types.js";
import goopspec, { goopspec as namedExport } from "./index.js";

function createMockPiApi(): PiExtensionAPI {
  return {
    registerTool: () => {},
    registerCommand: () => {},
    on: () => {},
    events: { emit: () => {}, on: () => {} },
  };
}

describe("goopspec extension factory", () => {
  it("exports a function as default", () => {
    expect(typeof goopspec).toBe("function");
  });

  it("exports a named export matching the default", () => {
    expect(namedExport).toBe(goopspec);
  });

  it("can be called with a mock Pi API without throwing", () => {
    const mockPi = createMockPiApi();
    expect(() => goopspec(mockPi)).not.toThrow();
  });

  it("does not call any registration methods yet", () => {
    let toolCalls = 0;
    let commandCalls = 0;
    let onCalls = 0;

    const mockPi: PiExtensionAPI = {
      registerTool: () => {
        toolCalls++;
      },
      registerCommand: () => {
        commandCalls++;
      },
      on: () => {
        onCalls++;
      },
      events: { emit: () => {}, on: () => {} },
    };

    goopspec(mockPi);

    expect(toolCalls).toBe(0);
    expect(commandCalls).toBe(0);
    expect(onCalls).toBe(0);
  });
});
