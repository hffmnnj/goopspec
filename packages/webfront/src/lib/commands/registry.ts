/**
 * Command registry + fuzzy search for the command palette (Cmd+K).
 *
 * The registry is deliberately DOM-free and transport-free so the matching and
 * scoring logic can be unit-tested in isolation. Components register commands
 * (static actions wired to stores/UI) and the palette calls `searchCommands`.
 *
 * Dynamic commands (one per existing session, one per available model) are
 * generated on demand from the live stores so the palette always reflects
 * current state without needing to re-register on every change.
 */

/** Logical grouping used to cluster results in the palette. */
export type CommandCategory =
  | 'General'
  | 'Session'
  | 'Sessions'
  | 'Appearance'
  | 'Workspace'
  | 'Model'
  | 'Help';

/** HugeIcons SVG element passed straight to `<HugeiconsIcon icon={...} />`.
 * Importing only the type keeps the registry free of any runtime icon dependency
 * so the scoring/registry logic stays pure and unit-testable. */
export type CommandIcon = import('@hugeicons/svelte').IconSvgElement;

export interface Command {
  /** Stable identifier. */
  id: string;
  /** Primary label shown in the palette row. */
  title: string;
  /** Optional secondary line (e.g. relative time, model id). */
  subtitle?: string;
  /** Grouping used to cluster results. */
  category: CommandCategory;
  /** Optional HugeIcons icon component for the row. */
  icon?: CommandIcon;
  /** Extra search terms that should match this command beyond its title. */
  keywords?: string[];
  /** Formatted shortcut hint tokens, e.g. ['mod+k'] — rendered as kbd chips. */
  keys?: string[];
  /** Invoked when the command is selected. */
  run: () => void;
}

/** A command paired with its fuzzy score for a given query. */
export interface ScoredCommand {
  command: Command;
  score: number;
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Static command source. A command may register a `() => Command[]` provider
 * to contribute dynamic entries (sessions, models) evaluated at search time.
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private providers: Map<string, () => Command[]> = new Map();

  /** Register (or replace) a single static command. */
  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  /** Register many static commands at once. */
  registerAll(commands: Command[]): void {
    for (const command of commands) this.register(command);
  }

  /** Remove a static command by id. */
  unregister(id: string): void {
    this.commands.delete(id);
  }

  /**
   * Register a dynamic provider keyed by id. The provider is evaluated every
   * time `getCommands()` runs, so it always reflects current store state.
   * Re-registering the same key replaces the previous provider.
   */
  registerProvider(key: string, provider: () => Command[]): void {
    this.providers.set(key, provider);
  }

  /** Remove a dynamic provider. */
  unregisterProvider(key: string): void {
    this.providers.delete(key);
  }

  /** Reset all static commands and providers (tests). */
  clear(): void {
    this.commands.clear();
    this.providers.clear();
  }

  /**
   * All commands: static entries first (insertion order), then dynamic entries
   * from each provider. Provider failures are swallowed so one bad provider
   * cannot break the whole palette.
   */
  getCommands(): Command[] {
    const result: Command[] = [...this.commands.values()];
    for (const provider of this.providers.values()) {
      try {
        result.push(...provider());
      } catch {
        // A failing provider must not break the palette.
      }
    }
    return result;
  }

  /**
   * Search commands by query. An empty query returns all commands in registry
   * order. A non-empty query returns only matching commands, sorted by score
   * (highest first), with insertion order as a stable tiebreaker.
   */
  search(query: string): Command[] {
    return searchCommands(query, this.getCommands());
  }
}

/* -------------------------------------------------------------------------- */
/* Fuzzy matching                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Score how well `query` matches `command`. Higher is better; `0` means no
 * match. Scoring is computed over the title and keywords, taking the best
 * field score. The ladder is:
 *
 *   - exact title match        → 1000
 *   - title starts with query  → 700..800 (longer prefix coverage scores more)
 *   - title contains query     → 450..550 (earlier match scores more)
 *   - subsequence in title     → 150..350 (contiguity + word-boundary bonus)
 *   - keyword match            → up to ~300 (keywords never beat a title hit)
 *   - no match                 → 0
 *
 * The query is matched case-insensitively. Whitespace in the query is treated
 * as significant for contains/prefix but ignored for subsequence so multi-word
 * queries like "new ses" still match "New session".
 */
export function fuzzyMatch(query: string, command: Command): number {
  const q = query.trim().toLowerCase();
  if (q === '') return 1;

  const title = command.title.toLowerCase();
  let best = scoreField(q, title, /* isTitle */ true);

  for (const keyword of command.keywords ?? []) {
    const kw = keyword.toLowerCase();
    // Keywords contribute at a discount so a title hit always wins.
    const score = scoreField(q, kw, /* isTitle */ false) * 0.6;
    if (score > best) best = score;
  }

  return best;
}

/** Score a single field (title or keyword) against the normalized query. */
function scoreField(q: string, field: string, isTitle: boolean): number {
  if (field === q) return isTitle ? 1000 : 600;

  if (field.startsWith(q)) {
    // Prefer prefixes that cover more of the field.
    const coverage = q.length / field.length;
    return 700 + Math.round(coverage * 100);
  }

  const containsIndex = field.indexOf(q);
  if (containsIndex !== -1) {
    // Earlier matches and word-boundary matches score higher.
    const boundary = containsIndex === 0 || /\s|[-_/]/.test(field[containsIndex - 1] ?? '');
    const positionPenalty = Math.min(containsIndex, 100);
    return 450 + (boundary ? 50 : 0) - Math.round(positionPenalty * 0.5);
  }

  return subsequenceScore(q, field);
}

/**
 * Subsequence scorer: does every character of `q` appear in `field` in order?
 * Rewards contiguous runs and matches that land on word boundaries.
 */
function subsequenceScore(q: string, field: string): number {
  const query = q.replace(/\s+/g, '');
  if (query === '') return 0;

  let qi = 0;
  let runs = 0;
  let inRun = false;
  let boundaryHits = 0;
  let matched = 0;

  for (let fi = 0; fi < field.length && qi < query.length; fi += 1) {
    if (field[fi] === query[qi]) {
      matched += 1;
      if (fi === 0 || /\s|[-_/]/.test(field[fi - 1] ?? '')) boundaryHits += 1;
      if (!inRun) {
        runs += 1;
        inRun = true;
      }
      qi += 1;
    } else {
      inRun = false;
    }
  }

  if (qi < query.length) return 0; // not a full subsequence

  // Fewer runs = more contiguous = better. Boundary hits and tighter coverage
  // also help. Cap below the contains tier so subsequence never beats contains.
  const contiguity = query.length - (runs - 1); // max when one run
  const base = 150;
  const score =
    base +
    contiguity * 10 +
    boundaryHits * 12 +
    Math.round((matched / field.length) * 40);

  return Math.min(score, 350);
}

/**
 * Filter and sort commands for a query. Empty query returns all commands in the
 * order given (registry order). Non-empty query returns only matches, sorted by
 * descending score with original order as a stable tiebreaker.
 */
export function searchCommands(query: string, commands: Command[]): Command[] {
  const q = query.trim();
  if (q === '') return [...commands];

  const scored: Array<ScoredCommand & { index: number }> = [];
  commands.forEach((command, index) => {
    const score = fuzzyMatch(q, command);
    if (score > 0) scored.push({ command, score, index });
  });

  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return scored.map((entry) => entry.command);
}

/** Shared singleton command registry for the app. */
export const commandRegistry = new CommandRegistry();
