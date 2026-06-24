export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  parentID?: string;
  messageCount?: number;
  cost?: number;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool-invoke'; id?: string; tool: string; input?: unknown }
  | { type: 'tool-result'; id?: string; tool?: string; output?: unknown; error?: string }
  | { type: 'step-start'; id?: string; title?: string }
  | { type: 'step-finish'; id?: string; title?: string; status?: 'success' | 'error' | 'cancelled' };

export interface Message {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: string;
  updatedAt?: string;
  cost?: number;
  model?: string;
  provider?: string;
}

export interface Model {
  id: string;
  name: string;
  context?: number;
  cost?: {
    input?: number;
    output?: number;
  };
}

export interface Provider {
  id: string;
  name: string;
  models: Model[];
  defaultModelId?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  mode?: 'primary' | 'subagent' | 'all';
  hidden?: boolean;
  [key: string]: unknown;
}

/**
 * An OpenCode slash command, as returned by `GET /command`.
 *
 * Mirrors the SDK `Command` shape: `name` is the bare command (no leading
 * slash), `template` is the prompt template the server expands when the command
 * runs, and `agent`/`model` optionally pin the run to a specific agent/model.
 */
export interface SlashCommand {
  /** Bare command name without the leading slash (e.g. `help`). */
  name: string;
  /** Human-readable description shown in the completion menu. */
  description?: string;
  /** Agent the command runs under, when pinned. */
  agent?: string;
  /** Model the command runs under, when pinned. */
  model?: string;
  /** Prompt template the server expands; presence hints the command takes arguments. */
  template?: string;
  /** Whether the command spawns a subtask. */
  subtask?: boolean;
}

export interface OpenCodeConfig {
  provider?: string;
  model?: string;
  theme?: string;
  [key: string]: unknown;
}

export type Project = {
  id: string;
  worktree: string;
  vcsDir?: string;
  vcs?: 'git';
  time: { created: number; initialized?: number };
};

export type VcsInfo = {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
} | null;

export type GlobalEvent = {
  type: string;
  [key: string]: unknown;
};

/** Per-file change for a session, as returned by `GET /session/{id}/diff`. */
export interface FileDiff {
  /** Repository-relative file path. */
  file: string;
  /** File contents before the session's changes. */
  before: string;
  /** File contents after the session's changes. */
  after: string;
  additions: number;
  deletions: number;
}

/**
 * A single entry in the workspace file tree — either a file or a directory.
 * `children` is populated lazily by the file tree as directories are expanded;
 * a freshly-listed directory entry has `children` undefined (not yet loaded).
 */
export interface FileEntry {
  /** Display name (basename) of the entry. */
  name: string;
  /** Server-relative path used for subsequent reads/listings. */
  path: string;
  /** Whether the entry is a file or a directory. */
  type: 'file' | 'directory';
  /** Byte size, when the server reports it (files only). */
  size?: number;
  /** Lazily-loaded child entries (directories only). */
  children?: FileEntry[];
}

export type SSEEvent =
  | { type: 'session.created'; session: Session; raw?: unknown }
  | { type: 'session.updated'; session: Session; raw?: unknown }
  | { type: 'session.deleted'; sessionId: string; raw?: unknown }
  | { type: 'message.part.text'; messageId?: string; text: string; raw?: unknown }
  | { type: 'message.part.tool-invoke'; messageId?: string; part: Extract<MessagePart, { type: 'tool-invoke' }>; raw?: unknown }
  | { type: 'message.part.tool-result'; messageId?: string; part: Extract<MessagePart, { type: 'tool-result' }>; raw?: unknown }
  | { type: 'message.part.step-start'; messageId?: string; part: Extract<MessagePart, { type: 'step-start' }>; raw?: unknown }
  | { type: 'message.part.step-finish'; messageId?: string; part: Extract<MessagePart, { type: 'step-finish' }>; raw?: unknown }
  | { type: 'message.completed'; messageId?: string; message?: Message; raw?: unknown }
  | { type: 'message.error'; messageId?: string; error: string; raw?: unknown }
  | { type: 'app.ready'; raw?: unknown }
  | { type: 'app.error'; error: string; raw?: unknown }
  | { type: 'session.error'; sessionId?: string; error: string; raw?: unknown }
  | { type: 'provider.auth.error'; providerId?: string; error: string; raw?: unknown };

export interface CreateSessionOptions {
  title?: string;
  path?: string;
  directory?: string;
}

export interface SendMessageInput {
  text: string;
  providerId?: string;
  modelId?: string;
  agent?: string;
  parts?: MessagePart[];
}

/** Request body for `POST /session/{id}/command` (execute a slash command). */
export interface RunCommandInput {
  /** Bare command name without the leading slash. */
  command: string;
  /** Free-text arguments following the command name. */
  arguments: string;
  /** Agent override; falls back to the server default when omitted. */
  agent?: string;
  /** Model override in `providerID/modelID` form. */
  model?: string;
}

export interface EventHandlers {
  onEvent?: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
}

export interface GlobalEventHandlers {
  onError?: (error: Error) => void;
  onOpen?: () => void;
}

export type Unsubscribe = () => void;

export interface OpenCodeClient {
  listProjects(): Promise<Project[]>;
  getCurrentProject(): Promise<Project | null>;
  getPath(): Promise<{ path: string }>;
  getVcsInfo(): Promise<VcsInfo>;
  subscribeGlobalEvents(handler: (event: GlobalEvent) => void, handlers?: GlobalEventHandlers): { close(): void };
  listSessions(directory?: string): Promise<Session[]>;
  createSession(opts?: CreateSessionOptions): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  renameSession(id: string, title: string): Promise<Session>;
  getMessages(sessionId: string): Promise<Message[]>;
  getSessionDiff(sessionId: string): Promise<FileDiff[]>;
  sendMessage(sessionId: string, input: SendMessageInput, directory?: string): Promise<Message>;
  runCommand(sessionId: string, input: RunCommandInput, directory?: string): Promise<Message>;
  subscribeEvents(sessionId: string, handlers: EventHandlers): Unsubscribe;
  listProviders(): Promise<Provider[]>;
  listAgents(): Promise<Agent[]>;
  listCommands(): Promise<SlashCommand[]>;
  getConfig(): Promise<OpenCodeConfig>;
  updateConfig(patch: Partial<OpenCodeConfig>): Promise<OpenCodeConfig>;
  readFile(path: string): Promise<string>;
  listDirectory(path: string): Promise<FileEntry[]>;
}
