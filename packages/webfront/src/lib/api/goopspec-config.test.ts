import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { OpenCodeClient } from "./types.js";
import {
	copyGoopspecJson,
	loadMergedGoopspecConfig,
	normalizeRaw,
	saveGoopspecConfig,
	sourceLabel,
	toGoopspecJson,
	type GoopSpecConfig,
} from "./goopspec-config.js";

function createMockClient(
	config: Partial<OpenCodeClient> = {},
): OpenCodeClient {
	return {
		listSessions: mock(() => Promise.resolve([])),
		createSession: mock(() => Promise.resolve({} as never)),
		deleteSession: mock(() => Promise.resolve()),
		renameSession: mock(() => Promise.resolve({} as never)),
		getMessages: mock(() => Promise.resolve([])),
		sendMessage: mock(() => Promise.resolve({} as never)),
		subscribeEvents: () => () => undefined,
		listProviders: mock(() => Promise.resolve([])),
		getConfig: mock(() => Promise.resolve({})),
		updateConfig: mock(() => Promise.resolve({})),
		readFile: mock(() => Promise.resolve("")),
		listDirectory: mock(() => Promise.resolve([])),
		...config,
	} as unknown as OpenCodeClient;
}

function mockReadFile(
	client: OpenCodeClient,
	files: Record<string, string | null>,
): void {
	client.readFile = mock((path: string) => {
		const text = files[path];
		if (text === null || text === undefined) {
			return Promise.reject(new Error(`ENOENT: ${path}`));
		}
		return Promise.resolve(text);
	});
}

function firstConfigPatch(
	updateConfig: ReturnType<typeof mock>,
): { goopspec: GoopSpecConfig } {
	const calls = updateConfig.mock.calls as unknown as Array<[{ goopspec: GoopSpecConfig }]>;
	const patch = calls[0]?.[0];
	if (!patch) throw new Error("updateConfig was not called with a config patch");
	return patch;
}

describe("normalizeRaw", () => {
	it("extracts known scalar fields with correct types", () => {
		const cfg = normalizeRaw({
			projectName: "Clever Orchid",
			defaultModel: "anthropic/claude-sonnet-4-6",
			memoryEnabled: true,
			gitignoreGoopspec: false,
			enforcement: "warn",
			adlEnabled: true,
		});

		expect(cfg.projectName).toBe("Clever Orchid");
		expect(cfg.defaultModel).toBe("anthropic/claude-sonnet-4-6");
		expect(cfg.memoryEnabled).toBe(true);
		expect(cfg.gitignoreGoopspec).toBe(false);
		expect(cfg.enforcement).toBe("warn");
		expect(cfg.adlEnabled).toBe(true);
	});

	it("ignores unknown or malformed fields", () => {
		const cfg = normalizeRaw({
			projectName: 42,
			defaultModel: null,
			memoryEnabled: "yes",
			enforcement: "chaos",
			adlEnabled: "false",
			unknownKey: "ignored",
		});

		expect(cfg).toEqual({});
	});

	it("normalizes agentModels and agentThinkingBudgets maps", () => {
		const cfg = normalizeRaw({
			agentModels: {
				orchestrator: "anthropic/claude-opus-4-6",
				executorLow: 42,
			},
			agentThinkingBudgets: {
				orchestrator: 4096,
				executorLow: "1024",
			},
		});

		expect(cfg.agentModels).toEqual({
			orchestrator: "anthropic/claude-opus-4-6",
		});
		expect(cfg.agentThinkingBudgets).toEqual({ orchestrator: 4096 });
	});
});

