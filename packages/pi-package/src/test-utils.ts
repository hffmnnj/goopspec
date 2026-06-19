/**
 * Shared test utilities for @goopspec/pi-package.
 *
 * Provides temp directory setup, mock Pi extension API, and mock context
 * factories used across all co-located test files.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	GoopPiContext,
	PiCommand,
	PiExtensionAPI,
	PiTool,
} from "./core/types.js";

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

/** Create a temp dir with `.goopspec` structure for tests. */
export function setupTestEnvironment(prefix: string): {
	testDir: string;
	cleanup: () => void;
} {
	const testDir = path.join(
		os.tmpdir(),
		`goopspec-pi-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	fs.mkdirSync(path.join(testDir, ".goopspec"), { recursive: true });
	return {
		testDir,
		cleanup: () => {
			fs.rmSync(testDir, { recursive: true, force: true });
		},
	};
}

// ---------------------------------------------------------------------------
// Mock GoopPiContext
// ---------------------------------------------------------------------------

/** Create a mock GoopPiContext for tests. */
export function createMockPiContext(opts: {
	testDir: string;
	runtime?: "pi" | "omp";
}): GoopPiContext {
	return {
		projectDir: opts.testDir,
		runtime: opts.runtime ?? "pi",
		dbPath: path.join(opts.testDir, ".goopspec", "goopspec.db"),
		goopspecDir: path.join(opts.testDir, ".goopspec"),
	};
}

// ---------------------------------------------------------------------------
// Mock Pi Extension API
// ---------------------------------------------------------------------------

/**
 * Mock Pi extension API that records all registrations.
 *
 * Use the `getRegistered*` methods to inspect what was registered.
 */
export function createMockPiApi(): PiExtensionAPI & {
	getRegisteredTools: () => PiTool[];
	getRegisteredToolNames: () => string[];
	getRegisteredCommands: () => Map<string, PiCommand>;
	getRegisteredCommandNames: () => string[];
	getRegisteredEvents: () => string[];
} {
	const tools: PiTool[] = [];
	const commands = new Map<string, PiCommand>();
	const events: string[] = [];

	return {
		registerTool: (tool: PiTool) => {
			tools.push(tool);
		},
		registerCommand: (name: string, def: PiCommand) => {
			commands.set(name, def);
		},
		on: (event: string, _handler: unknown) => {
			events.push(event);
		},
		events: {
			emit: () => {},
			on: () => {},
		},
		getRegisteredTools: () => tools,
		getRegisteredToolNames: () => tools.map((t) => t.name),
		getRegisteredCommands: () => commands,
		getRegisteredCommandNames: () => [...commands.keys()],
		getRegisteredEvents: () => events,
	};
}
