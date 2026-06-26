<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    SidebarLeft01Icon,
    SidebarRight01Icon,
    Cancel01Icon,
    Message01Icon,
    File01Icon,
    InboxIcon,
  } from '@hugeicons/core-free-icons';

  import {
    layout as defaultLayout,
    SIDEBAR_WIDTH,
    type LayoutStore,
  } from '$lib/stores/layout.svelte.js';
  import { fold } from '$lib/stores/fold.svelte.js';
  import { ui } from '$lib/stores/ui.svelte.js';
  import { voice } from '$lib/stores/voice.svelte.js';
  import { workspace } from '$lib/stores/workspace.svelte.js';
  import { projects } from '$lib/stores/projects.svelte.js';
  import { sessions } from '$lib/stores/sessions.svelte.js';

  import SessionSidebar from './sessions/SessionSidebar.svelte';
  import AddProjectPicker from './sessions/AddProjectPicker.svelte';
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
  import ToastContainer from './ToastContainer.svelte';
  import InstallPrompt from './InstallPrompt.svelte';
  import { useKeyboard } from '$lib/keyboard/actions.svelte.js';
  import { registerDefaultShortcuts } from '$lib/keyboard/shortcuts.js';
  import { initToastBindings } from '$lib/stores/toast-bindings.svelte.js';
  import { projectRoute } from '$lib/routing/navigation.js';
  import type { Project } from '$lib/api/types.js';

  interface AppShellProps {
    /** Override the layout store (tests / storybook). */
    layoutStore?: LayoutStore;
    /**
     * Optional main-content renderer for the chat column. When provided it
     * replaces the default `ChatPanel` (used by the root route to host the
     * home page); when omitted the shell renders the conversation as before.
     * The snippet receives the composer-insert handles so a custom main can
     * still drive the composer if it chooses to.
     */
    main?: import('svelte').Snippet<[{ composerInsertText?: string; composerInsertNonce: number }]>;
  }

  let { layoutStore = defaultLayout, main }: AppShellProps = $props();

  let fileQuery = $state('');
  let activeFilePath = $state<string | undefined>(undefined);
  let composerInsertText = $state<string | undefined>(undefined);
  let composerInsertNonce = $state(0);
  let drawerEl = $state<HTMLElement | null>(null);
  let previouslyFocused = $state<HTMLElement | null>(null);

  // Sidebar resize: the handle is a focusable vertical separator. Pointer drag
  // sets the width live; arrow keys nudge it. Bounds live in the layout store.
  const RESIZE_STEP = 16;
  let resizing = $state(false);

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
  const anyDrawerOpen = $derived(
    sidebarOverlay || filePanelOverlay || (isFoldable && layoutStore.filePanelOpen)
  );

  // Grid column widths fed to responsive.css via custom properties. The docked
  // sidebar width is driven by the layout store so resize + persistence flow
  // through a single source of truth.
  const sidebarWidthPx = $derived(`${layoutStore.sidebarWidth}px`);
  const colSidebar = $derived(sidebarInline ? sidebarWidthPx : '0px');
  const colFiles = $derived(filePanelInline ? 'var(--shell-filepanel-w)' : '0px');
  // The resize handle is only meaningful when the sidebar is docked inline on a
  // pointer device (desktop/tablet) — not the phone drawer or foldable segment.
  const sidebarResizable = $derived(sidebarInline && !isFoldable);

  // On phone, only the focused view is shown in the chat column.
  const phoneView = $derived(layoutStore.mobileView);

  const rootPath = $derived(workspace.currentPath ?? '.');

  onMount(() => {
    registerDefaultShortcuts();
    workspace.init();
    void projects.refresh();
    const stopSessions = sessions.initProjectWatcher();
    const stopLayout = layoutStore.init();
    const stopFold = fold.init();
    const stopToasts = initToastBindings();
    return () => {
      stopToasts();
      stopSessions();
      stopFold();
      stopLayout();
    };
  });

  function handleFileSelect(path: string): void {
    activeFilePath = path;
    composerInsertText = `@${path}`;
    composerInsertNonce += 1;
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

  function closeAddProject(): void {
    ui.addProjectOpen = false;
  }

  function handleAddProject(project: Project): void {
    projects.openProject(project);
    closeAddProject();
    void goto(projectRoute(project));
  }

  function closeOverlays(): void {
    layoutStore.closeOverlays();
    if (isTablet) layoutStore.setFilePanel(false);
  }

  function startResize(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    resizing = true;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture?.(event.pointerId);
  }

  function moveResize(event: PointerEvent): void {
    if (!resizing) return;
    // The sidebar starts at the viewport's left edge, so its width is the
    // pointer's x position. The store clamps to the allowed bounds.
    layoutStore.setSidebarWidth(event.clientX);
  }

  function endResize(event: PointerEvent): void {
    if (!resizing) return;
    resizing = false;
    const handle = event.currentTarget as HTMLElement;
    handle.releasePointerCapture?.(event.pointerId);
  }

  function resizeKeydown(event: KeyboardEvent): void {
    let delta = 0;
    if (event.key === 'ArrowLeft') delta = -RESIZE_STEP;
    else if (event.key === 'ArrowRight') delta = RESIZE_STEP;
    else if (event.key === 'Home') {
      event.preventDefault();
      layoutStore.setSidebarWidth(SIDEBAR_WIDTH.min);
      return;
    } else if (event.key === 'End') {
      event.preventDefault();
      layoutStore.setSidebarWidth(SIDEBAR_WIDTH.max);
      return;
    } else {
      return;
    }
    event.preventDefault();
    layoutStore.nudgeSidebarWidth(delta);
  }

  function drawerFocusables(): HTMLElement[] {
    if (!drawerEl) return [];
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(drawerEl.querySelectorAll<HTMLElement>(selector));
  }

  function trapDrawerFocus(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlays();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = drawerFocusables();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    if (!anyDrawerOpen) return;
    if (typeof document !== 'undefined') {
      previouslyFocused = document.activeElement as HTMLElement | null;
    }
    queueMicrotask(() => {
      const focusable = drawerFocusables();
      (focusable[0] ?? drawerEl)?.focus();
    });
    return () => previouslyFocused?.focus?.();
  });
