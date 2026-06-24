import type { ActionReturn } from 'svelte/action';
import { keyboardRegistry, type KeyboardRegistry } from './registry.js';

interface UseKeyboardOptions {
  /** Override the registry (tests). Defaults to the shared singleton. */
  registry?: KeyboardRegistry;
  /** If true, the action does not attach the listener. */
  disabled?: boolean;
}

/**
 * Svelte action that wires a keyboard registry to `window` keydown events.
 *
 * Usage:
 *   ```svelte
 *   <svelte:window use:useKeyboard />
 *   ```
 *
 * The action returns a cleanup function so the listener is removed on destroy.
 */
export function useKeyboard(
  node: Window,
  options: UseKeyboardOptions = {}
): ActionReturn <UseKeyboardOptions> {
  const registry = options.registry ?? keyboardRegistry;

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    if (options.disabled) return;
    await registry.handle(event);
  }

  node.addEventListener('keydown', handleKeydown, { capture: true });

  return {
    destroy() {
      node.removeEventListener('keydown', handleKeydown, { capture: true });
    },
    update(newOptions: UseKeyboardOptions) {
      options = newOptions;
    },
  };
}
