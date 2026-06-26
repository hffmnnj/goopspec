import fs from "node:fs/promises";
import path from "node:path";

export type UninstallTier =
	| "config-only"
	| "config-and-data"
	| "config-data-and-dashboard";

export interface RemovalTarget {
	path: string;
	description: string;
	isDirectory: boolean;
}

const GOOPSPEC_DIR = ".goopspec";
const WEBFRONT_DIST = path.join("packages", "webfront", "dist");
const WEBFRONT_NODE_MODULES = path.join("packages", "webfront", "node_modules");
const WORKFLOW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KNOWN_GOOPSPEC_FILES = new Set([
	"config.json",
	"goopspec.db",
	"memory.db",
	"dashboard.pid",
]);

interface CandidateTarget {
	path: string;
	description: string;
}

async function statIfExists(
	targetPath: string,
): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
	try {
		return await fs.stat(path.resolve(process.cwd(), targetPath));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

async function addIfExists(
	targets: RemovalTarget[],
	candidate: CandidateTarget,
): Promise<void> {
	const stat = await statIfExists(candidate.path);
	if (!stat) return;
	targets.push({
		path: candidate.path,
		description: candidate.description,
		isDirectory: stat.isDirectory(),
	});
}

async function collectWorkflowDirs(): Promise<RemovalTarget[]> {
	const goopspecDir = path.resolve(process.cwd(), GOOPSPEC_DIR);
	const stat = await statIfExists(GOOPSPEC_DIR);
	if (!stat?.isDirectory()) return [];

	const entries = await fs.readdir(goopspecDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.filter((entry) => WORKFLOW_ID_PATTERN.test(entry.name))
		.filter((entry) => !KNOWN_GOOPSPEC_FILES.has(entry.name))
		.map((entry) => ({
			path: path.join(GOOPSPEC_DIR, entry.name),
			description: `Workflow history (${entry.name})`,
			isDirectory: true,
		}));
}

async function isGoopSpecMonorepo(): Promise<boolean> {
	const packageJsonPath = path.resolve(process.cwd(), "package.json");
	const webfrontPackagePath = path.resolve(
		process.cwd(),
		"packages",
		"webfront",
		"package.json",
	);

	try {
		const [packageJson, webfrontStat] = await Promise.all([
			fs.readFile(packageJsonPath, "utf8"),
			fs.stat(webfrontPackagePath),
		]);
		const parsed = JSON.parse(packageJson) as {
			name?: unknown;
			workspaces?: unknown;
		};
		return (
			parsed.name === "goopspec" &&
			Array.isArray(parsed.workspaces) &&
			webfrontStat.isFile()
		);
	} catch {
		return false;
	}
}

function isAllowedRemovalPath(targetPath: string): boolean {
	if (path.isAbsolute(targetPath)) return false;
	const normalized = path.normalize(targetPath);
	if (normalized.startsWith("..") || path.isAbsolute(normalized)) return false;

	return (
		normalized === path.join(GOOPSPEC_DIR, "config.json") ||
		normalized === path.join(GOOPSPEC_DIR, "goopspec.db") ||
		normalized === path.join(GOOPSPEC_DIR, "memory.db") ||
		normalized === path.join(GOOPSPEC_DIR, "dashboard.pid") ||
		normalized.startsWith(`${GOOPSPEC_DIR}${path.sep}`) ||
		normalized === WEBFRONT_DIST ||
		normalized === WEBFRONT_NODE_MODULES
	);
}

/**
 * Compute the list of files/dirs that would be removed for the given tier.
 * NEVER includes paths outside .goopspec/ and packages/webfront/dist
 */
export async function planUninstall(
	tier: UninstallTier,
): Promise<RemovalTarget[]> {
	const targets: RemovalTarget[] = [];

	await addIfExists(targets, {
		path: path.join(GOOPSPEC_DIR, "config.json"),
		description: "Configuration file",
	});

	if (tier === "config-only") return targets;

	await addIfExists(targets, {
		path: path.join(GOOPSPEC_DIR, "goopspec.db"),
		description: "Workflow database",
	});
	await addIfExists(targets, {
		path: path.join(GOOPSPEC_DIR, "memory.db"),
		description: "Memory database",
	});
	await addIfExists(targets, {
		path: path.join(GOOPSPEC_DIR, "dashboard.pid"),
		description: "Dashboard process marker",
	});
	targets.push(...(await collectWorkflowDirs()));

	if (tier !== "config-data-and-dashboard") return targets;

	await addIfExists(targets, {
		path: WEBFRONT_DIST,
		description: "Dashboard build artifacts",
	});

	if (await isGoopSpecMonorepo()) {
		await addIfExists(targets, {
			path: WEBFRONT_NODE_MODULES,
			description: "Dashboard dependencies",
		});
	}

	return targets;
}

/**
 * Execute the removal.
 * - Only deletes paths from planUninstall() — no hardcoded paths elsewhere
 * - Progress callback: called with each file/dir as it's removed
 * - Returns list of actually-removed paths
 */
export async function executeUninstall(
	targets: RemovalTarget[],
	onProgress: (target: RemovalTarget, index: number, total: number) => void,
): Promise<string[]> {
	const removed: string[] = [];
	const total = targets.length;

	for (const [index, target] of targets.entries()) {
		if (!isAllowedRemovalPath(target.path)) {
			throw new Error(`Refusing to remove unsafe path: ${target.path}`);
		}

		await fs.rm(path.resolve(process.cwd(), target.path), {
			recursive: true,
			force: true,
		});
		removed.push(target.path);
		onProgress(target, index + 1, total);
	}

	return removed;
}