</script>

<svelte:window use:useKeyboard />

<a href="#main-content" class="skip-link">Skip to content</a>

<!-- Polite ARIA live region announcing voice-capture state to screen readers. -->
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {voice.announcement}
</div>

<div
  class="app-shell"
  data-mode={mode}
  data-resizing={resizing ? 'true' : undefined}
  style:--col-sidebar={colSidebar}
  style:--col-files={colFiles}
>
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
        {@render mainContent()}
      </div>

      <!-- Files overlay anchored within the chat pane (right segment). -->
      {#if layoutStore.filePanelOpen}
        <div
          class="fold-files-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace files"
          tabindex={-1}
          bind:this={drawerEl}
          onkeydown={trapDrawerFocus}
        >
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
        </div>
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
      {#if sidebarResizable}
        <!--
          A focusable window-splitter: role="separator" with aria-valuenow is an
          interactive splitter per WAI-ARIA, so the tabindex + pointer/key
          handlers are intentional. Svelte's linter treats `separator` as
          non-interactive, hence the ignores.
        -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="sidebar-resizer"
          class:sidebar-resizer--active={resizing}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_WIDTH.min}
          aria-valuemax={SIDEBAR_WIDTH.max}
          aria-valuenow={layoutStore.sidebarWidth}
          tabindex="0"
          onpointerdown={startResize}
          onpointermove={moveResize}
          onpointerup={endResize}
          onpointercancel={endResize}
          onkeydown={resizeKeydown}
        >
          <span class="sidebar-resizer__grip" aria-hidden="true"></span>
        </div>
      {/if}
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
        {@render mainContent()}
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
  <button type="button" class="shell-backdrop" aria-hidden="true" tabindex="-1" onclick={closeOverlays}></button>
  <div
    class="shell-drawer shell-drawer--left"
    role="dialog"
    aria-modal="true"
    aria-label="Sessions"
    tabindex={-1}
    bind:this={drawerEl}
    onkeydown={trapDrawerFocus}
  >
    <div class="drawer-chrome">
      <span class="drawer-title">Sessions</span>
      <button type="button" class="chrome-btn" aria-label="Close sessions" onclick={closeOverlays}>
        <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} color="currentColor" />
      </button>
    </div>
    <div class="col-fill">
      <SessionSidebar />
    </div>
  </div>
{/if}

{#if filePanelOverlay}
  <button type="button" class="shell-backdrop" aria-hidden="true" tabindex="-1" onclick={closeOverlays}></button>
  <div
    class="shell-drawer shell-drawer--right"
    role="dialog"
    aria-modal="true"
    aria-label="Workspace files"
    tabindex={-1}
    bind:this={drawerEl}
    onkeydown={trapDrawerFocus}
  >
    <div class="drawer-chrome">
      <WorkspaceSwitcher />
      <button type="button" class="chrome-btn" aria-label="Close files" onclick={closeOverlays}>
        <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} color="currentColor" />
      </button>
    </div>
    <div class="col-fill">
      {@render filePanelBody()}
    </div>
  </div>
{/if}

<!-- Global overlays -->
<SettingsPanel open={ui.settingsOpen} onclose={closeSettings} />
{#if ui.addProjectOpen}
  <AddProjectPicker
    available={projects.unopenedAvailable()}
    onpick={handleAddProject}
    onclose={closeAddProject}
  />
{/if}
<CommandPalette />
<ShortcutHelp />
<ToastContainer />
<div class="install-prompt-host" aria-live="polite">
  <InstallPrompt />
</div>

{#snippet mainContent()}
  {#if main}
    {@render main({ composerInsertText, composerInsertNonce })}
  {:else}
    <ChatPanel {composerInsertText} {composerInsertNonce} />
  {/if}
{/snippet}

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
    position: relative;
    grid-column: sidebar;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background-color: var(--bg-elevated);
    overflow: hidden;
  }

  /* ---- Sidebar resize handle ---- */
  .sidebar-resizer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 0.5rem;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    cursor: col-resize;
    touch-action: none;
    background-color: transparent;
  }

  .sidebar-resizer__grip {
    width: 2px;
    height: 100%;
    background-color: transparent;
    transition: background-color var(--transition-fast);
  }

  .sidebar-resizer:hover .sidebar-resizer__grip,
  .sidebar-resizer--active .sidebar-resizer__grip {
    background-color: var(--accent);
  }

  .sidebar-resizer:focus-visible {
    outline: none;
  }

  .sidebar-resizer:focus-visible .sidebar-resizer__grip {
    background-color: var(--accent);
    box-shadow: 0 0 0 1px var(--focus-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-resizer__grip {
      transition: none;
    }
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
    outline: 2px solid var(--focus-ring);
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
    color: var(--accent-text);
  }

  .nav-tab:focus-visible {
    outline: 2px solid var(--focus-ring);
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

  .install-prompt-host {
    position: fixed;
    right: max(1rem, var(--safe-right));
    bottom: max(1rem, var(--safe-bottom));
    z-index: 50;
    pointer-events: none;
  }

  .install-prompt-host :global(.install-prompt) {
    pointer-events: auto;
  }

  @media (max-width: 639px) {
    .install-prompt-host {
      right: 1rem;
      bottom: calc(4.5rem + var(--safe-bottom));
    }
  }
</style>
