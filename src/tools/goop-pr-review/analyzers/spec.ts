import { readFileSync } from "fs";
import { logError } from "../../../shared/logger.js";
import type {
  ReviewContext,
  ReviewFinding,
  SpecRequirement,
  SpecSection,
} from "../types.js";

interface ParsedMustHave {
  id: string;
  title: string;
  body: string;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "when",
  "where",
  "must",
  "have",
  "review",
  "command",
  "pull",
  "request",
]);

function parseMustHaves(specContent: string): ParsedMustHave[] {
  const blockPattern = /^###\s+(MH\d+)\s*:\s*(.+)$/gm;
  const matches = Array.from(specContent.matchAll(blockPattern));

  if (matches.length === 0) {
    return [];
  }

  const parsed: ParsedMustHave[] = [];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const start = current.index ?? 0;
    const end = next?.index ?? specContent.length;
    const body = specContent.slice(start, end);

    parsed.push({
      id: current[1],
      title: current[2].trim(),
      body,
    });
  }

  return parsed;
}

function tokenize(input: string): Set<string> {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));

  return new Set(tokens);
}

function listMatches(requirementTokens: Set<string>, corpusTokens: Set<string>): string[] {
  const matches: string[] = [];
  for (const token of requirementTokens) {
    if (corpusTokens.has(token)) {
      matches.push(token);
    }
  }
  return matches;
}

function buildCorpus(context: ReviewContext): string {
  const parts = [
    context.pr.title,
    ...context.files.map((file) => file.path),
    ...context.reviews.map((review) => review.body),
    ...context.comments.map((comment) => comment.body),
    ...context.checks.map((check) => `${check.name} ${check.conclusion ?? ""}`),
  ];

  return parts.join("\n");
}

function summarize(requirements: SpecRequirement[], hasBlueprint: boolean): string {
  const coveredCount = requirements.filter((requirement) => requirement.covered).length;
  const total = requirements.length;

  if (total === 0) {
    return hasBlueprint
      ? "Spec files are present, but no must-haves were parsed from SPEC.md."
      : "SPEC.md is present, but no must-haves were parsed and BLUEPRINT.md is missing.";
  }

  const base = `Spec coverage: ${coveredCount}/${total} must-have requirement(s) matched to PR signals.`;
  if (coveredCount < total) {
    return `${base} Uncovered requirements need explicit evidence before merge.`;
  }

  return `${base} All parsed must-haves have matching PR evidence.`;
}

export function analyzeSpecAlignment(context: ReviewContext): SpecSection {
  const { specAvailability } = context;

  if (!specAvailability.specExists) {
    return {
      available: false,
      requirements: [],
      findings: [],
      summary: "No spec files detected. Spec alignment checks skipped.",
    };
  }

  try {
    const specContent = readFileSync(specAvailability.specPath, "utf8");
    const blueprintContent = specAvailability.blueprintExists
      ? readFileSync(specAvailability.blueprintPath, "utf8")
      : "";

    const mustHaves = parseMustHaves(specContent);
    const corpusTokens = tokenize(buildCorpus(context));

    const requirements: SpecRequirement[] = mustHaves.map((mustHave) => {
      const requirementTokens = tokenize(`${mustHave.title}\n${mustHave.body}`);
      const matches = listMatches(requirementTokens, corpusTokens);

      return {
        id: mustHave.id,
        description: mustHave.title,
        covered: matches.length >= 2,
        evidence: matches.length > 0 ? `Matched signals: ${matches.slice(0, 5).join(", ")}` : undefined,
      };
    });

    const findings: ReviewFinding[] = requirements
      .filter((requirement) => !requirement.covered)
      .map((requirement) => ({
        severity: "medium",
        category: "spec",
        message: `${requirement.id} appears uncovered by current PR scope.`,
        suggestion:
          "Link changed files, checks, or review notes to this requirement before merge.",
      }));

    if (specAvailability.blueprintExists && blueprintContent.length > 0) {
      for (const requirement of requirements) {
        if (!blueprintContent.includes(requirement.id)) {
          findings.push({
            severity: "low",
            category: "spec",
            message: `${requirement.id} is missing from BLUEPRINT.md traceability.`,
            suggestion: "Update blueprint traceability to include this must-have.",
          });
        }
      }
    }

    if (!specAvailability.blueprintExists) {
      findings.push({
        severity: "low",
        category: "spec",
        message: "BLUEPRINT.md not found; traceability verification is limited.",
      });
    }

    return {
      available: true,
      requirements,
      findings,
      summary: summarize(requirements, specAvailability.blueprintExists),
    };
  } catch (error) {
    logError("Spec analyzer failed", error);
    return {
      available: true,
      requirements: [],
      findings: [
        {
          severity: "medium",
          category: "spec",
          message: "Spec alignment analysis failed; requirement coverage is unknown.",
        },
      ],
      summary: "Spec alignment analysis failed; unable to parse spec artifacts.",
    };
  }
}
