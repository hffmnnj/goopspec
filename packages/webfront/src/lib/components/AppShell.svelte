<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    SidebarLeft01Icon,
    SidebarRight01Icon,
    Cancel01Icon,
    Message01Icon,
    File01Icon,
    InboxIcon,
  } from '@hugeicons/core-free-icons';

  import { layout as defaultLayout, type LayoutStore } from '$lib/stores/layout.svelte.js';
  import { fold } from '$lib/stores/fold.svelte.js';
  import { ui } from '$lib/stores/ui.svelte.js';
  import { workspace } from '$lib/stores/workspace.svelte.js';

  import SessionSidebar from './sessions/SessionSidebar.svelte';
  import ChatPanel from './chat/ChatPanel.svelte';
  import FileSearch from './files/FileSearch.svelte';
  import FileTree from './files/FileTree.svelte';
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
  import SettingsButton from './settings/SettingsButton.svelte';
  import SettingsPanel from './settings/SettingsPanel.svelte';
  import ConnectionStatus from './ConnectionStatus.svelte';

  // T10.3 SEAM: overlays + keyboard wiring mounted here (they self-register via
  // the `ui` store / keyboard registry). T10.3 finalizes command-source wiring.
  import CommandPalette from './CommandPalette.svelte';
  import ShortcutHelp from './ShortcutHelp.svelte';
  import { useKeyboard } from '$lib/keyboard/actions.svelte.js';
  import { registerDefaultShortcuts } from '$lib/keyboard/shortcuts.js';

  interface AppShellProps {
    /** Override the layout store (tests / storybook). */
    layoutStore?: LayoutStore;
  }

  let { layoutStore = defaultLayout }: AppShellProps = $props();

  let fileQuery = $state('');
  // Held locally for now; T10.3 promotes this into the chat composer.
  let activeFilePath = $state<string | undefined>(undefined);

  const mode = $derived(layoutStore.mode);
  const isPhone = $derived(layoutStore.isPhone);
  const isTablet = $derived(layoutStore.isTablet);
  const isDesktop = $derived(layoutStore.isDesktop);
  // Foldable: two horizontal segments → side-by-side panes (sessions | chat).
  const isFoldable = $derived(layoutStore.isFoldable);

  // On desktop the side columns are inline; on tablet/phone the file panel (and
  // on phone the sidebar) is an overlay drawer rather than a grid column.
  const sidebarInline = $derived(!isPhone && layoutStore.sidebarOpen);
  const filePanelInline = $derived(isDesktop && layoutStore.filePanelOpen);

  const sidebarOverlay = $derived(isPhone && layoutStore.sidebarOpen);
  const filePanelOverlay = $derived(
    layoutStore.filePanelOpen && (isPhone || isTablet)
  );

  // Grid column widths fed to responsive.css via custom properties.
  const colSidebar = $derived(sidebarInline ? 'var(--shell-sidebar-w)' : '0px');
  const colFiles = $derived(filePanelInline ? 'var(--shell-filepanel-w)' : '0px');

  // On phone, only the focused view is shown in the chat column.
  const phoneView = $derived(layoutStore.mobileView);

  const rootPath = $derived(workspace.currentPath ?? '.');

  onMount(() => {
    registerDefaultShortcuts();
    const stopLayout = layoutStore.init();
    const stopFold = fold.init();
    return () => {
      stopFold();
      stopLayout();
    };
  });

  function handleFileSelect(path: string): void {
    activeFilePath = path;
    if (isPhone) {
      layoutStore.setMobileView('chat');
      layoutStore.setFilePanel(false);
    }
  }

  function openSettings(): void {
    ui.settingsOpen = true;
  }

  function closeSettings(): void {
    ui.settingsOpen = false;
  }

  function closeOverlays(): void {
    layoutStore.closeOverlays();
    if (isTablet) layoutStore.setFilePanel(false);
  }
</script>

<svelte:window use:useKeyboard />

<a href="#main-content" class="skip-link">Skip to content</a>

