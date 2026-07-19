import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GOOPSPEC_DIR } from "../../core/constants.js";
import type { PluginContext } from "../../test-utils.js";
import {
	createMockPluginContext,
	createMockToolContext,
	setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopSpecTool } from "./index.js";

describe("goop_spec tool", () => {
	let ctx: PluginContext;
	let cleanup: () => void;
	let testDir: string;

	beforeEach(() => {
		const env = setupTestEnvironment("goop-spec");
		cleanup = env.cleanup;
		testDir = env.testDir;
		ctx = createMockPluginContext({ testDir });
	});

	afterEach(() => cleanup());

	const toolCtx = createMockToolContext();

	// -----------------------------------------------------------------------
	// list action
	// -----------------------------------------------------------------------

	describe("action: list", () => {
		it("lists workflows with doc presence", async () => {
			// The default workflow has no docs yet
			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "list" }, toolCtx);

			expect(result).toContain("Workflow Documents");
			expect(result).toContain("default");
			expect(result).toContain("active");
		});

		it("shows SPEC.md and BLUEPRINT.md when present", async () => {
			// Default workflow docs live in .goopspec/ root (not .goopspec/default/)
			const docDir = join(testDir, GOOPSPEC_DIR);
			writeFileSync(
				join(docDir, "SPEC.md"),
				"# Spec\n## Must-Haves\n",
				"utf-8",
			);
			writeFileSync(join(docDir, "BLUEPRINT.md"), "# Blueprint\n", "utf-8");

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "list" }, toolCtx);

			expect(result).toContain("SPEC.md");
			expect(result).toContain("BLUEPRINT.md");
		});

		it("lists multiple workflows", async () => {
			ctx.stateManager.createWorkflow("feat-auth");
			const wfDir = join(testDir, GOOPSPEC_DIR, "feat-auth");
			mkdirSync(wfDir, { recursive: true });
			writeFileSync(join(wfDir, "SPEC.md"), "# Auth Spec", "utf-8");

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "list" }, toolCtx);

			expect(result).toContain("default");
			expect(result).toContain("feat-auth");
		});
	});

	// -----------------------------------------------------------------------
	// read action
	// -----------------------------------------------------------------------

	describe("action: read", () => {
		it("reads SPEC.md when file=spec", async () => {
			const docDir = join(testDir, GOOPSPEC_DIR);
			writeFileSync(
				join(docDir, "SPEC.md"),
				"# My Spec\nContent here.",
				"utf-8",
			);

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute(
				{ action: "read", file: "spec" },
				toolCtx,
			);

			expect(result).toContain("# SPEC.md");
			expect(result).toContain("Content here.");
			expect(result).not.toContain("BLUEPRINT.md");
		});

		it("reads BLUEPRINT.md when file=plan", async () => {
			const docDir = join(testDir, GOOPSPEC_DIR);
			writeFileSync(
				join(docDir, "BLUEPRINT.md"),
				"# My Plan\nWave 1.",
				"utf-8",
			);

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute(
				{ action: "read", file: "plan" },
				toolCtx,
			);

			expect(result).toContain("# BLUEPRINT.md");
			expect(result).toContain("Wave 1.");
			expect(result).not.toContain("# SPEC.md");
		});

		it("reads both by default", async () => {
			const docDir = join(testDir, GOOPSPEC_DIR);
			writeFileSync(join(docDir, "SPEC.md"), "Spec content", "utf-8");
			writeFileSync(join(docDir, "BLUEPRINT.md"), "Plan content", "utf-8");

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "read" }, toolCtx);

			expect(result).toContain("# SPEC.md");
			expect(result).toContain("Spec content");
			expect(result).toContain("# BLUEPRINT.md");
			expect(result).toContain("Plan content");
		});

		it("reports missing files gracefully", async () => {
			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute(
				{ action: "read", file: "spec" },
				toolCtx,
			);

			expect(result).toContain("not found");
		});

		it("reads from non-default workflow doc dir", async () => {
			ctx.stateManager.createWorkflow("feat-auth");
			ctx.stateManager.setActiveWorkflow("feat-auth");

			const wfDir = join(testDir, GOOPSPEC_DIR, "feat-auth");
			mkdirSync(wfDir, { recursive: true });
			writeFileSync(join(wfDir, "SPEC.md"), "Auth spec content", "utf-8");

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute(
				{ action: "read", file: "spec" },
				toolCtx,
			);

			expect(result).toContain("Auth spec content");
		});
	});

	// -----------------------------------------------------------------------
	// validate action
	// -----------------------------------------------------------------------

	describe("action: validate", () => {
		it("reports VALID when all sections present", async () => {
			const docDir = join(testDir, GOOPSPEC_DIR);
			const workflowId = ctx.stateManager.getActiveWorkflowId();
			const specContent = [
				"# SPEC",
				"## Must-Haves",
				"### MH1: Something",
				"## Out of Scope",
				"## Acceptance Criteria",
			].join("\n");
			const planContent = [
				"# BLUEPRINT",
				"## Overview",
				"Goal and approach.",
				"## Risk Assessment",
				"Low risk.",
				"## Deviation Protocol",
				"Follow the rules.",
			].join("\n");

			writeFileSync(join(docDir, "SPEC.md"), specContent, "utf-8");
			writeFileSync(join(docDir, "BLUEPRINT.md"), planContent, "utf-8");

			ctx.db.upsertWave(workflowId, {
				wave_number: 1,
				title: "Wave one",
				status: "pending",
			});

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "validate" }, toolCtx);

			expect(result).toContain("VALID");
			expect(result).not.toContain("ISSUES FOUND");
		});

		it("reports missing SPEC.md sections", async () => {
			const docDir = join(testDir, GOOPSPEC_DIR);
			writeFileSync(join(docDir, "SPEC.md"), "# Spec\nSome content.", "utf-8");
			writeFileSync(
				join(docDir, "BLUEPRINT.md"),
				"# Plan\n## Wave 1\n## Spec Mapping\nMH1",
				"utf-8",
			);

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "validate" }, toolCtx);

			expect(result).toContain("ISSUES FOUND");
			expect(result).toContain("Must-Haves");
		});

		it("reports missing BLUEPRINT.md", async () => {
			const docDir = join(testDir, GOOPSPEC_DIR);
			writeFileSync(
				join(docDir, "SPEC.md"),
				"# Spec\n## Must-Haves\n### MH1: X\n## Out of Scope\n## Acceptance Criteria",
				"utf-8",
			);

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "validate" }, toolCtx);

			expect(result).toContain("ISSUES FOUND");
			expect(result).toContain("BLUEPRINT.md not found");
		});

		it("reports missing wave rows when blueprint is otherwise valid", async () => {
			const docDir = join(testDir, GOOPSPEC_DIR);
			writeFileSync(
				join(docDir, "SPEC.md"),
				"# Spec\n## Must-Haves\n### MH1: X\n## Out of Scope\n## Acceptance Criteria",
				"utf-8",
			);
			writeFileSync(
				join(docDir, "BLUEPRINT.md"),
				[
					"# Plan",
					"## Overview",
					"Goal and approach.",
					"## Risk Assessment",
					"Low risk.",
					"## Deviation Protocol",
					"Follow the rules.",
				].join("\n"),
				"utf-8",
			);

			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "validate" }, toolCtx);

			expect(result).toContain("ISSUES FOUND");
			expect(result).toContain("No waves found");
			expect(result).toContain("goop_write_wave");
		});

		it("reports both files missing", async () => {
			const tool = createGoopSpecTool(ctx);
			const result = await tool.execute({ action: "validate" }, toolCtx);

			expect(result).toContain("ISSUES FOUND");
			expect(result).toContain("SPEC.md not found");
			expect(result).toContain("BLUEPRINT.md not found");
		});
	});

	// -----------------------------------------------------------------------
	// error handling
	// -----------------------------------------------------------------------

	it("handles errors gracefully", async () => {
		// Force an error by making stateManager throw
		const broken = createMockPluginContext({ testDir });
		broken.stateManager.getActiveWorkflowId = () => {
			throw new Error("state corrupted");
		};

		const tool = createGoopSpecTool(broken);
		const result = await tool.execute({ action: "read" }, toolCtx);

		expect(result).toContain("Error in goop_spec");
		expect(result).toContain("state corrupted");
	});
});
