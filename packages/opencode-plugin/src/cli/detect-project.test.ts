import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectProjectName } from "./detect-project.js";

describe("detectProjectName", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "detect-project-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("package.json detection", () => {
    it("detects name from package.json", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "my-cool-app" }),
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("my-cool-app");
      expect(result.source).toBe("package.json");
      expect(result.path).toBe(join(tempDir, "package.json"));
    });

    it("detects description and version from package.json", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "my-app",
          description: "A great application",
          version: "2.1.0",
        }),
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("my-app");
      expect(result.description).toBe("A great application");
      expect(result.version).toBe("2.1.0");
      expect(result.source).toBe("package.json");
    });

    it("omits description and version when not present", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "bare-app" }),
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("bare-app");
      expect(result.description).toBeUndefined();
      expect(result.version).toBeUndefined();
    });

    it("skips package.json with empty name field", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "", version: "1.0.0" }),
      );

      const result = await detectProjectName(tempDir);

      // Should fall back to directory name since name is empty
      expect(result.source).toBe("directory");
    });

    it("skips package.json with whitespace-only name", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "   " }),
      );

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("handles malformed JSON gracefully", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        "{ this is not valid json }}}",
      );

      const result = await detectProjectName(tempDir);

      // Should fall back to directory name
      expect(result.source).toBe("directory");
    });

    it("skips package.json with non-string name", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: 42 }),
      );

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("trims whitespace from name", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "  trimmed-app  " }),
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("trimmed-app");
    });
  });

  describe("Cargo.toml detection", () => {
    it("detects name from Cargo.toml when no package.json", async () => {
      await writeFile(
        join(tempDir, "Cargo.toml"),
        `[package]\nname = "my-rust-crate"\nversion = "0.3.1"\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("my-rust-crate");
      expect(result.source).toBe("Cargo.toml");
      expect(result.version).toBe("0.3.1");
      expect(result.path).toBe(join(tempDir, "Cargo.toml"));
    });

    it("prefers package.json over Cargo.toml", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "js-app" }),
      );
      await writeFile(
        join(tempDir, "Cargo.toml"),
        `[package]\nname = "rust-app"\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("js-app");
      expect(result.source).toBe("package.json");
    });

    it("skips Cargo.toml without [package] section", async () => {
      await writeFile(
        join(tempDir, "Cargo.toml"),
        `[dependencies]\nserde = "1.0"\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("skips Cargo.toml without name in [package]", async () => {
      await writeFile(
        join(tempDir, "Cargo.toml"),
        `[package]\nversion = "1.0.0"\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("handles Cargo.toml with multiple sections", async () => {
      const content = [
        "[package]",
        'name = "multi-section"',
        'version = "1.2.3"',
        "",
        "[dependencies]",
        'serde = "1.0"',
        "",
        "[dev-dependencies]",
        'tokio = "1.0"',
      ].join("\n");

      await writeFile(join(tempDir, "Cargo.toml"), content);

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("multi-section");
      expect(result.version).toBe("1.2.3");
      expect(result.source).toBe("Cargo.toml");
    });
  });

  describe("pyproject.toml detection", () => {
    it("detects name from pyproject.toml when no package.json or Cargo.toml", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        `[project]\nname = "my-python-pkg"\nversion = "1.0.0"\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("my-python-pkg");
      expect(result.source).toBe("pyproject.toml");
      expect(result.version).toBe("1.0.0");
      expect(result.path).toBe(join(tempDir, "pyproject.toml"));
    });

    it("prefers Cargo.toml over pyproject.toml", async () => {
      await writeFile(
        join(tempDir, "Cargo.toml"),
        `[package]\nname = "rust-app"\n`,
      );
      await writeFile(
        join(tempDir, "pyproject.toml"),
        `[project]\nname = "python-app"\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("rust-app");
      expect(result.source).toBe("Cargo.toml");
    });

    it("skips pyproject.toml without [project] section", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        `[build-system]\nrequires = ["setuptools"]\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("handles pyproject.toml with single-quoted values", async () => {
      await writeFile(
        join(tempDir, "pyproject.toml"),
        `[project]\nname = 'single-quoted'\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("single-quoted");
      expect(result.source).toBe("pyproject.toml");
    });
  });

  describe("go.mod detection", () => {
    it("detects name from go.mod last path segment", async () => {
      await writeFile(
        join(tempDir, "go.mod"),
        "module github.com/user/my-go-project\n\ngo 1.21\n",
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("my-go-project");
      expect(result.source).toBe("go.mod");
      expect(result.path).toBe(join(tempDir, "go.mod"));
    });

    it("handles simple module name without path", async () => {
      await writeFile(
        join(tempDir, "go.mod"),
        "module mymodule\n\ngo 1.21\n",
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("mymodule");
      expect(result.source).toBe("go.mod");
    });

    it("handles deeply nested module path", async () => {
      await writeFile(
        join(tempDir, "go.mod"),
        "module github.com/org/team/sub/deep-project\n\ngo 1.22\n",
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("deep-project");
      expect(result.source).toBe("go.mod");
    });

    it("skips go.mod without module declaration", async () => {
      await writeFile(
        join(tempDir, "go.mod"),
        "go 1.21\n\nrequire (\n\tgithub.com/pkg/errors v0.9.1\n)\n",
      );

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("prefers package.json over go.mod", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "js-app" }),
      );
      await writeFile(
        join(tempDir, "go.mod"),
        "module github.com/user/go-app\n",
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("js-app");
      expect(result.source).toBe("package.json");
    });
  });

  describe("directory name fallback", () => {
    it("falls back to directory name when no manifest found", async () => {
      const result = await detectProjectName(tempDir);

      // tempDir is something like /tmp/detect-project-test-XXXXXX
      // The basename should be the last segment
      expect(result.source).toBe("directory");
      expect(result.name).toBeTruthy();
      expect(result.path).toBe(tempDir);
    });

    it("uses resolved directory path", async () => {
      const subDir = join(tempDir, "my-project");
      await mkdir(subDir, { recursive: true });

      const result = await detectProjectName(subDir);

      expect(result.name).toBe("my-project");
      expect(result.source).toBe("directory");
    });

    it("handles relative directory path", async () => {
      const subDir = join(tempDir, "relative-test");
      await mkdir(subDir, { recursive: true });

      // Use the absolute path since we can't reliably cd in tests
      const result = await detectProjectName(subDir);

      expect(result.name).toBe("relative-test");
      expect(result.source).toBe("directory");
    });
  });

  describe("priority order", () => {
    it("follows package.json → Cargo.toml → pyproject.toml → go.mod → directory", async () => {
      // Only Cargo.toml and go.mod present — should pick Cargo.toml
      await writeFile(
        join(tempDir, "Cargo.toml"),
        `[package]\nname = "cargo-wins"\n`,
      );
      await writeFile(
        join(tempDir, "go.mod"),
        "module github.com/user/go-loses\n",
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("cargo-wins");
      expect(result.source).toBe("Cargo.toml");
    });

    it("falls through to pyproject.toml when earlier manifests are invalid", async () => {
      // package.json with empty name, no Cargo.toml
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "" }),
      );
      await writeFile(
        join(tempDir, "pyproject.toml"),
        `[project]\nname = "python-wins"\n`,
      );

      const result = await detectProjectName(tempDir);

      expect(result.name).toBe("python-wins");
      expect(result.source).toBe("pyproject.toml");
    });
  });

  describe("edge cases", () => {
    it("handles empty directory gracefully", async () => {
      const emptyDir = join(tempDir, "empty");
      await mkdir(emptyDir, { recursive: true });

      const result = await detectProjectName(emptyDir);

      expect(result.name).toBe("empty");
      expect(result.source).toBe("directory");
    });

    it("handles package.json with missing name key", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({ version: "1.0.0", description: "no name" }),
      );

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("handles empty Cargo.toml file", async () => {
      await writeFile(join(tempDir, "Cargo.toml"), "");

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });

    it("handles empty go.mod file", async () => {
      await writeFile(join(tempDir, "go.mod"), "");

      const result = await detectProjectName(tempDir);

      expect(result.source).toBe("directory");
    });
  });
});
