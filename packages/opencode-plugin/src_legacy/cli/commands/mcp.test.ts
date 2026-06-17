import { describe, expect, it } from "bun:test";

import { DEFAULT_CONFIG } from "../../core/config.js";
import type { GoopSpecConfig, McpConfig } from "../../core/types.js";
import {
  MCP_CATEGORIES,
  MCP_SERVER_REGISTRY,
  TOGGLEABLE_SERVER_KEYS,
  getMcpState,
  getMemoryProvider,
  getSearchProvider,
  isServerEnabled,
  setMemoryProvider,
  setSearchProvider,
  toggleServer,
} from "./mcp.js";

const MCP_BOOLEAN_KEYS = ["context7", "exa", "playwright", "memory", "github", "sqlite"] as const;

function getServer(name: string) {
  const server = MCP_SERVER_REGISTRY.find((entry) => entry.name === name);
  expect(server).toBeDefined();
  return server!;
}

describe("MCP Server Registry", () => {
  it("covers all McpConfig boolean keys", () => {
    const booleanConfigKeys = new Set(
      MCP_SERVER_REGISTRY.map((server) => server.configKey).filter((key): key is keyof McpConfig =>
        MCP_BOOLEAN_KEYS.includes(key as (typeof MCP_BOOLEAN_KEYS)[number]),
      ),
    );

    for (const key of MCP_BOOLEAN_KEYS) {
      expect(booleanConfigKeys.has(key)).toBe(true);
    }
  });

  it("has categories defined for all servers", () => {
    for (const server of MCP_SERVER_REGISTRY) {
      expect(MCP_CATEGORIES[server.category]).toBeDefined();
      expect(MCP_CATEGORIES[server.category].trim().length).toBeGreaterThan(0);
    }
  });

  it("has valid exclusion groups only for search/memory", () => {
    for (const server of MCP_SERVER_REGISTRY) {
      if (!server.exclusionGroup) {
        continue;
      }

      expect(["search-provider", "memory-provider"]).toContain(server.exclusionGroup);

      if (server.exclusionGroup === "search-provider") {
        expect(server.category).toBe("search");
      }

      if (server.exclusionGroup === "memory-provider") {
        expect(server.category).toBe("memory");
      }
    }
  });
});

describe("getMcpState", () => {
  it("returns defaults when config has no mcp section", () => {
    const state = getMcpState({});

    expect(state).toEqual(DEFAULT_CONFIG.mcp);
  });

  it("merges config mcp with defaults", () => {
    const state = getMcpState({
      mcp: {
        exa: false,
        sqlite: true,
      },
    });

    expect(state).toEqual({
      ...DEFAULT_CONFIG.mcp,
      exa: false,
      sqlite: true,
    });
  });
});

describe("getSearchProvider", () => {
  it("returns 'exa' when exa is enabled", () => {
    expect(getSearchProvider({ mcp: { exa: true } })).toBe("exa");
  });

  it("returns 'brave' when exa is disabled", () => {
    expect(getSearchProvider({ mcp: { exa: false } })).toBe("brave");
  });

  it("returns 'exa' when exa is undefined (default from DEFAULT_CONFIG)", () => {
    const config: GoopSpecConfig = {
      mcp: {
        context7: true,
      },
    };

    // DEFAULT_CONFIG.mcp.exa is true, so undefined exa resolves to exa
    expect(getSearchProvider(config)).toBe("exa");
  });
});

describe("getMemoryProvider", () => {
  it("returns 'local' by default", () => {
    expect(getMemoryProvider({})).toBe("local");
  });

  it("returns configured provider", () => {
    expect(
      getMemoryProvider({
        memory: {
          embeddings: {
            provider: "ollama",
          },
        },
      }),
    ).toBe("ollama");
  });
});

describe("isServerEnabled", () => {
  it("returns true for enabled boolean servers", () => {
    const context7Server = getServer("context7");
    expect(isServerEnabled({ mcp: { context7: true } }, context7Server)).toBe(true);
  });

  it("returns false for disabled boolean servers", () => {
    const context7Server = getServer("context7");
    expect(isServerEnabled({ mcp: { context7: false } }, context7Server)).toBe(false);
  });

  it("returns true for active search provider", () => {
    const braveServer = getServer("brave");
    const exaServer = getServer("exa");

    expect(isServerEnabled({ mcp: { exa: false } }, braveServer)).toBe(true);
    expect(isServerEnabled({ mcp: { exa: false } }, exaServer)).toBe(false);
    expect(isServerEnabled({ mcp: { exa: true } }, braveServer)).toBe(false);
    expect(isServerEnabled({ mcp: { exa: true } }, exaServer)).toBe(true);
  });

  it("returns true for active memory provider", () => {
    const localServer = getServer("memory-local");
    const openaiServer = getServer("memory-openai");

    expect(isServerEnabled({}, localServer)).toBe(true);
    expect(isServerEnabled({}, openaiServer)).toBe(false);
    expect(
      isServerEnabled(
        {
          memory: {
            embeddings: {
              provider: "openai",
            },
          },
        },
        openaiServer,
      ),
    ).toBe(true);
  });
});

describe("toggleServer", () => {
  it("toggles a disabled server to enabled", () => {
    const config: GoopSpecConfig = { mcp: { context7: false } };

    toggleServer(config, "context7");

    expect(config.mcp?.context7).toBe(true);
  });

  it("toggles an enabled server to disabled", () => {
    const config: GoopSpecConfig = { mcp: { context7: true } };

    toggleServer(config, "context7");

    expect(config.mcp?.context7).toBe(false);
  });
});

describe("setSearchProvider", () => {
  it("sets exa=true for Exa provider", () => {
    const config: GoopSpecConfig = {};

    setSearchProvider(config, "exa");

    expect(config.mcp?.exa).toBe(true);
  });

  it("sets exa=false for Brave provider", () => {
    const config: GoopSpecConfig = { mcp: { exa: true } };

    setSearchProvider(config, "brave");

    expect(config.mcp?.exa).toBe(false);
  });
});

describe("setMemoryProvider", () => {
  it("sets memory.embeddings.provider", () => {
    const config: GoopSpecConfig = {
      memory: {
        embeddings: {
          provider: "local",
        },
      },
    };

    setMemoryProvider(config, "openai");

    expect(config.memory?.embeddings?.provider).toBe("openai");
  });

  it("creates memory section if missing", () => {
    const config: GoopSpecConfig = {};

    setMemoryProvider(config, "ollama");

    expect(config.memory?.embeddings?.provider).toBe("ollama");
  });
});

describe("TOGGLEABLE_SERVER_KEYS", () => {
  it("matches McpConfig boolean key set", () => {
    expect(TOGGLEABLE_SERVER_KEYS).toEqual(MCP_BOOLEAN_KEYS);
  });
});
