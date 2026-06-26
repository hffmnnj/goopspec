/**
 * UI overlay state — Svelte 5 runes.
 *
 * Holds open/closed state for global overlays that are triggered from multiple
 * places (command palette, keyboard help). Keeping these in one small store
 * makes them easy to toggle from keyboard shortcuts and observe from components.
 *
 * Settings is no longer a modal overlay — it lives at the `/settings` route and
 * is reached via `goto('/settings')`.
 */

class UiStore {
  paletteOpen = $state(false);
  helpOpen = $state(false);
  addProjectOpen = $state(false);

  closeAll(): void {
    this.paletteOpen = false;
    this.helpOpen = false;
    this.addProjectOpen = false;
  }

  togglePalette(): void {
    this.paletteOpen = !this.paletteOpen;
  }

  toggleHelp(): void {
    this.helpOpen = !this.helpOpen;
  }

  toggleAddProject(): void {
    this.addProjectOpen = !this.addProjectOpen;
  }
}

/** Shared reactive UI overlay singleton. */
export const ui = new UiStore();

export type { UiStore };
