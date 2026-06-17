import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { SdkPermission } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import {
	createMockPluginContext,
	setupTestEnvironment,
} from "../test-utils.js";
import { createOrchestratorEnforcementHook } from "./orchestrator-enforcement.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePermission(overrides: Partial<SdkPermission> = {}): SdkPermission {
	return {
		id: "perm-001",
		type: "edit",
		pattern: "src/hooks/index.ts",
		sessionID: "session-001",
		messageID: "msg-001",
		title: "Edit src/hooks/index.ts",
		metadata: {},
		time: { created: Date.now() },
		...overrides,
	};
}

function makeOutput(): { status: "ask" | "deny" | "allow" } {
	return { status: "ask" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("orchestrator-enforcement hook", () => {
	let ctx: PluginContext;
	let cleanup: () => void;

	beforeEach(() => {
		const env = setupTestEnvironment("orch-enforce");
		cleanup = env.cleanup;
		ctx = createMockPluginContext({
			testDir: env.testDir,
			agent: "goop-orchestrator",
		});
	});

	afterEach(() => cleanup());

	// -----------------------------------------------------------------------
	// Core blocking behavior
	// -----------------------------------------------------------------------

	it("blocks orchestrator from writing to src/ files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: "src/features/memory/index.ts" }),
			output,
		);

		expect(output.status).toBe("deny");
	});

	it("blocks orchestrator from writing to lib/ files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "write", pattern: "lib/utils.ts" }),
			output,
		);

		expect(output.status).toBe("deny");
	});

	it("blocks orchestrator from writing to packages/ files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: "packages/core/src/index.ts" }),
			output,
		);

		expect(output.status).toBe("deny");
	});

	it("blocks orchestrator from apply_patch on implementation files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "apply_patch", pattern: "src/hooks/utils.ts" }),
			output,
		);

		expect(output.status).toBe("deny");
	});

	it("blocks when pattern is an array containing implementation files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({
				type: "edit",
				pattern: ["src/a.ts", "src/b.ts"],
			}),
			output,
		);

		expect(output.status).toBe("deny");
	});

	// -----------------------------------------------------------------------
	// GoopSpec doc writes — allowed
	// -----------------------------------------------------------------------

	it("allows orchestrator to write .goopspec/ files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({
				type: "edit",
				pattern: ".goopspec/plugin-rebuild/SPEC.md",
			}),
			output,
		);

		expect(output.status).toBe("ask");
	});

	it("allows orchestrator to write .goopspec/state.json", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "write", pattern: ".goopspec/state.json" }),
			output,
		);

		expect(output.status).toBe("ask");
	});

	// -----------------------------------------------------------------------
	// Non-orchestrator agents — unaffected
	// -----------------------------------------------------------------------

	it("allows executor agents to write implementation files", async () => {
		const env = setupTestEnvironment("orch-enforce-exec");
		const execCtx = createMockPluginContext({
			testDir: env.testDir,
			agent: "goop-executor-medium",
		});

		const hooks = createOrchestratorEnforcementHook(execCtx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: "src/hooks/index.ts" }),
			output,
		);

		expect(output.status).toBe("ask");
		env.cleanup();
	});

	it("allows agents with no identity to write files", async () => {
		const env = setupTestEnvironment("orch-enforce-none");
		const noAgentCtx = createMockPluginContext({
			testDir: env.testDir,
			agent: undefined,
		});

		const hooks = createOrchestratorEnforcementHook(noAgentCtx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: "src/hooks/index.ts" }),
			output,
		);

		expect(output.status).toBe("ask");
		env.cleanup();
	});

	// -----------------------------------------------------------------------
	// Non-write permissions — pass through
	// -----------------------------------------------------------------------

	it("allows orchestrator to read implementation files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "read", pattern: "src/hooks/index.ts" }),
			output,
		);

		expect(output.status).toBe("ask");
	});

	it("allows orchestrator to list directories", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "list", pattern: "src/" }),
			output,
		);

		expect(output.status).toBe("ask");
	});

	// -----------------------------------------------------------------------
	// Graceful degradation
	// -----------------------------------------------------------------------

	it("handles permission with no pattern gracefully", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: undefined, title: "" }),
			output,
		);

		// No pattern and empty title — nothing to classify as implementation
		expect(output.status).toBe("ask");
	});

	it("handles permission with empty string pattern", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: "", title: "Edit file" }),
			output,
		);

		expect(output.status).toBe("ask");
	});

	it("does not throw on malformed input", async () => {
		const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		// Pass a completely empty object — safeHandler should catch any errors
		await hooks["permission.ask"]?.({} as unknown as SdkPermission, output);

		// Should not have changed status (no crash, graceful pass-through)
		expect(output.status).toBe("ask");
		consoleSpy.mockRestore();
	});

	// -----------------------------------------------------------------------
	// Edge cases: code extensions without prefix
	// -----------------------------------------------------------------------

	it("blocks orchestrator from writing root-level .ts files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: "index.ts" }),
			output,
		);

		// isImplementationFile returns true for .ts extension even without prefix
		expect(output.status).toBe("deny");
	});

	it("allows orchestrator to write non-code config files", async () => {
		const hooks = createOrchestratorEnforcementHook(ctx);
		const output = makeOutput();

		await hooks["permission.ask"]?.(
			makePermission({ type: "edit", pattern: "biome.json" }),
			output,
		);

		expect(output.status).toBe("ask");
	});
});
