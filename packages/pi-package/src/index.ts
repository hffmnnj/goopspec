// @goopspec/pi-package — GoopSpec five-phase workflow orchestration for Pi agent.
// Pi extension entry point loaded via jiti (in-process TypeScript).

import { registerCommands } from "./commands/index.js";
import type { PiExtensionAPI, PiTool } from "./core/types.js";
import { detectRuntime } from "./features/runtime/index.js";
import type { EventRegistrar } from "./hooks/index.js";
import { registerHooks } from "./hooks/index.js";
import { log } from "./shared/logger.js";
import { getDbPath, getGoopspecDir } from "./shared/paths.js";
import { createGoopReadDbTool } from "./tools/goop-read-db/index.js";
import { createGoopSaveNoteTool } from "./tools/goop-save-note/index.js";
import { createGoopSearchNotesTool } from "./tools/goop-search-notes/index.js";
import { createGoopStateTool } from "./tools/goop-state/index.js";
import { createGoopTaskTool } from "./tools/goop-task/index.js";
import { createGoopWebSearchTool } from "./tools/goop-web-search/index.js";
import { createGoopWriteDbTool } from "./tools/goop-write-db/index.js";

const VERSION = "0.1.0";

/**
 * GoopSpec Pi extension factory.
 * Registers 7 tools, 5 commands, and 2 lifecycle hooks.
 */
export default function goopspec(pi: PiExtensionAPI): void {
	const projectDir = process.cwd();
	const { runtime } = detectRuntime();
	const dbPath = getDbPath(projectDir);
	const goopspecDir = getGoopspecDir(projectDir);

	const ctx = { projectDir, runtime, dbPath, goopspecDir };

	log("GoopSpec Pi extension loading", {
		version: VERSION,
		runtime,
		projectDir,
	});

	// 7 tools — cast needed because tool factories use typed args while PiTool uses unknown params.
	// Pi validates via TypeBox before calling execute, so the runtime behavior is correct.
	pi.registerTool(createGoopReadDbTool(ctx) as PiTool);
	pi.registerTool(createGoopWriteDbTool(ctx) as PiTool);
	pi.registerTool(createGoopSaveNoteTool(ctx) as PiTool);
	pi.registerTool(createGoopSearchNotesTool(ctx) as PiTool);
	pi.registerTool(createGoopStateTool(ctx) as PiTool);
	pi.registerTool(createGoopTaskTool(ctx) as PiTool);
	pi.registerTool(createGoopWebSearchTool(ctx) as PiTool);

	// 5 commands
	registerCommands(pi, ctx);

	// 2 hooks — EventRegistrar uses a wider handler type than PiExtensionAPI.on
	registerHooks(pi as unknown as EventRegistrar, ctx);

	log("GoopSpec Pi extension loaded", { tools: 7, commands: 5, hooks: 2 });
}

export { goopspec };
