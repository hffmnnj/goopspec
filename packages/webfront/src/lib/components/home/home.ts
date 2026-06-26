/**
 * Home page presentation logic.
 *
 * Pure, DOM-free helpers that drive `<HomePage>` — the no-project landing
 * screen. Following the package convention (`session-card.ts`, `project-rail.ts`),
 * the view-model builders and derivations live here so they are unit-testable
 * without a Svelte renderer.
 */
import type { Project, Session } from '$lib/api/types.js';
import type { ConnectionStatus } from '$lib/stores/connection.svelte.js';
import type { VoiceError } from '$lib/stores/voice.svelte.js';
import { projectInitial, projectName } from '$lib/components/sessions/project-rail.js';
import { relativeTime } from '$lib/components/sessions/session-card.js';

/* ---------------------------------------------------------------------------
 * Recent projects
 * ------------------------------------------------------------------------- */

/** A project rendered as a card on the home grid. */
export interface RecentProjectCard {
  id: string;
  name: string;
  path: string;
  initial: string;
  colorIndex: number;
  sessionCount?: number;
}

/**
 * Build the recent-projects card list from the opened set. The most recently
 * opened projects (end of the opened array) surface first, capped at `limit`.
 * `colorIndexFor` resolves the stable avatar color index assigned on open.
 * `sessionCountFor` is optional and degrades to `undefined` when unknown.
 */
export function buildRecentProjects(
  openedProjects: Project[],
  colorIndexFor: (id: string) => number,
  options: { limit?: number; sessionCountFor?: (id: string) => number | undefined } = {}
): RecentProjectCard[] {
  const { limit = 8, sessionCountFor } = options;
  // Newest-opened first: the opened array appends on open, so reverse it.
  const ordered = [...openedProjects].reverse();
  return ordered.slice(0, Math.max(0, limit)).map((project) => ({
    id: project.id,
    name: projectName(project.worktree) || 'Untitled project',
    path: project.worktree || '',
    initial: projectInitial(project.worktree),
    colorIndex: colorIndexFor(project.id),
    sessionCount: sessionCountFor?.(project.id),
  }));
}

/** Whether the onboarding (first-run) empty state should show. */
export function isOnboarding(openedProjects: Project[]): boolean {
  return openedProjects.length === 0;
}

/* ---------------------------------------------------------------------------
 * Recent sessions
 * ------------------------------------------------------------------------- */

/** A session paired with the project it belongs to, for the recents list. */
export interface ProjectSession {
  session: Session;
  project: Project;
}

/** A session rendered as a row in the recent-sessions list. */
export interface RecentSessionRow {
  id: string;
  title: string;
  projectName: string;
  project: Project;
  updatedLabel: string;
  updatedAt: string;
}

/**
 * Build the recent-sessions rows across opened projects, newest first.
 * `now` is injectable so relative-time output is deterministic under test.
 */
export function buildRecentSessions(
  entries: ProjectSession[],
  options: { limit?: number; now?: number } = {}
): RecentSessionRow[] {
  const { limit = 6, now = Date.now() } = options;
  return [...entries]
    .sort(
      (a, b) =>
        new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime()
    )
    .slice(0, Math.max(0, limit))
    .map(({ session, project }) => ({
      id: session.id,
      title: sessionDisplayTitle(session),
      projectName: projectName(project.worktree) || 'Untitled project',
      project,
      updatedLabel: relativeTime(session.updatedAt, now),
      updatedAt: session.updatedAt,
    }));
}

function sessionDisplayTitle(session: Session): string {
  const title = session.title?.trim();
  return title && title.length > 0 ? title : 'Untitled session';
}

/* ---------------------------------------------------------------------------
 * Connection status
 * ------------------------------------------------------------------------- */

export interface ConnectionDescriptor {
  connected: boolean;
  label: string;
  hint: string | null;
}

/** Describe the connection state for the home connection pill. */
export function describeConnection(
  status: ConnectionStatus,
  serverUrl: string
): ConnectionDescriptor {
  switch (status) {
    case 'connected':
      return { connected: true, label: `Connected to ${serverUrl}`, hint: null };
    case 'connecting':
      return {
        connected: false,
        label: 'Connecting…',
        hint: `Reaching ${serverUrl}`,
      };
    case 'error':
      return {
        connected: false,
        label: 'Connection error',
        hint: 'Check the server URL in settings, then retry.',
      };
    case 'disconnected':
    default:
      return {
        connected: false,
        label: 'Server offline',
        hint: 'Start the OpenCode server, then open settings to retry.',
      };
  }
}

