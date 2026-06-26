import { describe, it, expect, afterEach } from "bun:test";
import { FALLBACK_MODELS } from "./models-fallback.js";
import { fetchModels } from "./models.js";

const originalFetch = globalThis.fetch;

describe("models", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns fallback models when the OpenCode server is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const result = await fetchModels();

    expect(result.source).toBe("fallback");
    expect(result.models).toEqual(FALLBACK_MODELS);
  });

  it("returns live models when the OpenCode server responds", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          providers: {
            anthropic: {
              name: "Anthropic",
              models: {
                "claude-sonnet-4-5": { name: "Claude Sonnet 4.5" },
              },
            },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const result = await fetchModels();

    expect(result.source).toBe("live");
    expect(result.models).toEqual([
      { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "Anthropic" },
    ]);
  });

  it("falls back when the server returns an empty model payload", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch;

    const result = await fetchModels();

    expect(result.source).toBe("fallback");
    expect(result.models).toEqual(FALLBACK_MODELS);
  });

  it("fallback list has reasonable coverage", () => {
    expect(FALLBACK_MODELS.length).toBeGreaterThan(10);
  });

  it("fallback entries include id, name, and provider fields", () => {
    for (const model of FALLBACK_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.provider).toBeTruthy();
    }
  });
});
