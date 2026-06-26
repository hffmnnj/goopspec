<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    PaintBoardIcon,
    Mic01Icon,
    CloudServerIcon,
    Settings01Icon,
    AiBrain01Icon,
    Folder01Icon,
    ArrowLeft02Icon
  } from '@hugeicons/core-free-icons';

  let { children } = $props();

  interface NavItem {
    href: string;
    label: string;
    icon: typeof PaintBoardIcon;
  }

  const NAV_ITEMS: NavItem[] = [
    { href: '/settings/appearance', label: 'Appearance', icon: PaintBoardIcon },
    { href: '/settings/voice', label: 'Voice', icon: Mic01Icon },
    { href: '/settings/server', label: 'Server', icon: CloudServerIcon },
    { href: '/settings/goopspec', label: 'GoopSpec', icon: Settings01Icon },
    { href: '/settings/agents', label: 'Agents', icon: AiBrain01Icon },
    { href: '/settings/project', label: 'Project', icon: Folder01Icon }
  ];

  /** Current pathname, reactive to navigation. */
  const pathname = $derived(page.url.pathname);

  /** A nav item is active when the path matches or nests under its href. */
  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function goBack(): void {
    void goto('/');
  }
</script>

<div class="settings-shell">
  <header class="settings-topbar">
    <button type="button" class="back-button" onclick={goBack} aria-label="Back to projects">
      <HugeiconsIcon icon={ArrowLeft02Icon} size={18} color="currentColor" strokeWidth={1.5} />
      <span>Projects</span>
    </button>
    <h1 class="settings-title">Settings</h1>
  </header>

  <div class="settings-body">
    <nav class="settings-nav" aria-label="Settings sections">
      <ul class="nav-list">
        {#each NAV_ITEMS as item (item.href)}
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
</div>

<style>
  .settings-shell {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background-color: var(--bg-base);
    color: var(--text-primary);
  }

  /* --- Top bar ----------------------------------------------------------- */
  .settings-topbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    height: 3.5rem;
    padding: 0 1.25rem;
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-base);
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 2.25rem;
    padding: 0 0.75rem 0 0.625rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background-color: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast);
  }

  .back-button:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
    background-color: var(--bg-surface);
  }

  .back-button:active {
    transform: scale(0.97);
  }

  .back-button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .settings-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  /* --- Two-column body --------------------------------------------------- */
  .settings-body {
    display: grid;
    grid-template-columns: var(--settings-nav-width, 220px) minmax(0, 1fr);
    flex: 1;
    min-height: 0;
  }

  .settings-nav {
    border-right: 1px solid var(--border);
    padding: 1rem 0.75rem;
    background-color: var(--bg-base);
    position: sticky;
    top: 3.5rem;
    align-self: start;
    max-height: calc(100dvh - 3.5rem);
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
    .settings-body {
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

  @media (prefers-reduced-motion: reduce) {
    .back-button {
      transition: none;
    }

    .back-button:active {
      transform: none;
    }
  }
</style>