describe("loadMergedGoopspecConfig", () => {
	it("merges internal and project files, with project winning", async () => {
		const client = createMockClient();
		mockReadFile(client, {
			".goopspec/config.json": JSON.stringify({
				memoryEnabled: false,
				defaultModel: "internal/model",
			}),
			"goopspec.json": JSON.stringify({
				defaultModel: "project/model",
				enforcement: "strict",
			}),
		});

		const result = await loadMergedGoopspecConfig(client);

		expect(result.raw.defaultModel).toBe("project/model");
		expect(result.raw.memoryEnabled).toBe(false);
		expect(result.raw.enforcement).toBe("strict");
		expect(result.sources.defaultModel).toBe("project");
		expect(result.sources.memoryEnabled).toBe("internal");
		expect(result.sources.enforcement).toBe("project");
	});

	it("deep-merges agent model maps from both sources", async () => {
		const client = createMockClient();
		mockReadFile(client, {
			".goopspec/config.json": JSON.stringify({
				agentModels: { orchestrator: "internal/orch" },
			}),
			"goopspec.json": JSON.stringify({
				agentModels: { executorLow: "project/low" },
			}),
		});

		const result = await loadMergedGoopspecConfig(client);

		expect(result.raw.agentModels).toEqual({
			orchestrator: "internal/orch",
			executorLow: "project/low",
		});
	});

	it("returns empty config and undefined sources when files are missing", async () => {
		const client = createMockClient();
		mockReadFile(client, {});

		const result = await loadMergedGoopspecConfig(client);

		expect(result.raw).toEqual({});
		expect(result.sources).toEqual({});
		expect(result.agentModelSources).toEqual({});
	});

	it("tracks per-role agentModels source with project winning over internal", async () => {
		const client = createMockClient();
		mockReadFile(client, {
			".goopspec/config.json": JSON.stringify({
				agentModels: {
					orchestrator: "internal/orch",
					planner: "internal/planner",
				},
			}),
			"goopspec.json": JSON.stringify({
				agentModels: {
					planner: "project/planner",
					verifier: "project/verifier",
				},
			}),
		});

		const result = await loadMergedGoopspecConfig(client);

		expect(result.agentModelSources).toEqual({
			orchestrator: "internal",
			planner: "project",
			verifier: "project",
		});
	});
});

describe("saveGoopspecConfig", () => {
	it("PATCHes merged goopspec namespace while preserving other keys", async () => {
		const updateConfig = mock(() => Promise.resolve({} as never));
		const client = createMockClient({
			getConfig: mock(() =>
				Promise.resolve({
					provider: "anthropic",
					goopspec: { memoryEnabled: true, defaultModel: "existing/model" },
				}),
			),
			updateConfig,
		});

		await saveGoopspecConfig(client, { enforcement: "strict" });

		expect(updateConfig).toHaveBeenCalled();
		const patch = firstConfigPatch(updateConfig);
		expect(patch.goopspec).toEqual({
			memoryEnabled: true,
			defaultModel: "existing/model",
			enforcement: "strict",
		});
	});

	it("deep-merges agentModels from existing config and updates", async () => {
		const updateConfig = mock(() => Promise.resolve({} as never));
		const client = createMockClient({
			getConfig: mock(() =>
				Promise.resolve({
					goopspec: {
						agentModels: { orchestrator: "existing/orch" },
						agentThinkingBudgets: { orchestrator: 1024 },
					},
				}),
			),
			updateConfig,
		});

		await saveGoopspecConfig(client, {
			agentModels: { executorLow: "new/low" },
			agentThinkingBudgets: { executorLow: 2048 },
		});

		const patch = firstConfigPatch(updateConfig);
		expect(patch.goopspec.agentModels).toEqual({
			orchestrator: "existing/orch",
			executorLow: "new/low",
		});
		expect(patch.goopspec.agentThinkingBudgets).toEqual({
			orchestrator: 1024,
			executorLow: 2048,
		});
	});
});

describe("toGoopspecJson", () => {
	it("produces formatted JSON with sorted keys", () => {
		const json = toGoopspecJson({ memoryEnabled: true, defaultModel: "m" });
		expect(JSON.parse(json)).toEqual({
			defaultModel: "m",
			memoryEnabled: true,
		});
	});
});

describe("copyGoopspecJson", () => {
	let clipboardDescriptor: PropertyDescriptor | undefined;

	beforeEach(() => {
		clipboardDescriptor = Object.getOwnPropertyDescriptor(
			globalThis,
			"navigator",
		);
	});

	afterEach(() => {
		if (clipboardDescriptor) {
			Object.defineProperty(globalThis, "navigator", clipboardDescriptor);
		} else {
			delete (globalThis as Record<string, unknown>)["navigator"];
		}
	});

	it("writes formatted config JSON to the clipboard", async () => {
		const writeText = mock(() => Promise.resolve());
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: { clipboard: { writeText } },
		});

		const ok = await copyGoopspecJson({ memoryEnabled: true });

		expect(ok).toBe(true);
		expect(writeText).toHaveBeenCalledWith(
			JSON.stringify({ memoryEnabled: true }, null, 2),
		);
	});

	it("returns false when clipboard is unavailable", async () => {
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: {},
		});

		const ok = await copyGoopspecJson({ memoryEnabled: true });

		expect(ok).toBe(false);
	});
});

describe("sourceLabel", () => {
	it("maps sources to display labels", () => {
		expect(sourceLabel(undefined)).toBe("built-in");
		expect(sourceLabel("built-in")).toBe("built-in");
		expect(sourceLabel("global")).toBe("~/.config/opencode/goopspec.json");
		expect(sourceLabel("internal")).toBe(".goopspec/config.json");
		expect(sourceLabel("project")).toBe("goopspec.json");
	});
});
