import { describe, expect, it } from "bun:test";
import {
  type SdkChannelInfo,
  type ToolDefinition,
  classifyChannel,
  detectSdkChannel,
  tool,
} from "./sdk-compat.js";

describe("sdk-compat", () => {
  describe("re-exported tool factory", () => {
    it("creates a valid tool definition", () => {
      const def: ToolDefinition = tool({
        description: "A test tool",
        args: {
          name: tool.schema.string(),
        },
        async execute(args) {
          return `hello ${args.name}`;
        },
      });

      expect(def.description).toBe("A test tool");
      expect(def.args).toBeDefined();
      expect(typeof def.execute).toBe("function");
    });

    it("exposes tool.schema (zod) for schema building", () => {
      expect(tool.schema).toBeDefined();
      expect(typeof tool.schema.string).toBe("function");
      expect(typeof tool.schema.number).toBe("function");
      expect(typeof tool.schema.boolean).toBe("function");
    });
  });

  describe("detectSdkChannel", () => {
    it("returns a version string and a valid channel", () => {
      const info = detectSdkChannel();

      expect(typeof info.version).toBe("string");
      expect(info.version.length).toBeGreaterThan(0);
      expect(["stable", "beta", "unknown"]).toContain(info.channel);
    });

    it("returns a real semver version from the installed SDK", () => {
      const info = detectSdkChannel();
      expect(info.version).not.toBe("0.0.0");
      expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("detects the current stable SDK as stable", () => {
      const info = detectSdkChannel();
      expect(info.channel).toBe("stable");
    });
  });

  describe("classifyChannel", () => {
    it("classifies clean semver as stable", () => {
      expect(classifyChannel("1.0.0")).toBe("stable");
      expect(classifyChannel("2.3.14")).toBe("stable");
      expect(classifyChannel("0.1.0")).toBe("stable");
    });

    it("classifies pre-release tags as beta", () => {
      expect(classifyChannel("1.0.0-beta.1")).toBe("beta");
      expect(classifyChannel("2.0.0-alpha.3")).toBe("beta");
      expect(classifyChannel("1.5.0-rc.1")).toBe("beta");
      expect(classifyChannel("3.0.0-canary.42")).toBe("beta");
      expect(classifyChannel("1.0.0-next.0")).toBe("beta");
      expect(classifyChannel("1.0.0-dev.20260101")).toBe("beta");
    });

    it("classifies unrecognized formats as unknown", () => {
      expect(classifyChannel("")).toBe("unknown");
      expect(classifyChannel("latest")).toBe("unknown");
      expect(classifyChannel("1.0")).toBe("unknown");
    });

    it("is case-insensitive for pre-release detection", () => {
      expect(classifyChannel("1.0.0-BETA.1")).toBe("beta");
      expect(classifyChannel("1.0.0-Alpha.2")).toBe("beta");
    });

    it("returns the correct type shape", () => {
      const result: SdkChannelInfo["channel"] = classifyChannel("1.0.0");
      expect(result).toBe("stable");
    });
  });
});
