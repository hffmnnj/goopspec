import type { OpenCodeClient } from "./types.js";

export type ConfigSource = "built-in" | "global" | "internal" | "project";

/**
 * Per-project override block stored under the `projects` namespace.
 *
 * The plugin `GoopConfig` is a flat, repo-wide shape with no per-project
 * scoping. To support a per-project Settings page (MH3) without a plugin-side
 * schema change, project-scoped overrides are persisted under
 * `projects[projectId]` inside the same `goopspec` config namespace. Project
 * values win over the repo-wide values when loading for a given project.
 */
export interface ProjectScopedConfig {
	/** Default agent id for this project (falls back to global default). */
	defaultAgent?: string;
	/** Per-role model routing overrides scoped to this project. */
	agentModels?: Record<string, string>;
	/** Per-role thinking-budget overrides scoped to this project. */
	agentThinkingBudgets?: Record<string, number>;
}

/** Mirrors the plugin GoopConfig interface. */
export interface GoopSpecConfig {
	projectName?: string;
	defaultModel?: string;
	/** Repo-wide default agent id (global default agent selection). */
	defaultAgent?: string;
	agentModels?: Record<string, string>;
	agentThinkingBudgets?: Record<string, number>;
	memoryEnabled?: boolean;
	gitignoreGoopspec?: boolean;
	enforcement?: "assist" | "warn" | "strict";
	adlEnabled?: boolean;
	/**
	 * Per-project override blocks keyed by project id. Read/written by the
	 * `/[project]/settings` pages; ignored by the flat plugin GoopConfig.
	 */
	projects?: Record<string, ProjectScopedConfig>;
}

export interface SourcedValue<T> {
	value: T;
	source: ConfigSource;
}

export interface MergedGoopSpecConfig {
	raw: GoopSpecConfig;
	sources: Partial<Record<keyof GoopSpecConfig, ConfigSource>>;
	/**
	 * Per-role winning source for `agentModels` entries. A role appears here only
	 * when an explicit override exists in a readable source (project wins over
	 * internal). Roles absent from this map fall back to "built-in".
	 */
	agentModelSources: Record<string, ConfigSource>;
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
	if (typeof raw.defaultAgent === "string") cfg.defaultAgent = raw.defaultAgent;
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
	if (raw.projects && typeof raw.projects === "object") {
		cfg.projects = {};
		for (const [projectId, block] of Object.entries(
			raw.projects as Record<string, unknown>,
		)) {
			if (block && typeof block === "object") {
				cfg.projects[projectId] = normalizeProjectScoped(
					block as Record<string, unknown>,
				);
			}
		}
	}
	return cfg;
}

