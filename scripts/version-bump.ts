/// <reference types="bun-types" />

import { ensurePosixPath } from "../src/shared/platform.js";

type CliOptions = {
  version?: string;
  dryRun: boolean;
  help: boolean;
};

type UpdateResult = {
  content: string;
  changeCount: number;
};

type UpdatePattern = {
  name: string;
  regex: RegExp;
};

type PatternRegistryEntry = {
  name: string;
  match: (filePath: string) => boolean;
  patterns: UpdatePattern[];
};

class UsageError extends Error {
  override name = "UsageError";
}

const USAGE = `Usage: bun scripts/version-bump.ts <version> [--dry-run]

Options:
  --dry-run    Preview changes without writing
  --help       Show this help message

Examples:
  bun scripts/version-bump.ts 0.2.0 --dry-run
`;

const FILE_PATTERNS = [
  "*.example.json",
  "src/**/*.ts",
];

const EXPLICIT_FILES = ["package.json", "README.md"];

const JSON_VERSION_PATTERN: UpdatePattern = {
  name: "json-version-field",
  regex: /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/g,
};

const BADGE_URL_PATTERN: UpdatePattern = {
  name: "badge-url-version",
  regex: /(version-)(\d+\.\d+\.\d+)(-[a-z]+)/g,
};

const PATTERN_REGISTRY: PatternRegistryEntry[] = [
  {
    name: "json-config",
    match: (filePath) =>
      filePath === "package.json" || filePath.endsWith(".example.json"),
    patterns: [JSON_VERSION_PATTERN],
  },
  {
    name: "readme-badge",
    match: (filePath) => filePath === "README.md",
    patterns: [BADGE_URL_PATTERN],
  },
];

const knownFlags = new Set(["--dry-run", "--help", "-h"]);
const supportsColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const colorize = {
  green: (value: string) => (supportsColor ? `\x1b[32m${value}\x1b[0m` : value),
  yellow: (value: string) => (supportsColor ? `\x1b[33m${value}\x1b[0m` : value),
  red: (value: string) => (supportsColor ? `\x1b[31m${value}\x1b[0m` : value),
  dim: (value: string) => (supportsColor ? `\x1b[2m${value}\x1b[0m` : value),
};

function parseArgs(args: string[]): CliOptions {
  let version: string | undefined;
  let dryRun = false;
  let help = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg.startsWith("-")) {
      if (!knownFlags.has(arg)) {
        throw new UsageError(`Unknown flag: ${arg}`);
      }
      continue;
    }
    if (!version) {
      version = arg;
      continue;
    }
    throw new UsageError(`Unexpected argument: ${arg}`);
    }
  
  return { version, dryRun, help };
}

function formatCount(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function printUsageError(message: string): void {
  console.error(colorize.red(`Error: ${message}`));
  console.error("");
  console.error(USAGE);
}

function normalizePath(path: string): string {
  return ensurePosixPath(path);
}

function shouldExclude(path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized.includes("/node_modules/")) {
    return true;
  }
  if (normalized.includes("/dist/")) {
    return true;
  }
  if (normalized.includes("/.goopspec/archive/")) {
    return true;
  }
  if (normalized.endsWith(".test.ts")) {
    return true;
  }
  return false;
}

async function readPackageVersion(): Promise<string> {
  const packageFile = Bun.file("package.json");
  if (!(await packageFile.exists())) {
    throw new Error("package.json not found");
  }
  const text = await packageFile.text();
  const parsed = JSON.parse(text) as { version?: string };
  if (!parsed.version) {
    throw new Error("package.json missing version field");
  }
  return parsed.version;
}

async function discoverFiles(): Promise<string[]> {
  const discovered = new Set<string>();

  for (const file of EXPLICIT_FILES) {
    if (!shouldExclude(file)) {
      discovered.add(file);
    }
  }

  for (const pattern of FILE_PATTERNS) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan({ cwd: ".", onlyFiles: true })) {
      if (!shouldExclude(file)) {
        discovered.add(file);
      }
    }
  }

  return Array.from(discovered).sort();
}

function applyPattern(
  content: string,
  fromVersion: string,
  toVersion: string,
  pattern: UpdatePattern,
): UpdateResult {
  let changeCount = 0;
  const updated = content.replace(
    pattern.regex,
    (match, prefix: string, version: string, suffix: string) => {
      if (version !== fromVersion) {
        return match;
      }
      changeCount += 1;
      return `${prefix}${toVersion}${suffix}`;
    },
  );

  return { content: updated, changeCount };
}

function resolvePatterns(filePath: string): UpdatePattern[] {
  const patterns: UpdatePattern[] = [];
  for (const entry of PATTERN_REGISTRY) {
    if (entry.match(filePath)) {
      patterns.push(...entry.patterns);
    }
  }
  return patterns;
}

function applyPatterns(
  filePath: string,
  content: string,
  fromVersion: string,
  toVersion: string,
): UpdateResult {
  const patterns = resolvePatterns(filePath);
  let updated = content;
  let changeCount = 0;

  for (const pattern of patterns) {
    const result = applyPattern(updated, fromVersion, toVersion, pattern);
    updated = result.content;
    changeCount += result.changeCount;
  }

  return { content: updated, changeCount };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (!args.version) {
    printUsageError("version argument is required.");
    process.exit(1);
    return;
  }

  const currentVersion = await readPackageVersion();
  const targetVersion = args.version;

  if (currentVersion === targetVersion) {
    console.log(colorize.yellow("Warning: target version matches current version."));
  }

  console.log(`Current version: ${colorize.dim(currentVersion)}`);
  console.log(`Target version: ${colorize.dim(targetVersion)}`);

  const files = await discoverFiles();
  console.log(`Discovered ${formatCount(files.length, "file")}.`);

  let updatedFiles = 0;
  let totalChanges = 0;
  const changedEntries: Array<{ path: string; changeCount: number }> = [];

  for (const filePath of files) {
    const file = Bun.file(filePath);
    const original = await file.text();
    const { content: updated, changeCount } = applyPatterns(
      filePath,
      original,
      currentVersion,
      targetVersion,
    );

    if (changeCount > 0) {
      updatedFiles += 1;
      totalChanges += changeCount;
      changedEntries.push({ path: filePath, changeCount });
      if (!args.dryRun) {
        await Bun.write(filePath, updated);
      }
    }
  }

  if (args.dryRun) {
    if (changedEntries.length === 0) {
      console.log(colorize.yellow("Dry run: no matching version strings found."));
    } else {
      console.log(colorize.yellow("Dry run preview:"));
      for (const entry of changedEntries) {
        console.log(
          `${colorize.yellow("- Would update")}: ${entry.path} (${formatCount(
            entry.changeCount,
            "change",
          )})`,
        );
      }
    }
    console.log(colorize.yellow("Dry run: no files were written."));
  } else if (changedEntries.length > 0) {
    for (const entry of changedEntries) {
      console.log(
        `${colorize.green("- Updated")}: ${entry.path} (${formatCount(
          entry.changeCount,
          "change",
        )})`,
      );
    }
  }

  console.log(`Files updated: ${colorize.green(String(updatedFiles))}`);
  console.log(`Total changes: ${colorize.green(String(totalChanges))}`);
}

try {
  await run();
} catch (error) {
  if (error instanceof UsageError) {
    printUsageError(error.message);
    process.exit(1);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(colorize.red(`Error: ${message}`));
  process.exit(1);
}

export {};
