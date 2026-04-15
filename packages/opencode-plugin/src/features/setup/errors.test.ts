/**
 * Error Handling Tests
 * @module features/setup/errors.test
 */

import { describe, it, expect } from "bun:test";
import {
  categorizeInstallError,
  formatCategorizedError,
  aggregateErrors,
  withRetry,
  type CategorizedError,
} from "./errors.js";

describe("error categorization", () => {
  describe("categorizeInstallError", () => {
    it("categorizes network errors", () => {
      const networkErrors = [
        "ECONNREFUSED: Connection refused",
        "Error: fetch failed - network error",
        "ETIMEDOUT: Connection timed out",
        "ENOTFOUND: DNS lookup failed",
      ];
      
      for (const error of networkErrors) {
        const result = categorizeInstallError(error);
        expect(result.category).toBe("network");
        expect(result.retryable).toBe(true);
      }
    });

    it("categorizes permission errors", () => {
      const permissionErrors = [
        "EACCES: Permission denied",
        "EPERM: Operation not permitted",
        "Error: access denied to /usr/local/lib",
      ];
      
      for (const error of permissionErrors) {
        const result = categorizeInstallError(error);
        expect(result.category).toBe("permission");
        expect(result.retryable).toBe(false);
      }
    });

    it("categorizes compatibility errors", () => {
      const compatibilityErrors = [
        "Error: unsupported platform linux-riscv64",
        "No prebuilt binaries available for this platform",
        "Error: arch arm not supported",
      ];
      
      for (const error of compatibilityErrors) {
        const result = categorizeInstallError(error);
        expect(result.category).toBe("compatibility");
        expect(result.retryable).toBe(false);
      }
    });

    it("categorizes not-found errors", () => {
      const notFoundErrors = [
        "404 Not Found - package does not exist",
        "Error: couldn't find package sqlite-vec-fake-platform",
        "No matching version found for package@^99.0.0",
      ];
      
      for (const error of notFoundErrors) {
        const result = categorizeInstallError(error);
        expect(result.category).toBe("not-found");
        expect(result.retryable).toBe(false);
      }
    });

    it("categorizes timeout errors", () => {
      const timeoutErrors = [
        "Error: Install timeout after 120000ms",
        "Operation timed out",
        "Deadline exceeded",
      ];
      
      for (const error of timeoutErrors) {
        const result = categorizeInstallError(error);
        expect(result.category).toBe("timeout");
        expect(result.retryable).toBe(true);
      }
    });

    it("returns unknown for unrecognized errors", () => {
      const result = categorizeInstallError("Some completely unknown error message");
      expect(result.category).toBe("unknown");
      expect(result.retryable).toBe(true);
      expect(result.originalError).toBe("Some completely unknown error message");
    });

    it("preserves original error message", () => {
      const originalError = "ECONNREFUSED: Connection to registry refused";
      const result = categorizeInstallError(originalError);
      expect(result.originalError).toBe(originalError);
    });
  });

  describe("formatCategorizedError", () => {
    it("formats error with icon and suggestion", () => {
      const error: CategorizedError = {
        category: "network",
        message: "Network connection failed",
        suggestion: "Check your internet connection",
        retryable: true,
      };
      
      const formatted = formatCategorizedError(error);
      expect(formatted).toContain("🌐");
      expect(formatted).toContain("Network connection failed");
      expect(formatted).toContain("Check your internet connection");
      expect(formatted).toContain("temporary");
    });

    it("does not show retry message for non-retryable errors", () => {
      const error: CategorizedError = {
        category: "permission",
        message: "Permission denied",
        suggestion: "Run with sudo",
        retryable: false,
      };
      
      const formatted = formatCategorizedError(error);
      expect(formatted).toContain("🔒");
      expect(formatted).not.toContain("temporary");
    });
  });

  describe("aggregateErrors", () => {
    it("groups errors by category", () => {
      const errors: CategorizedError[] = [
        { category: "network", message: "Network 1", suggestion: "", retryable: true },
        { category: "network", message: "Network 2", suggestion: "", retryable: true },
        { category: "permission", message: "Permission 1", suggestion: "", retryable: false },
      ];
      
      const result = aggregateErrors(errors);
      
      expect(result.byCategory.network).toHaveLength(2);
      expect(result.byCategory.permission).toHaveLength(1);
      expect(result.byCategory.compatibility).toHaveLength(0);
    });

    it("correctly identifies if any errors are retryable", () => {
      const allRetryable: CategorizedError[] = [
        { category: "network", message: "", suggestion: "", retryable: true },
        { category: "timeout", message: "", suggestion: "", retryable: true },
      ];
      
      const someRetryable: CategorizedError[] = [
        { category: "network", message: "", suggestion: "", retryable: true },
        { category: "permission", message: "", suggestion: "", retryable: false },
      ];
      
      const noneRetryable: CategorizedError[] = [
        { category: "permission", message: "", suggestion: "", retryable: false },
        { category: "compatibility", message: "", suggestion: "", retryable: false },
      ];
      
      expect(aggregateErrors(allRetryable).hasRetryable).toBe(true);
      expect(aggregateErrors(someRetryable).hasRetryable).toBe(true);
      expect(aggregateErrors(noneRetryable).hasRetryable).toBe(false);
    });

    it("generates summary string", () => {
      const errors: CategorizedError[] = [
        { category: "network", message: "", suggestion: "", retryable: true },
        { category: "permission", message: "", suggestion: "", retryable: false },
      ];
      
      const result = aggregateErrors(errors);
      
      expect(result.summary).toContain("1 network error");
      expect(result.summary).toContain("1 permission error");
    });
  });

  describe("withRetry", () => {
    it("succeeds on first attempt if no error", async () => {
      let attempts = 0;
      const result = await withRetry(async () => {
        attempts++;
        return "success";
      });
      
      expect(result).toBe("success");
      expect(attempts).toBe(1);
    });

    it("retries on retryable errors", async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("ECONNREFUSED: Connection refused");
          }
          return "success";
        },
        { maxAttempts: 3, initialDelayMs: 10 }
      );
      
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("does not retry on non-retryable errors", async () => {
      let attempts = 0;
      
      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new Error("EACCES: Permission denied");
          },
          { maxAttempts: 3, initialDelayMs: 10 }
        )
      ).rejects.toThrow("Permission denied");
      
      expect(attempts).toBe(1);
    });

    it("throws after max attempts", async () => {
      let attempts = 0;
      
      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new Error("ECONNREFUSED: Connection refused");
          },
          { maxAttempts: 2, initialDelayMs: 10 }
        )
      ).rejects.toThrow("Connection refused");
      
      expect(attempts).toBe(2);
    });
  });
});
