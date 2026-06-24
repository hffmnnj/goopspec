// Public library API for @goopspec/webfront.

// Components
export { default as AppShell } from './components/AppShell.svelte';
export { default as CommandPalette } from './components/CommandPalette.svelte';
export { default as ConnectionStatus } from './components/ConnectionStatus.svelte';
export { default as GlassSurface } from './components/GlassSurface.svelte';
export { default as InstallPrompt } from './components/InstallPrompt.svelte';
export { default as ModelSwitcher } from './components/ModelSwitcher.svelte';
export { default as ShortcutHelp } from './components/ShortcutHelp.svelte';
export { default as ThemeToggle } from './components/ThemeToggle.svelte';
export { default as Toast } from './components/Toast.svelte';
export { default as ToastContainer } from './components/ToastContainer.svelte';
export { default as WorkspaceSwitcher } from './components/WorkspaceSwitcher.svelte';
export { default as ChatPanel } from './components/chat/ChatPanel.svelte';
export { default as CodeBlock } from './components/chat/CodeBlock.svelte';
export { default as DiffView } from './components/chat/DiffView.svelte';
export { default as Markdown } from './components/chat/Markdown.svelte';
export { default as MessageInput } from './components/chat/MessageInput.svelte';
export { default as MessageList } from './components/chat/MessageList.svelte';
export { default as ToolCard } from './components/chat/ToolCard.svelte';
export { default as ToolOutput } from './components/chat/ToolOutput.svelte';
export { default as FileSearch } from './components/files/FileSearch.svelte';
export { default as FileTree } from './components/files/FileTree.svelte';
export { default as FileTreeNode } from './components/files/FileTreeNode.svelte';
export { default as SettingsButton } from './components/settings/SettingsButton.svelte';
export { default as SettingsPanel } from './components/settings/SettingsPanel.svelte';
export { default as ProjectRail } from './components/sessions/ProjectRail.svelte';
export { default as SessionCard } from './components/sessions/SessionCard.svelte';
export { default as SessionSearch } from './components/sessions/SessionSearch.svelte';
export { default as SessionSidebar } from './components/sessions/SessionSidebar.svelte';
export { default as ShareButton } from './components/sessions/ShareButton.svelte';
export * from './components/states/index.js';

// API
export * from './api/client.js';
export * from './api/config.js';
export * from './api/files.js';
export * from './api/messages.js';
export * from './api/providers.js';
export * from './api/sessions.js';
export * from './api/stream.js';
export type * from './api/types.js';

// Stores
export * from './stores/active-session.svelte.js';
export * from './stores/chat.svelte.js';
export * from './stores/connection.svelte.js';
export * from './stores/fold.svelte.js';
export * from './stores/layout.svelte.js';
export * from './stores/model.svelte.js';
export * from './stores/projects.svelte.js';
export * from './stores/pwa.svelte.js';
export * from './stores/sessions.svelte.js';
export * from './stores/settings.svelte.js';
export * from './stores/theme.svelte.js';
export * from './stores/toast.svelte.js';
export * from './stores/toast-bindings.svelte.js';
export * from './stores/ui.svelte.js';
export * from './stores/workspace.svelte.js';

// Commands and keyboard
export * from './commands/commands.js';
export * from './commands/registry.js';
export * from './keyboard/actions.svelte.js';
export * from './keyboard/platform.js';
export * from './keyboard/registry.js';
export * from './keyboard/shortcuts.js';

// Utilities
export * from './diff/parse.js';
export * from './files/filter.js';
export * from './markdown/render.js';
export * from './sessions/export.js';
export * from './sessions/search.js';
export * from './utils.js';
