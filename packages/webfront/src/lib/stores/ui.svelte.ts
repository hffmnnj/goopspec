/**
 * UI overlay state — Svelte 5 runes.
 *
 * Holds open/closed state for global overlays that are triggered from multiple
 * places (command palette, keyboard help, settings panel). Keeping these in one
 * small store makes them easy to toggle from keyboard shortcuts and observe
 * from components.
 */

class UiStore {
  paletteOpen = $state(false);
  helpOpen = $state(false);
  settingsOpen = $state(false);
  addProjectOpen = $state(false);

  closeAll(): void {
    this.paletteOpen = false;
    this.helpOpen = false;
    this.settingsOpen = false;
    this.addProjectOpen = false;
  }

  togglePalette(): void {
    this.paletteOpen = !this.paletteOpen;
  }

  toggleHelp(): void {
    this.helpOpen = !this.helpOpen;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
  }

  toggleAddProject(): void {
    this.addProjectOpen = !this.addProjectOpen;
  }
}

/** Shared reactive UI overlay singleton. */
export const ui = new UiStore();

export type { UiStore };