/* ---------------------------------------------------------------------------
 * Setup status cards
 * ------------------------------------------------------------------------- */

/** A single actionable setup card surfaced on the home screen. */
export interface SetupCard {
  /** Stable identifier (also used as the {#each} key). */
  id: 'server' | 'memory' | 'goopspec' | 'voice';
  /** Card heading. */
  title: string;
  /** One-line explanation of what is unconfigured/degraded. */
  description: string;
  /** Settings sub-route the "Configure" action deep-links into. */
  href: string;
}

/** Inputs that decide which setup cards are surfaced. */
export interface SetupCardInputs {
  /** Live server connection status. */
  connectionStatus: ConnectionStatus;
  /**
   * Resolved GoopSpec config, or `null` when it failed to load. `undefined`
   * means "still loading" — config-dependent cards are withheld until resolved
   * so they do not flash on mount.
   */
  goopspecConfig: { memoryEnabled?: boolean } | null | undefined;
  /** Current voice error category, if any. */
  voiceError: VoiceError;
}

/**
 * Decide which setup cards to surface for unconfigured/degraded features.
 *
 * Each card hides once its feature is fully configured and deep-links into the
 * relevant `/settings/*` sub-route. Config-dependent cards (memory, goopspec)
 * stay hidden while config is still loading (`goopspecConfig === undefined`) to
 * avoid a flash of setup prompts before the real state is known.
 */
export function buildSetupCards(inputs: SetupCardInputs): SetupCard[] {
  const { connectionStatus, goopspecConfig, voiceError } = inputs;
  const cards: SetupCard[] = [];

  if (connectionStatus !== 'connected') {
    cards.push({
      id: 'server',
      title: 'Connect to the server',
      description: 'GoopSpec is not connected to an OpenCode server.',
      href: '/settings/server',
    });
  }

  const configLoaded = goopspecConfig !== undefined;

  if (configLoaded && goopspecConfig === null) {
    cards.push({
      id: 'goopspec',
      title: 'Set up GoopSpec config',
      description: 'GoopSpec configuration could not be loaded for this project.',
      href: '/settings/goopspec',
    });
  } else if (configLoaded && goopspecConfig?.memoryEnabled === false) {
    cards.push({
      id: 'memory',
      title: 'Enable persistent memory',
      description: 'Agent memory is turned off. Enable it to retain context across sessions.',
      href: '/settings/goopspec',
    });
  }

  if (voiceError === 'unsupported') {
    cards.push({
      id: 'voice',
      title: 'Voice input unavailable',
      description: 'Voice input is not supported in this browser. Review voice settings.',
      href: '/settings/voice',
    });
  }

  return cards;
}

/* ---------------------------------------------------------------------------
 * Primary actions
 * ------------------------------------------------------------------------- */

/**
 * Resolve which project a "New session" action should target: the active
 * project, else the most recently opened one, else `null` (prompt to open).
 */
export function newSessionTarget(
  activeProject: Project | null,
  openedProjects: Project[]
): Project | null {
  if (activeProject) return activeProject;
  if (openedProjects.length > 0) return openedProjects[openedProjects.length - 1];
  return null;
}

/* ---------------------------------------------------------------------------
 * Keyboard shortcut hints
 * ------------------------------------------------------------------------- */

export interface ShortcutHint {
  combo: string;
  description: string;
}

/**
 * Build the footer shortcut hints from registered shortcut definitions.
 * `format` formats a raw combo for display (platform-aware). Only the listed
 * ids are surfaced, in the given order, and missing ones are skipped so the
 * hints stay honest about what is actually bound.
 */
export function buildShortcutHints(
  shortcuts: ReadonlyArray<{ id: string; keys: string[]; description: string }>,
  format: (combo: string) => string,
  ids: readonly string[] = ['command-palette', 'new-session', 'keyboard-help']
): ShortcutHint[] {
  const byId = new Map(shortcuts.map((s) => [s.id, s]));
  const hints: ShortcutHint[] = [];
  for (const id of ids) {
    const shortcut = byId.get(id);
    const combo = shortcut?.keys[0];
    if (!shortcut || !combo) continue;
    hints.push({ combo: format(combo), description: shortcut.description });
  }
  return hints;
}
