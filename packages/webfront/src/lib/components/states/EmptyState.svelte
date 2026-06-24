<script lang="ts">
  import type { Snippet } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { InboxIcon } from '@hugeicons/core-free-icons';

  interface EmptyStateProps {
    /** HugeIcons icon to render in the badge. Defaults to an inbox. */
    icon?: typeof InboxIcon;
    /** Primary heading. */
    title: string;
    /** Supporting description. */
    description?: string;
    /** Icon diameter in px. */
    iconSize?: number;
    /** Action area (e.g. a CTA button). Rendered below the description. */
    action?: Snippet;
    /** Additional classes. */
    class?: string;
  }

  let {
    icon = InboxIcon,
    title,
    description,
    iconSize = 24,
    action,
    class: className = '',
  }: EmptyStateProps = $props();
</script>

<div class={`empty-state ${className}`.trim()} role="status">
  <span class="empty-state__icon" aria-hidden="true">
    <HugeiconsIcon {icon} size={iconSize} strokeWidth={1.5} color="currentColor" />
  </span>
  <p class="empty-state__title">{title}</p>
  {#if description}
    <p class="empty-state__description">{description}</p>
  {/if}
  {#if action}
    <div class="empty-state__action">
      {@render action()}
    </div>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 0.375rem;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .empty-state__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 0.25rem;
    border-radius: var(--radius-full);
    color: var(--text-muted);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
  }

  .empty-state__title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-state__description {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--text-muted);
    max-width: 20rem;
  }

  .empty-state__action {
    margin-top: 0.625rem;
  }
</style>