function normalizeProjectScoped(
	raw: Record<string, unknown>,
): ProjectScopedConfig {
	const block: ProjectScopedConfig = {};
	if (typeof raw.defaultAgent === "string") block.defaultAgent = raw.defaultAgent;
	if (raw.agentModels && typeof raw.agentModels === "object") {
		block.agentModels = {};
		for (const [k, v] of Object.entries(
			raw.agentModels as Record<string, unknown>,
		)) {
			if (typeof v === "string") block.agentModels[k] = v;
		}
	}
	if (raw.agentThinkingBudgets && typeof raw.agentThinkingBudgets === "object") {
		block.agentThinkingBudgets = {};
		for (const [k, v] of Object.entries(
			raw.agentThinkingBudgets as Record<string, unknown>,
		)) {
			if (typeof v === "number") block.agentThinkingBudgets[k] = v;
		}
	}
	return block;
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

	// Per-role agentModels source: project override wins over internal.
	const agentModelSources: Record<string, ConfigSource> = {};
	for (const role of Object.keys(internalModels ?? {})) {
		agentModelSources[role] = "internal";
	}
	for (const role of Object.keys(projectModels ?? {})) {
		agentModelSources[role] = "project";
	}

	return { raw, sources, agentModelSources };
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

// ---- Project-scoped config (MH3) ------------------------------------------

/**
 * Merged config for a single project: project-level overrides
 * (`projects[projectId]`) layered over the repo-wide merged config.
 */
export interface MergedProjectConfig extends MergedGoopSpecConfig {
	/** The project this view is scoped to. */
	projectId: string;
	/** Effective default agent: project override > global > undefined. */
	defaultAgent?: string;
	/** Source of the winning default-agent value. */
	defaultAgentSource: ConfigSource;
}

/**
 * Load config scoped to a project. Effective values resolve in the order
 * project override -> repo-wide config -> built-in. `agentModelSources`
 * reports "project" for roles overridden in the project block.
 */
export async function loadProjectGoopspecConfig(
	client: OpenCodeClient,
	projectId: string,
): Promise<MergedProjectConfig> {
	const base = await loadMergedGoopspecConfig(client);
	const projectBlock = base.raw.projects?.[projectId] ?? {};

	const mergedAgentModels =
		base.raw.agentModels || projectBlock.agentModels
			? {
					...(base.raw.agentModels ?? {}),
					...(projectBlock.agentModels ?? {}),
				}
			: undefined;
	const mergedBudgets =
		base.raw.agentThinkingBudgets || projectBlock.agentThinkingBudgets
			? {
					...(base.raw.agentThinkingBudgets ?? {}),
					...(projectBlock.agentThinkingBudgets ?? {}),
				}
			: undefined;

	const raw: GoopSpecConfig = {
		...base.raw,
		agentModels: mergedAgentModels,
		agentThinkingBudgets: mergedBudgets,
	};

	// Roles present in the project block win and are marked "project".
	const agentModelSources: Record<string, ConfigSource> = {
		...base.agentModelSources,
	};
	for (const role of Object.keys(projectBlock.agentModels ?? {})) {
		agentModelSources[role] = "project";
	}

	const defaultAgent = projectBlock.defaultAgent ?? base.raw.defaultAgent;
	const defaultAgentSource: ConfigSource = projectBlock.defaultAgent
		? "project"
		: base.raw.defaultAgent
			? base.sources.defaultAgent ?? "internal"
			: "built-in";

	return {
		projectId,
		raw,
		sources: base.sources,
		agentModelSources,
		defaultAgent,
		defaultAgentSource,
	};
}

/**
 * Persist project-scoped overrides under `projects[projectId]`. Only the
 * supplied keys are written; existing project and namespace values are
 * preserved via deep merge.
 */
export async function saveProjectGoopspecConfig(
	client: OpenCodeClient,
	projectId: string,
	updates: ProjectScopedConfig,
): Promise<void> {
	const current = await client.getConfig();
	const existingGoopspec =
		(current.goopspec as GoopSpecConfig | undefined) ?? {};
	const existingProjects = existingGoopspec.projects ?? {};
	const existingBlock = existingProjects[projectId] ?? {};

	const mergedBlock: ProjectScopedConfig = {
		...existingBlock,
		...updates,
		agentModels:
			updates.agentModels !== undefined
				? { ...(existingBlock.agentModels ?? {}), ...updates.agentModels }
				: existingBlock.agentModels,
		agentThinkingBudgets:
			updates.agentThinkingBudgets !== undefined
				? {
						...(existingBlock.agentThinkingBudgets ?? {}),
						...updates.agentThinkingBudgets,
					}
				: existingBlock.agentThinkingBudgets,
	};

	const merged: GoopSpecConfig = {
		...existingGoopspec,
		projects: { ...existingProjects, [projectId]: mergedBlock },
	};

	await client.updateConfig({ goopspec: merged });
}

/**
 * Replace (not merge) the `agentModels` block for a project. Unlike
 * {@link saveProjectGoopspecConfig}, which deep-merges and so cannot remove a
 * role, this rewrites the whole map — required so the models page can drop a
 * role back to the global default. Blank values are stripped; an empty result
 * deletes the `agentModels` key while preserving the project's other fields.
 */
export async function replaceProjectAgentModels(
	client: OpenCodeClient,
	projectId: string,
	agentModels: Record<string, string>,
): Promise<void> {
	const current = await client.getConfig();
	const existingGoopspec =
		(current.goopspec as GoopSpecConfig | undefined) ?? {};
	const existingProjects = existingGoopspec.projects ?? {};
	const existingBlock = existingProjects[projectId] ?? {};

	const cleaned: Record<string, string> = {};
	for (const [role, value] of Object.entries(agentModels)) {
		if (typeof value === "string" && value.trim() !== "") cleaned[role] = value;
	}

	const nextBlock: ProjectScopedConfig = { ...existingBlock };
	if (Object.keys(cleaned).length === 0) {
		delete nextBlock.agentModels;
	} else {
		nextBlock.agentModels = cleaned;
	}

	const merged: GoopSpecConfig = {
		...existingGoopspec,
		projects: { ...existingProjects, [projectId]: nextBlock },
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
