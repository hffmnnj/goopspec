import { createHash } from "node:crypto";

import type { Entry } from "./types.js";

const LONG_VALUE_THRESHOLD = 40;
const MAX_OUTPUT_LENGTH = 200;
const MAX_ARGS_HASH_LENGTH = 4_000;
const MAX_SHELL_COMMAND_NORMALIZATION_LENGTH = 8_000;
const MAX_ARGS_HASH_SCAN_NODES = 1_000;

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function replaceDates(input: string): string {
  return input.replace(
    /(?:"|')?\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?)?(?:"|')?/g,
    "<DATE>",
  );
}

function replaceTempPaths(input: string): string {
  return input.replace(/\/tmp\/opencode-[^\s/]+(?:\/[^\s]+)?/g, "<TMPPATH>");
}

function replaceHeadTailCounters(input: string): string {
  return input.replace(/\b(head|tail)\s+-\d+/g, "$1 -<N>");
}

function stripTrailingShellTokens(input: string): string {
  return input.replace(/(?:\s*2>&1\s*)+$/g, "").replace(/(?:\s*\|\|\s*true\s*)+$/g, "");
}

function replaceLongFlagValues(input: string): string {
  return input.replace(
    /(--[a-zA-Z0-9_-]+=)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g,
    (_match, flag: string, value: string) => {
      if (value === "<DATE>") return `${flag}<DATE>`;
      const inner = value.replace(/^["']|["']$/g, "");
      if (inner.length > LONG_VALUE_THRESHOLD) {
        return `${flag}<LONGVAL>`;
      }
      return `${flag}${inner}`;
    },
  );
}

/**
 * Normalize a shell command string so near-identical commands collide.
 */
export function normalizeShellCommand(cmd: string): string {
  let result = collapseWhitespace(cmd);
  result = replaceDates(result);
  result = replaceTempPaths(result);
  result = replaceHeadTailCounters(result);
  result = stripTrailingShellTokens(result);
  result = replaceLongFlagValues(result);
  return collapseWhitespace(result);
}

function canonicalize(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

function findOversizedString(
  value: unknown,
  seen = new WeakSet<object>(),
  remaining = { nodes: MAX_ARGS_HASH_SCAN_NODES },
): string | undefined {
  if (typeof value === "string") {
    return value.length > MAX_ARGS_HASH_LENGTH ? value : undefined;
  }
  if (value == null || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  if (remaining.nodes <= 0) return "";

  seen.add(value);
  remaining.nodes -= 1;
  for (const child of Object.values(value)) {
    const oversized = findOversizedString(child, seen, remaining);
    if (oversized !== undefined) return oversized;
  }
  return undefined;
}

function extractBashCommand(args: unknown): string | undefined {
  if (typeof args !== "object" || args == null) return undefined;
  const record = args as Record<string, unknown>;
  if (typeof record.command === "string") return record.command;
  if (typeof record.args === "string") return record.args;
  return undefined;
}

/**
 * Compute the canonical args hash for a tool call.
 */
export function canonicalArgsHash(tool: string, args: unknown): string {
  if (tool === "bash") {
    const command = extractBashCommand(args);
    if (command != null) {
      const boundedCommand =
        command.length > MAX_SHELL_COMMAND_NORMALIZATION_LENGTH
          ? command.slice(0, MAX_SHELL_COMMAND_NORMALIZATION_LENGTH)
          : command;
      return sha256(normalizeShellCommand(boundedCommand));
    }
  }

  try {
    const oversizedString = findOversizedString(args);
    if (oversizedString !== undefined) {
      return sha256(
        `${tool}:${oversizedString.length}:${oversizedString.slice(0, MAX_ARGS_HASH_LENGTH)}`,
      );
    }
  } catch {
    return sha256(`${tool}:[unserializable]`);
  }

  let rawArgs: string;
  try {
    rawArgs = JSON.stringify(args);
  } catch {
    return sha256(`${tool}:[unserializable]`);
  }

  if (rawArgs.length > MAX_ARGS_HASH_LENGTH) {
    return sha256(`${tool}:${rawArgs.length}:${rawArgs.slice(0, MAX_ARGS_HASH_LENGTH)}`);
  }

  const canonical = canonicalize(args);
  return sha256(JSON.stringify(canonical));
}

/**
 * Normalize tool output so structurally-identical outputs with different
 * absolute paths / line numbers still hash the same.
 */
export function normalizeOutput(out: string): string {
  let result = out.trim();
  if (result.length > MAX_OUTPUT_LENGTH) {
    result = result.slice(0, MAX_OUTPUT_LENGTH);
  }

  result = result.replace(/(?:^|\s|\()\/[\w./-]+(?:\/[\w./-]+)*/g, " ");
  result = result.replace(/(?:^|\s|\()[A-Za-z]:\\[^\s:)]+/g, " ");
  result = result.replace(/(\d+):\d+(?::\d+)?/g, "$1");

  return collapseWhitespace(result);
}

/**
 * SHA-256 hash of normalized output.
 */
export function outputHash(out: string): string {
  return sha256(normalizeOutput(out));
}

export interface BuildEntryInput {
  tool: string;
  args: unknown;
  output: string;
  timestamp?: number;
}

/**
 * Build a tracker entry from a completed tool call.
 */
export function buildEntry(input: BuildEntryInput): Entry {
  return {
    tool: input.tool,
    normalizedArgsHash: canonicalArgsHash(input.tool, input.args),
    outputHash: outputHash(input.output),
    timestamp: input.timestamp ?? Date.now(),
  };
}
