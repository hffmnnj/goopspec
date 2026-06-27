import type { OpenCodeClient } from "./types.js";

export type ConfigSource = "built-in" | "global" | "internal" | "project";

/** Mirrors the plugin GoopConfig interface. */
export interface GoopSpecConfig {
	projectName?: string;
	defaultModel?: string;
	agentModels?: Record<string, string>;
	agentThinkingBudgets?: Record<string, number>;
	memoryEnabled?: boolean;
	gitignoreGoopspec?: boolean;
	enforcement?: "assist" | "warn" | "strict";
	adlEnabled?: boolean;
}

export interface SourcedValue<T> {
	value: T;
	source: ConfigSource;
}

export interface MergedGoopSpecConfig {
	raw: GoopSpecConfig;
	sources: Partial<Record<keyof GoopSpecConfig, ConfigSource>>;
}

const CONFIG_PATHS = {
	internal: ".goopspec/config.json",
	project: "goopspec.json",
} as const;

async function tryReadJson(
	client: OpenCodeClient,
	path: string,
): Promise<Record<string, unknown> | null> {
	try {
		const text = await client.readFile(path);
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function normalizeRaw(raw: Record<string, unknown>): GoopSpecConfig {
	const cfg: GoopSpecConfig = {};
	if (typeof raw.projectName === "string") cfg.projectName = raw.projectName;
	if (typeof raw.defaultModel === "string") cfg.defaultModel = raw.defaultModel;
	if (typeof raw.memoryEnabled === "boolean")
		cfg.memoryEnabled = raw.memoryEnabled;
	if (typeof raw.gitignoreGoopspec === "boolean")
		cfg.gitignoreGoopspec = raw.gitignoreGoopspec;
	if (typeof raw.adlEnabled === "boolean") cfg.adlEnabled = raw.adlEnabled;
	if (
		typeof raw.enforcement === "string" &&
		["assist", "warn", "strict"].includes(raw.enforcement)
	) {
		cfg.enforcement = raw.enforcement as GoopSpecConfig["enforcement"];
	}
	if (raw.agentModels && typeof raw.agentModels === "object") {
		cfg.agentModels = {};
		for (const [k, v] of Object.entries(
			raw.agentModels as Record<string, unknown>,
		)) {
			if (typeof v === "string") cfg.agentModels[k] = v;
		}
	}
	if (
		raw.agentThinkingBudgets &&
		typeof raw.agentThinkingBudgets === "object"
	) {
		cfg.agentThinkingBudgets = {};
		for (const [k, v] of Object.entries(
			raw.agentThinkingBudgets as Record<string, unknown>,
		)) {
			if (typeof v === "number") cfg.agentThinkingBudgets[k] = v;
		}
	}
	return cfg;
}

// ---- Public API -----------------------------------------------------------

/**
 * Load and merge GoopSpec config from readable sources (internal + project).
 * Global (~/.config/opencode/goopspec.json) is NOT readable from the browser.
 * Returns merged config and per-field source tracking.
 */
export async function loadMergedGoopspecConfig(
	client: OpenCodeClient,
): Promise<MergedGoopSpecConfig> {
	const internalRaw = await tryReadJson(client, CONFIG_PATHS.internal);
	const projectRaw = await tryReadJson(client, CONFIG_PATHS.project);

	const internal = internalRaw ? normalizeRaw(internalRaw) : {};
	const project = projectRaw ? normalizeRaw(projectRaw) : {};

	const internalModels = internal.agentModels;
	const projectModels = project.agentModels;
	const internalBudgets = internal.agentThinkingBudgets;
	const projectBudgets = project.agentThinkingBudgets;
	const mergedModels =
		internalModels || projectModels
			? { ...(internalModels ?? {}), ...(projectModels ?? {}) }
			: undefined;
	const mergedBudgets =
		internalBudgets || projectBudgets
			? { ...(internalBudgets ?? {}), ...(projectBudgets ?? {}) }
			: undefined;

	// Merge: internal is base, project overrides (mirrors plugin loadMergedConfig priority)
	const raw: GoopSpecConfig = {
		...internal,
		...project,
		agentModels: mergedModels,
		agentThinkingBudgets: mergedBudgets,
	};

	// Source tracking per scalar field
	const sources: MergedGoopSpecConfig["sources"] = {};
	const scalarFields: Array<keyof GoopSpecConfig> = [
		"projectName",
		"defaultModel",
		"memoryEnabled",
		"gitignoreGoopspec",
		"enforcement",
		"adlEnabled",
	];
	for (const field of scalarFields) {
		if (project[field] !== undefined) {
			sources[field] = "project";
		} else if (internal[field] !== undefined) {
			sources[field] = "internal";
		}
		// else: 'built-in' (no explicit assignment — callers show "built-in" when source is undefined)
	}

	return { raw, sources };
}

/**
 * Save GoopSpec config via PATCH /config with the goopspec namespace key.
 * This is the PRIMARY write-back path (Option B).
 *
 * The patch merges: reads existing goopspec namespace from getConfig(),
 * merges with updates, then PATCHes back.
 */
export async function saveGoopspecConfig(
	client: OpenCodeClient,
	updates: Partial<GoopSpecConfig>,
): Promise<void> {
	// Read current config to preserve other namespace values
	const current = await client.getConfig();
	const existingGoopspec =
		(current.goopspec as GoopSpecConfig | undefined) ?? {};

	const merged: GoopSpecConfig = {
		...existingGoopspec,
		...updates,
		// Deep-merge maps
		agentModels:
			updates.agentModels !== undefined
				? { ...(existingGoopspec.agentModels ?? {}), ...updates.agentModels }
				: existingGoopspec.agentModels,
		agentThinkingBudgets:
			updates.agentThinkingBudgets !== undefined
				? {
						...(existingGoopspec.agentThinkingBudgets ?? {}),
						...updates.agentThinkingBudgets,
					}
				: existingGoopspec.agentThinkingBudgets,
	};

	await client.updateConfig({ goopspec: merged });
}

export function toGoopspecJson(config: GoopSpecConfig): string {
	return JSON.stringify(config, null, 2);
}

export async function copyGoopspecJson(
	config: GoopSpecConfig,
): Promise<boolean> {
	const json = toGoopspecJson(config);
	try {
		await navigator.clipboard.writeText(json);
		return true;
	} catch {
		return false;
	}
}

export function sourceLabel(source: ConfigSource | undefined): string {
	if (source === "built-in" || source === undefined) return "built-in";
	if (source === "global") return "~/.config/opencode/goopspec.json";
	if (source === "internal") return ".goopspec/config.json";
	return "goopspec.json";
}