<div class="app-shell" data-mode={mode} style:--col-sidebar={colSidebar} style:--col-files={colFiles}>
  {#if isFoldable}
    <!-- Foldable two-pane: sessions on the left segment, chat on the right. -->
    <div class="fold-pane fold-pane--nav" role="navigation" aria-label="Sessions">
      <SessionSidebar />
    </div>

    <!-- Hinge gutter — empty so no content sits under the physical fold. -->
    <div class="fold-hinge" aria-hidden="true"></div>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- skip-link focus target -->
    <main
      id="main-content"
      class="fold-pane fold-pane--chat app-shell__col--chat"
      aria-label="Conversation"
      tabindex={-1}
    >
      <div class="chat-topbar">
        <span class="topbar-spacer"></span>
        <SettingsButton onclick={openSettings} />
        <button
          type="button"
          class="chrome-btn"
          aria-label={layoutStore.filePanelOpen ? 'Close files' : 'Open files'}
          aria-expanded={layoutStore.filePanelOpen}
          title="Files"
          onclick={() => layoutStore.toggleFilePanel()}
        >
          <HugeiconsIcon icon={SidebarRight01Icon} size={18} strokeWidth={1.5} color="currentColor" />
        </button>
      </div>

      <div class="chat-region">
        <ChatPanel />
      </div>

      <!-- Files overlay anchored within the chat pane (right segment). -->
      {#if layoutStore.filePanelOpen}
        <aside class="fold-files-overlay" aria-label="Workspace files">
          <div class="drawer-chrome">
            <WorkspaceSwitcher />
            <button
              type="button"
              class="chrome-btn"
              aria-label="Close files"
              onclick={() => layoutStore.setFilePanel(false)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} color="currentColor" />
            </button>
          </div>
          <div class="col-fill">
            {@render filePanelBody()}
          </div>
        </aside>
      {/if}
    </main>
  {:else}
  <!-- Left: session sidebar (inline on desktop/tablet) -->
  {#if sidebarInline}
    <div class="app-shell__col app-shell__col--sidebar" role="navigation" aria-label="Sessions">
      <div class="col-chrome col-chrome--left">
        <button
          type="button"
          class="chrome-btn"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          onclick={() => layoutStore.toggleSidebar()}
        >
          <HugeiconsIcon icon={SidebarLeft01Icon} size={18} strokeWidth={1.5} color="currentColor" />
        </button>
      </div>
      <div class="col-fill">
        <SessionSidebar />
      </div>
    </div>
  {/if}

  <!-- Center: chat (the only column on phone) -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -- focus target for the skip link -->
  <main
    id="main-content"
    class="app-shell__col app-shell__col--chat"
    aria-label="Conversation"
    tabindex={-1}
  >
    <div class="chat-topbar">
      {#if !sidebarInline}
        <button
          type="button"
          class="chrome-btn"
          aria-label="Open sessions"
          aria-expanded={layoutStore.sidebarOpen}
          title="Sessions"
          onclick={() => (isPhone ? layoutStore.setMobileView('sessions') : layoutStore.toggleSidebar())}
        >
          <HugeiconsIcon icon={SidebarLeft01Icon} size={18} strokeWidth={1.5} color="currentColor" />
        </button>
      {/if}

      <span class="topbar-spacer"></span>

      <SettingsButton onclick={openSettings} />

      {#if !filePanelInline}
        <button
          type="button"
          class="chrome-btn"
          aria-label={layoutStore.filePanelOpen ? 'Close files' : 'Open files'}
          aria-expanded={layoutStore.filePanelOpen}
          title="Files"
          onclick={() => (isPhone ? layoutStore.setMobileView('files') : layoutStore.toggleFilePanel())}
        >
          <HugeiconsIcon icon={SidebarRight01Icon} size={18} strokeWidth={1.5} color="currentColor" />
        </button>
      {/if}
    </div>

    <div class="chat-region">
      {#if isPhone && phoneView !== 'chat'}
        {#if phoneView === 'sessions'}
          <div class="phone-view" role="navigation" aria-label="Sessions">
            <SessionSidebar />
          </div>
        {:else if phoneView === 'files'}
          <div class="phone-view" role="complementary" aria-label="Workspace files">
            {@render filePanelBody()}
          </div>
        {/if}
      {:else}
        <ChatPanel />
      {/if}
    </div>
  </main>

  <!-- Right: file panel (inline only on desktop) -->
  {#if filePanelInline}
    <div class="app-shell__col app-shell__col--files" role="complementary" aria-label="Workspace files">
      <div class="col-chrome col-chrome--right">
        <WorkspaceSwitcher />
        <button
          type="button"
          class="chrome-btn"
          aria-label="Collapse files"
          title="Collapse files"
          onclick={() => layoutStore.toggleFilePanel()}
        >
          <HugeiconsIcon icon={SidebarRight01Icon} size={18} strokeWidth={1.5} color="currentColor" />
        </button>
      </div>
      <div class="col-fill">
        {@render filePanelBody()}
      </div>
    </div>
  {/if}

  <!-- Phone bottom navigation -->
  {#if isPhone}
    <nav class="shell-nav" aria-label="Views">
      <button
        type="button"
        class="nav-tab"
        class:active={phoneView === 'sessions'}
        aria-current={phoneView === 'sessions' ? 'page' : undefined}
        onclick={() => layoutStore.setMobileView('sessions')}
      >
        <HugeiconsIcon icon={InboxIcon} size={20} strokeWidth={1.5} color="currentColor" />
        <span class="nav-label">Sessions</span>
      </button>
      <button
        type="button"
        class="nav-tab"
        class:active={phoneView === 'chat'}
        aria-current={phoneView === 'chat' ? 'page' : undefined}
        onclick={() => layoutStore.setMobileView('chat')}
      >
        <HugeiconsIcon icon={Message01Icon} size={20} strokeWidth={1.5} color="currentColor" />
        <span class="nav-label">Chat</span>
      </button>
      <button
        type="button"
        class="nav-tab"
        class:active={phoneView === 'files'}
        aria-current={phoneView === 'files' ? 'page' : undefined}
        onclick={() => layoutStore.setMobileView('files')}
      >
        <HugeiconsIcon icon={File01Icon} size={20} strokeWidth={1.5} color="currentColor" />
        <span class="nav-label">Files</span>
      </button>
    </nav>
  {/if}
  {/if}
</div>

<!-- Tablet/phone overlay drawers -->
{#if sidebarOverlay}
  <button type="button" class="shell-backdrop" aria-label="Close sessions" onclick={closeOverlays}></button>
  <aside class="shell-drawer shell-drawer--left" role="navigation" aria-label="Sessions">
    <div class="drawer-chrome">
      <span class="drawer-title">Sessions</span>
      <button type="button" class="chrome-btn" aria-label="Close sessions" onclick={closeOverlays}>
        <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} color="currentColor" />
      </button>
    </div>
    <div class="col-fill">
      <SessionSidebar />
    </div>
  </aside>
{/if}

{#if filePanelOverlay}
  <button type="button" class="shell-backdrop" aria-label="Close files" onclick={closeOverlays}></button>
  <aside class="shell-drawer shell-drawer--right" aria-label="Workspace files">
    <div class="drawer-chrome">
      <WorkspaceSwitcher />
      <button type="button" class="chrome-btn" aria-label="Close files" onclick={closeOverlays}>
        <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} color="currentColor" />
      </button>
    </div>
    <div class="col-fill">
      {@render filePanelBody()}
    </div>
  </aside>
{/if}

<!-- Global overlays -->
<SettingsPanel open={ui.settingsOpen} onclose={closeSettings} />
<CommandPalette />
<ShortcutHelp />

{#snippet filePanelBody()}
  <div class="file-panel">
    <FileSearch bind:value={fileQuery} />
    <div class="file-panel__tree">
      <FileTree
        {rootPath}
        searchQuery={fileQuery}
        activePath={activeFilePath}
        onFileSelect={handleFileSelect}
      />
    </div>
    <footer class="file-panel__footer">
      <ConnectionStatus />
    </footer>
  </div>
{/snippet}

<style>
  /* ---- Column scaffolding ---- */
  .app-shell__col--sidebar {
    grid-column: sidebar;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background-color: var(--bg-elevated);
    overflow: hidden;
  }

  .app-shell__col--chat {
    grid-column: chat;
    display: flex;
    flex-direction: column;
    min-width: 0;
    outline: none;
  }

  .app-shell__col--files {
    grid-column: files;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    background-color: var(--bg-elevated);
    overflow: hidden;
  }

  .col-fill {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* ---- Column chrome (collapse buttons, workspace switcher) ---- */
  .col-chrome {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    padding-top: calc(0.5rem + var(--safe-top));
    border-bottom: 1px solid var(--border);
    min-height: 3rem;
  }

  .col-chrome--right {
    justify-content: space-between;
  }

  .chat-topbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    padding-top: calc(0.5rem + var(--safe-top));
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-base);
    min-height: 3rem;
  }

  .topbar-spacer {
    flex: 1 1 auto;
  }

  .chat-region {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .phone-view {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-elevated);
  }

  /* ---- File panel composition ---- */
  .file-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .file-panel__tree {
    flex: 1 1 auto;
    min-height: 0;
  }

  .file-panel__footer {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.625rem;
    padding-bottom: calc(0.5rem + var(--safe-bottom));
    border-top: 1px solid var(--border);
  }

  /* ---- Chrome buttons ---- */
  .chrome-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background-color: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .chrome-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border-color: var(--border);
  }

  .chrome-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* ---- Drawer chrome ---- */
  .drawer-chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    padding-top: calc(0.5rem + var(--safe-top));
    border-bottom: 1px solid var(--border);
    min-height: 3rem;
  }

  .drawer-title {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  /* ---- Phone bottom nav ---- */
  .nav-tab {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    padding: 0.5rem 0.25rem;
    border: none;
    background-color: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .nav-tab.active {
    color: var(--accent);
  }

  .nav-tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .nav-label {
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: -0.01em;
  }

  @media (prefers-reduced-motion: reduce) {
    .chrome-btn,
    .nav-tab {
      transition: none;
    }
  }
</style>
