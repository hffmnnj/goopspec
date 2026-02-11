/**
 * Platform Detection Tests
 * @module features/setup/platform.test
 */

import { describe, it, expect } from "bun:test";
import {
  detectPlatform,
  getSqliteVecPackage,
  getOnnxRuntimePackage,
  type PlatformInfo,
} from "./platform.js";

describe("platform detection", () => {
  describe("detectPlatform", () => {
    it("returns valid platform info", () => {
      const platform = detectPlatform();
      
      expect(platform).toBeDefined();
      expect(platform.os).toBeDefined();
      expect(platform.arch).toBeDefined();
      expect(platform.runtime).toBeDefined();
      expect(platform.packageSuffix).toBeDefined();
    });

    it("detects correct runtime as bun", () => {
      const platform = detectPlatform();
      expect(platform.runtime).toBe("bun");
    });

    it("has valid OS value", () => {
      const platform = detectPlatform();
      expect(["linux", "darwin", "win32"]).toContain(platform.os);
    });

    it("has valid arch value", () => {
      const platform = detectPlatform();
      expect(["x64", "arm64"]).toContain(platform.arch);
    });

    it("packageSuffix matches os-arch format", () => {
      const platform = detectPlatform();
      const expectedOs = platform.os === "win32" ? "windows" : platform.os;
      expect(platform.packageSuffix).toBe(`${expectedOs}-${platform.arch}`);
    });
  });

  describe("getSqliteVecPackage", () => {
    it("returns platform-specific package name for linux-x64", () => {
      const platform: PlatformInfo = {
        os: "linux",
        arch: "x64",
        runtime: "bun",
        packageSuffix: "linux-x64",
        description: "Linux x64 (Intel/AMD)",
      };
      
      expect(getSqliteVecPackage(platform)).toBe("sqlite-vec-linux-x64");
    });

    it("returns platform-specific package name for darwin-arm64", () => {
      const platform: PlatformInfo = {
        os: "darwin",
        arch: "arm64",
        runtime: "bun",
        packageSuffix: "darwin-arm64",
        description: "macOS ARM64 (Apple Silicon/ARM)",
      };
      
      expect(getSqliteVecPackage(platform)).toBe("sqlite-vec-darwin-arm64");
    });

    it("returns platform-specific package name for win32-x64", () => {
      const platform: PlatformInfo = {
        os: "win32",
        arch: "x64",
        runtime: "bun",
        packageSuffix: "windows-x64",
        description: "Windows x64 (Intel/AMD)",
      };
      
      expect(getSqliteVecPackage(platform)).toBe("sqlite-vec-windows-x64");
    });
  });

  describe("getOnnxRuntimePackage", () => {
    it("returns onnxruntime-node for all platforms", () => {
      const platforms: PlatformInfo[] = [
        { os: "linux", arch: "x64", runtime: "bun", packageSuffix: "linux-x64", description: "Linux x64" },
        { os: "darwin", arch: "arm64", runtime: "bun", packageSuffix: "darwin-arm64", description: "macOS ARM64" },
        { os: "darwin", arch: "x64", runtime: "bun", packageSuffix: "darwin-x64", description: "macOS x64" },
        { os: "win32", arch: "x64", runtime: "bun", packageSuffix: "windows-x64", description: "Windows x64" },
      ];
      
      for (const platform of platforms) {
        expect(getOnnxRuntimePackage(platform)).toBe("onnxruntime-node");
      }
    });
  });
});
