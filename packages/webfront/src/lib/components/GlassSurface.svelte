<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  type GlassVariant = 'default' | 'subtle' | 'strong' | 'panel' | 'floating';

  interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
    /** Visual treatment of the glass surface. */
    variant?: GlassVariant;
    /** Additional classes, merged with the glass classes via `cn()`. */
    class?: string;
    /** HTML tag to render as the root element. */
    element?: string;
    /** Slotted content. */
    children: Snippet;
  }

  let {
    variant = 'default',
    class: className,
    element = 'div',
    children,
    ...rest
  }: GlassSurfaceProps = $props();

  /** Map each variant to its modifier class (default has no modifier). */
  const VARIANT_CLASS: Record<GlassVariant, string> = {
    default: '',
    subtle: 'glass-surface--subtle',
    strong: 'glass-surface--strong',
    panel: 'glass-surface--panel',
    floating: 'glass-surface--floating',
  };

  let classes = $derived(
    cn('glass-surface', VARIANT_CLASS[variant], className)
  );
</script>

<svelte:element this={element} class={classes} {...rest}>
  {@render children()}
</svelte:element>
