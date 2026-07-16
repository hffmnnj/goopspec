<script lang="ts">
  import { page } from '$app/state';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { AiBrain01Icon, AiChipIcon } from '@hugeicons/core-free-icons';

  let { data, children } = $props();

  interface NavItem {
    href: string;
    label: string;
    icon: typeof AiBrain01Icon;
  }

  const base = $derived(`/${data.projectParam}/settings`);

  const navItems = $derived<NavItem[]>([
    { href: `${base}/agents`, label: 'Agents', icon: AiBrain01Icon },
    { href: `${base}/models`, label: 'Models', icon: AiChipIcon }
  ]);

  const pathname = $derived(page.url.pathname);

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
</script>

<div class="project-settings">
  <nav class="settings-nav" aria-label="Project settings sections">
    <ul class="nav-list">
      {#each navItems as item (item.href)}
        {@const active = isActive(item.href)}
        <li>
          <a
            href={item.href}
            class="nav-link"
            class:nav-link--active={active}
            aria-current={active ? 'page' : undefined}
          >
            <span class="nav-icon" aria-hidden="true">
              <HugeiconsIcon icon={item.icon} size={18} color="currentColor" strokeWidth={1.5} />
            </span>
            <span class="nav-label">{item.label}</span>
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <main class="settings-content" tabindex="-1">
    {@render children?.()}
  </main>
</div>

<style>
  .project-settings {
    display: grid;
    grid-template-columns: var(--settings-nav-width, 220px) minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    background-color: var(--bg-base);
    color: var(--text-primary);
  }

  /* --- Sidebar nav ------------------------------------------------------- */
  .settings-nav {
    border-right: 1px solid var(--border);
    padding: 1rem 0.75rem;
    background-color: var(--bg-base);
    position: sticky;
    top: 0;
    align-self: start;
    max-height: 100dvh;
    overflow-y: auto;
  }

  .nav-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.2;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .nav-link:hover {
    color: var(--text-primary);
    background-color: var(--bg-elevated);
  }

  .nav-link:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .nav-link--active {
    color: var(--accent-text);
    background-color: var(--accent-soft);
  }

  .nav-link--active:hover {
    color: var(--accent-text);
    background-color: var(--accent-soft);
  }

  .nav-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .nav-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* --- Content ----------------------------------------------------------- */
  .settings-content {
    min-width: 0;
    padding: 1.5rem clamp(1.25rem, 4vw, 2.5rem) 4rem;
    overflow-x: hidden;
  }

  .settings-content:focus-visible {
    outline: none;
  }

  /* --- Responsive: collapse sidebar to a top scroller on narrow screens -- */
  @media (max-width: 680px) {
    .project-settings {
      grid-template-columns: minmax(0, 1fr);
    }

    .settings-nav {
      position: static;
      max-height: none;
      border-right: none;
      border-bottom: 1px solid var(--border);
      padding: 0.5rem 0.75rem;
      overflow-x: auto;
    }

    .nav-list {
      flex-direction: row;
      gap: 0.25rem;
    }

    .nav-link {
      white-space: nowrap;
    }

    .settings-content {
      padding: 1.25rem 1rem 3rem;
    }
  }
</style>
