import { goto } from '$app/navigation';
import {
  Add01Icon,
  Delete02Icon,
  EraserIcon,
  Settings01Icon,
  Sun03Icon,
  Moon02Icon,
  KeyboardIcon,
  Folder01Icon,
  FolderLibraryIcon,
  MessageMultiple01Icon,
  AiBrain01Icon,
} from '@hugeicons/core-free-icons';
import { chat } from '$lib/stores/chat.svelte.js';
import { sessions } from '$lib/stores/sessions.svelte.js';
import { activeSession } from '$lib/stores/active-session.svelte.js';
import { workspace, formatWorkspacePath } from '$lib/stores/workspace.svelte.js';
import { theme, toggleTheme } from '$lib/stores/theme.svelte.js';
import { ui } from '$lib/stores/ui.svelte.js';
import type { Session } from '$lib/api/types.js';
import { type Command, type CommandRegistry, commandRegistry } from './registry.js';

/**
 * Built-in static commands wired to the shared stores and UI overlays.
 *
 * Kept separate from the pure `registry.ts` so the scoring/registry logic stays
 * unit-testable without importing the store singletons. The palette closes
 * itself before running a command (see CommandPalette.svelte), so handlers here
 * only perform their action.
 */
export function builtinCommands(): Command[] {
  return [
    {
      id: 'new-session',
      title: 'New session',
      subtitle: 'Start a fresh conversation',
      category: 'Session',
      icon: Add01Icon,
      keywords: ['create', 'chat', 'conversation', 'add'],
      keys: ['mod+n'],
      run: () => {
        void sessions.create().then((session) => {
          if (session) activeSession.select(session.id);
        });
      },
    },
    {
      id: 'delete-session',
      title: 'Delete current session',
      subtitle: 'Remove the active conversation',
      category: 'Session',
      icon: Delete02Icon,
      keywords: ['remove', 'close', 'destroy'],
      keys: ['mod+w'],
      run: () => {
        const id = activeSession.activeId;
        if (!id) return;
        void sessions.remove(id).then(() => activeSession.clear());
      },
    },
    {
      id: 'clear-session',
      title: 'Clear conversation',
      subtitle: 'Empty the current message history',
      category: 'Session',
      icon: EraserIcon,
      keywords: ['reset', 'empty', 'wipe'],
      keys: ['mod+l'],
      run: () => chat.clear(),
    },
    {
      id: 'open-settings',
      title: 'Open settings',
      subtitle: 'Providers, models and appearance',
      category: 'General',
      icon: Settings01Icon,
      keywords: ['preferences', 'config', 'options'],
      run: () => {
        void goto('/settings');
      },
    },
    {
      id: 'toggle-theme',
      title: 'Toggle theme',
      subtitle: theme.current === 'dark' ? 'Switch to light' : 'Switch to dark',
      category: 'Appearance',
      icon: theme.current === 'dark' ? Sun03Icon : Moon02Icon,
      keywords: ['dark', 'light', 'appearance', 'color'],
      run: () => toggleTheme(),
    },
    {
      id: 'keyboard-shortcuts',
      title: 'Show keyboard shortcuts',
      subtitle: 'View all keybindings',
      category: 'Help',
      icon: KeyboardIcon,
      keywords: ['keys', 'keybindings', 'help', 'hotkeys'],
      keys: ['mod+/'],
      run: () => {
        ui.helpOpen = true;
      },
    },
    {
      id: 'switch-workspace',
      title: 'Switch workspace',
      subtitle: formatWorkspacePath(workspace.currentPath),
      category: 'Workspace',
      icon: FolderLibraryIcon,
      keywords: ['project', 'folder', 'directory', 'path'],
      run: () => {
        const trigger = document.querySelector<HTMLElement>(
          '[data-shortcut="workspace-switcher"]'
        );
        trigger?.click();
        trigger?.focus();
      },
    },
  ];
}

/**
 * Dynamic provider: one "Switch to session" command per existing session,
 * generated live from the sessions store so the palette always reflects the
 * current list. The active session is omitted (switching to it is a no-op).
 */
export function sessionCommands(): Command[] {
  const activeId = activeSession.activeId;
  return sessions.sorted
    .filter((session) => session.id !== activeId)
    .map((session) => sessionToCommand(session));
}

/** Build a single "Switch to session" command. Exported for tests. */
export function sessionToCommand(session: Session): Command {
  const title = session.title?.trim() || 'Untitled session';
  return {
    id: `session:${session.id}`,
    title: `Switch to session: ${title}`,
    subtitle: relativeTime(session.updatedAt),
    category: 'Sessions',
    icon: MessageMultiple01Icon,
    keywords: ['open', 'go', 'session', title],
    run: () => activeSession.select(session.id),
  };
}

/** Format an ISO timestamp as a compact relative string ("3m ago"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

/** Icon re-export so the palette empty-state and others can share the set. */
export { Folder01Icon, AiBrain01Icon };

/**
 * Register built-in commands and dynamic providers into a registry.
 *
 * Built-ins are registered as a provider (not static entries) so labels and
 * icons that depend on live state — the theme toggle's "Switch to light/dark"
 * subtitle, the workspace path — re-evaluate on every search rather than being
 * frozen at registration time. Idempotent: re-registering replaces by key.
 */
export function registerBuiltinCommands(registry: CommandRegistry = commandRegistry): void {
  registry.registerProvider('builtins', builtinCommands);
  registry.registerProvider('sessions', sessionCommands);
}
