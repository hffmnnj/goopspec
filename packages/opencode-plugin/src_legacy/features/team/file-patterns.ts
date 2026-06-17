import { readdirSync } from "fs";
import { format, join, parse } from "path";

const SHORT_ID_MIN_LENGTH = 6;
const SHORT_ID_MAX_LENGTH = 8;
export const DEFAULT_SHORT_ID_LENGTH = 7;

const SHORT_ID_RANGE_PATTERN = `[a-zA-Z0-9]{${SHORT_ID_MIN_LENGTH},${SHORT_ID_MAX_LENGTH}}`;

const clampShortIdLength = (length: number): number => {
  if (Number.isNaN(length)) {
    return DEFAULT_SHORT_ID_LENGTH;
  }

  return Math.min(
    SHORT_ID_MAX_LENGTH,
    Math.max(SHORT_ID_MIN_LENGTH, Math.trunc(length))
  );
};

const normalizeAgentId = (agentId: string): string => {
  return agentId.replace(/[^a-zA-Z0-9]/g, "");
};

const toShortId = (agentId: string, length: number): string => {
  const normalized = normalizeAgentId(agentId);
  if (!normalized) {
    return "";
  }

  const boundedLength = clampShortIdLength(length);
  return normalized.slice(0, Math.min(boundedLength, normalized.length));
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildAgentFileRegex = (baseName: string, extension: string): RegExp => {
  const escapedBase = escapeRegExp(baseName);
  const escapedExt = escapeRegExp(extension);
  return new RegExp(`^${escapedBase}-(${SHORT_ID_RANGE_PATTERN})${escapedExt}$`);
};

export const generateAgentFilePath = (
  basePath: string,
  agentId: string,
  shortIdLength: number = DEFAULT_SHORT_ID_LENGTH
): string => {
  const parsed = parse(basePath);
  const shortId = toShortId(agentId, shortIdLength);
  const name = shortId ? `${parsed.name}-${shortId}` : parsed.name;

  return format({
    dir: parsed.dir,
    name,
    ext: parsed.ext,
  });
};

export const extractAgentId = (filePath: string): string | null => {
  const parsed = parse(filePath);
  const match = parsed.name.match(new RegExp(`-(${SHORT_ID_RANGE_PATTERN})$`));
  return match ? match[1] : null;
};

export const findAgentFiles = (
  basePath: string,
  pattern?: RegExp | string
): string[] => {
  const parsed = parse(basePath);
  const directory = parsed.dir || ".";
  const fileRegex = buildAgentFileRegex(parsed.name, parsed.ext);

  try {
    const entries = readdirSync(directory, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((entryName) => fileRegex.test(entryName))
      .filter((entryName) => {
        if (!pattern) {
          return true;
        }

        if (pattern instanceof RegExp) {
          return pattern.test(entryName);
        }

        return entryName.includes(pattern);
      })
      .map((entryName) => join(directory, entryName));
  } catch {
    return [];
  }
};

export const getCanonicalPath = (agentFilePath: string): string => {
  const parsed = parse(agentFilePath);
  const match = parsed.name.match(new RegExp(`-(${SHORT_ID_RANGE_PATTERN})$`));
  if (!match) {
    return agentFilePath;
  }

  const canonicalName = parsed.name.slice(0, -match[0].length);
  return format({
    dir: parsed.dir,
    name: canonicalName,
    ext: parsed.ext,
  });
};
