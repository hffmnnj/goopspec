import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	executeUninstall,
	planUninstall,
	type RemovalTarget,
} from "./uninstall.js";

describe("uninstall", () => {
	let originalCwd: string;
	let testDir: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		testDir = mkdtempSync(join(tmpdir(), "goopspec-uninstall-test-"));
		process.chdir(testDir);
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(testDir, { recursive: true, force: true });
	});

	it("plans config-only removal with only existing config.json", async () => {
		mkdirSync(join(testDir, ".goopspec"), { recursive: true });
		writeFileSync(join(testDir, ".goopspec", "config.json"), "{}");
		writeFileSync(join(testDir, ".goopspec", "goopspec.db"), "data");

		const targets = await planUninstall("config-only");

		expect(targets).toEqual([
			{
				path: join(".goopspec", "config.json"),
				description: "Configuration file",
				isDirectory: false,
			},
		]);
	});

	it("plans data tier with databases, dashboard pid, and workflow directories", async () => {
		mkdirSync(join(testDir, ".goopspec", "goopspec-cli"), { recursive: true });
		mkdirSync(join(testDir, ".goopspec", ".not-a-workflow"), {
			recursive: true,
		});
		writeFileSync(join(testDir, ".goopspec", "config.json"), "{}");
		writeFileSync(join(testDir, ".goopspec", "goopspec.db"), "data");
		writeFileSync(join(testDir, ".goopspec", "memory.db"), "memory");
		writeFileSync(join(testDir, ".goopspec", "dashboard.pid"), "123");

		const paths = (await planUninstall("config-and-data")).map(
			(target) => target.path,
		);

		expect(paths).toContain(join(".goopspec", "config.json"));
		expect(paths).toContain(join(".goopspec", "goopspec.db"));
		expect(paths).toContain(join(".goopspec", "memory.db"));
		expect(paths).toContain(join(".goopspec", "dashboard.pid"));
		expect(paths).toContain(join(".goopspec", "goopspec-cli"));
		expect(paths).not.toContain(join(".goopspec", ".not-a-workflow"));
	});

	it("executes only provided safe removal targets", async () => {
		mkdirSync(join(testDir, ".goopspec"), { recursive: true });
		writeFileSync(join(testDir, ".goopspec", "config.json"), "{}");
		writeFileSync(join(testDir, "keep.txt"), "keep");
		const progress: string[] = [];

		const removed = await executeUninstall(
			[
				{
					path: join(".goopspec", "config.json"),
					description: "Configuration file",
					isDirectory: false,
				},
			],
			(target) => progress.push(target.path),
		);

		expect(removed).toEqual([join(".goopspec", "config.json")]);
		expect(progress).toEqual([join(".goopspec", "config.json")]);
		expect(existsSync(join(testDir, ".goopspec", "config.json"))).toBe(false);
		expect(existsSync(join(testDir, "keep.txt"))).toBe(true);
	});

	it("refuses unsafe paths passed directly to the executor", async () => {
		const unsafeTarget: RemovalTarget = {
			path: "package.json",
			description: "Unsafe",
			isDirectory: false,
		};

		await expect(
			executeUninstall([unsafeTarget], () => undefined),
		).rejects.toThrow("Refusing to remove unsafe path");
	});
});
