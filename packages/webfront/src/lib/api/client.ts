import { getServerUrl } from './config';
import type {
  CreateSessionOptions,
  EventHandlers,
  FileEntry,
  GlobalEvent,
  Message,
  MessagePart,
  OpenCodeClient,
  OpenCodeConfig,
  FileDiff,
  Provider,
  Project,
  SSEEvent,
  SendMessageInput,
  Session,
  Unsubscribe,
  VcsInfo
} from './types';

export class OpenCodeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'OpenCodeApiError';
  }
}

const EVENT_TYPES = [
  'session.created',
  'session.updated',
  'session.deleted',
  'message.part.text',
  'message.part.tool-invoke',
  'message.part.tool-result',
  'message.part.step-start',
  'message.part.step-finish',
  'message.completed',
  'message.error',
  'app.ready',
  'app.error',
  'session.error',
  'provider.auth.error'
] as const;

type RawRecord = Record<string, unknown>;

type RawOpenCodeMessageEnvelope = {
  info?: unknown;
  parts?: unknown;
};

function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null ? (value as RawRecord) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function timestampToIso(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return fallback;
}

function parseData(data: string): unknown {
  if (!data) return undefined;

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function unwrapData<T>(value: unknown): T {
  const record = asRecord(value);
  return (record.data ?? value) as T;
}

function normalizeSession(value: unknown): Session {
  const raw = asRecord(value);
  const time = asRecord(raw.time);
  const createdAt = timestampToIso(raw.createdAt ?? time.created);
  const updatedAt = timestampToIso(raw.updatedAt ?? time.updated ?? time.created, createdAt);
  const summary = asRecord(raw.summary);

  return {
    ...(raw as unknown as Partial<Session>),
    id: asString(raw.id),
    title: asString(raw.title, 'Untitled session'),
    createdAt,
    updatedAt,
    parentID: asOptionalString(raw.parentID),
    messageCount: asOptionalNumber(raw.messageCount),
    cost: asOptionalNumber(raw.cost ?? summary.cost),
  };
}

function normalizeTextPart(raw: RawRecord): MessagePart | undefined {
  const text = asString(raw.text);
  return text.length > 0 ? { type: 'text', text } : undefined;
}

function normalizeToolPart(raw: RawRecord): MessagePart | undefined {
  const state = asRecord(raw.state);
  const status = asOptionalString(state.status);
  const id = asOptionalString(raw.id ?? raw.callID);
  const tool = asString(raw.tool, 'tool');

  if (status === 'completed' || status === 'error') {
    return {
      type: 'tool-result',
      id,
      tool,
      output: state.output,
      error: asOptionalString(state.error),
    };
  }

  return {
    type: 'tool-invoke',
    id,
    tool,
    input: state.input,
  };
}

function normalizeMessagePart(value: unknown): MessagePart | undefined {
  const raw = asRecord(value);
  const type = asString(raw.type);

  switch (type) {
    case 'text':
      return normalizeTextPart(raw);
    case 'tool':
      return normalizeToolPart(raw);
    case 'tool-invoke':
      return mapToolInvoke(raw);
    case 'tool-result':
      return mapToolResult(raw);
    case 'step-start':
      return { type: 'step-start', id: asOptionalString(raw.id), title: asOptionalString(raw.title ?? raw.snapshot) };
    case 'step-finish':
      return {
        type: 'step-finish',
        id: asOptionalString(raw.id),
        title: asOptionalString(raw.title ?? raw.reason ?? raw.snapshot),
        status: asOptionalString(raw.status) as 'success' | 'error' | 'cancelled' | undefined,
      };
    default:
      return undefined;
  }
}

function normalizeMessage(value: unknown): Message {
  const envelope = asRecord(value as RawOpenCodeMessageEnvelope);
  const info = asRecord(envelope.info ?? value);
  const rawParts = Array.isArray(envelope.parts)
    ? envelope.parts
    : Array.isArray(info.parts)
      ? info.parts
      : [];
  const createdAt = timestampToIso(info.createdAt ?? asRecord(info.time).created);
  const updatedAt = timestampToIso(info.updatedAt ?? asRecord(info.time).completed, createdAt);
  const role = asString(info.role, 'assistant') as Message['role'];

  return {
    ...(info as unknown as Partial<Message>),
    id: asString(info.id),
    role,
    parts: rawParts.map(normalizeMessagePart).filter((part): part is MessagePart => part !== undefined),
    createdAt,
    updatedAt,
    cost: asOptionalNumber(info.cost),
    model: asOptionalString(info.model ?? info.modelID),
    provider: asOptionalString(info.provider ?? info.providerID),
  };
}

function normalizeMessages(value: unknown): Message[] {
  return Array.isArray(value) ? value.map(normalizeMessage) : [];
}

function messageIdFrom(raw: RawRecord): string | undefined {
  return asOptionalString(raw.messageId ?? raw.messageID ?? raw.message_id);
}

function errorFrom(raw: RawRecord): string {
  return asString(raw.error ?? raw.message ?? raw.reason, 'Unknown OpenCode error');
}

function mapToolInvoke(raw: RawRecord): Extract<MessagePart, { type: 'tool-invoke' }> {
  const part = asRecord(raw.part ?? raw);
  return {
    type: 'tool-invoke',
    id: asOptionalString(part.id),
    tool: asString(part.tool ?? part.name, 'tool'),
    input: part.input ?? part.args
  };
}

function mapToolResult(raw: RawRecord): Extract<MessagePart, { type: 'tool-result' }> {
  const part = asRecord(raw.part ?? raw);
  return {
    type: 'tool-result',
    id: asOptionalString(part.id),
    tool: asOptionalString(part.tool ?? part.name),
    output: part.output ?? part.result,
    error: asOptionalString(part.error)
  };
}

function mapStepStart(raw: RawRecord): Extract<MessagePart, { type: 'step-start' }> {
  const part = asRecord(raw.part ?? raw);
  return { type: 'step-start', id: asOptionalString(part.id), title: asOptionalString(part.title) };
}

function mapStepFinish(raw: RawRecord): Extract<MessagePart, { type: 'step-finish' }> {
  const part = asRecord(raw.part ?? raw);
  const status = asOptionalString(part.status);
  return {
    type: 'step-finish',
    id: asOptionalString(part.id),
    title: asOptionalString(part.title),
    status: status === 'success' || status === 'error' || status === 'cancelled' ? status : undefined
  };
}

export function parseSSEEvent(type: string, data: string): SSEEvent | undefined {
  const parsed = unwrapData<unknown>(parseData(data));
  const raw = asRecord(parsed);

  switch (type) {
    case 'session.created':
    case 'session.updated':
      return { type, session: unwrapData<Session>(raw.session ?? parsed), raw: parsed };
    case 'session.deleted':
      return { type, sessionId: asString(raw.sessionId ?? raw.id), raw: parsed };
    case 'message.part.text':
      return { type, messageId: messageIdFrom(raw), text: asString(raw.text ?? raw.content ?? raw.delta), raw: parsed };
    case 'message.part.tool-invoke':
      return { type, messageId: messageIdFrom(raw), part: mapToolInvoke(raw), raw: parsed };
    case 'message.part.tool-result':
      return { type, messageId: messageIdFrom(raw), part: mapToolResult(raw), raw: parsed };
    case 'message.part.step-start':
      return { type, messageId: messageIdFrom(raw), part: mapStepStart(raw), raw: parsed };
    case 'message.part.step-finish':
      return { type, messageId: messageIdFrom(raw), part: mapStepFinish(raw), raw: parsed };
    case 'message.completed':
      return { type, messageId: messageIdFrom(raw), message: raw.message as Message | undefined, raw: parsed };
    case 'message.error':
      return { type, messageId: messageIdFrom(raw), error: errorFrom(raw), raw: parsed };
    case 'app.ready':
      return { type, raw: parsed };
    case 'app.error':
    case 'session.error':
      return { type, sessionId: asOptionalString(raw.sessionId), error: errorFrom(raw), raw: parsed } as SSEEvent;
    case 'provider.auth.error':
      return { type, providerId: asOptionalString(raw.providerId ?? raw.provider), error: errorFrom(raw), raw: parsed };
    default:
      return undefined;
  }
}

function joinPath(parent: string, name: string): string {
  if (!parent || parent === '.' || parent === '/') return name;
  return `${parent.replace(/\/+$/, '')}/${name}`;
}

function isDirectoryEntry(raw: RawRecord): boolean {
  const type = asOptionalString(raw.type ?? raw.kind);
  if (type) return type === 'directory' || type === 'dir' || type === 'folder';
  if (typeof raw.isDirectory === 'boolean') return raw.isDirectory;
  if (typeof raw.directory === 'boolean') return raw.directory;
  return Array.isArray(raw.children) || raw.children != null;
}

/** Normalize a single server entry (object or bare string) into a {@link FileEntry}. */
function toFileEntry(value: unknown, parentPath: string): FileEntry {
  if (typeof value === 'string') {
    const name = value.replace(/\/+$/, '').split('/').pop() ?? value;
    return { name, path: joinPath(parentPath, name), type: value.endsWith('/') ? 'directory' : 'file' };
  }

  const raw = asRecord(value);
  const path = asString(raw.path ?? raw.fullPath, '');
  const name = asString(raw.name ?? (path ? path.split('/').pop() : ''), 'unknown');
  const directory = isDirectoryEntry(raw);
  const size = typeof raw.size === 'number' ? raw.size : undefined;

  return {
    name,
    path: path || joinPath(parentPath, name),
    type: directory ? 'directory' : 'file',
    ...(size !== undefined ? { size } : {})
  };
}

/** Tolerant parse of a directory-listing payload across plausible server shapes. */
function parseDirectoryListing(payload: unknown, parentPath: string): FileEntry[] {
  const record = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(record.entries)
      ? record.entries
      : Array.isArray(record.files)
        ? record.files
        : Array.isArray(record.children)
          ? record.children
          : [];

  return list
    .map((entry) => toFileEntry(entry, parentPath))
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

async function decodeResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function makeUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function directoryParam(directory?: string): Record<string, string> | undefined {
  return directory ? { directory } : undefined;
}

function toGlobalEvent(data: string): GlobalEvent {
  const parsed = parseData(data);
  const record = asRecord(parsed);
  return { ...record, type: asString(record.type, 'message') };
}

export function createClient(baseUrl?: string): OpenCodeClient {
  const resolveRoot = () => (baseUrl ?? getServerUrl()).trim().replace(/\/+$/, '');

  async function request<T>(path: string, init: RequestInit = {}, params?: Record<string, string>): Promise<T> {
    const response = await fetch(makeUrl(resolveRoot(), path, params), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers
      }
    });

    const body = await decodeResponse(response);
    if (!response.ok) {
      throw new OpenCodeApiError(`OpenCode request failed: ${response.status} ${response.statusText}`, response.status, body);
    }

    return unwrapData<T>(body);
  }

  return {
    listProjects: () => request<Project[]>('project'),
    getCurrentProject: () => request<Project | null>('project/current'),
    getPath: () => request<{ path: string }>('path'),
    getVcsInfo: () => request<VcsInfo>('vcs'),
    subscribeGlobalEvents(handler: (event: GlobalEvent) => void): { close(): void } {
      if (typeof EventSource === 'undefined') return { close: () => undefined };

      const source = new EventSource(makeUrl(resolveRoot(), 'event'));
      source.onmessage = (event) => handler(toGlobalEvent(event.data));
      return { close: () => source.close() };
    },
    listSessions: async (directory?: string) => {
      const payload = await request<unknown>('session', {}, directoryParam(directory));
      return Array.isArray(payload) ? payload.map(normalizeSession) : [];
    },
    createSession: (opts: CreateSessionOptions = {}) =>
      request<unknown>('session', { method: 'POST', body: JSON.stringify(opts) }, directoryParam(opts.directory)).then(normalizeSession),
    deleteSession: async (id: string) => {
      await request<void>(`session/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    renameSession: (id: string, title: string) =>
      request<unknown>(`session/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }).then(normalizeSession),
    getMessages: async (sessionId: string) => {
      const payload = await request<unknown>(`session/${encodeURIComponent(sessionId)}/message`);
      return normalizeMessages(payload);
    },
    async getSessionDiff(sessionId: string): Promise<FileDiff[]> {
      try {
        const diffs = await request<FileDiff[]>(`session/${encodeURIComponent(sessionId)}/diff`);
        return Array.isArray(diffs) ? diffs : [];
      } catch {
        return [];
      }
    },
    sendMessage: (sessionId: string, input: SendMessageInput, directory?: string) =>
      request<unknown>(`session/${encodeURIComponent(sessionId)}/message`, {
        method: 'POST',
        body: JSON.stringify(input)
      }, directoryParam(directory)).then(normalizeMessage),
    subscribeEvents(sessionId: string, handlers: EventHandlers): Unsubscribe {
      if (typeof EventSource === 'undefined') {
        const error = new Error('EventSource is not available in this environment');
        handlers.onError?.(error);
        return () => undefined;
      }

      const source = new EventSource(makeUrl(resolveRoot(), `session/${encodeURIComponent(sessionId)}/event`));
      source.onopen = () => handlers.onOpen?.();
      source.onerror = () => handlers.onError?.(new Error('OpenCode event stream failed'));

      for (const eventType of EVENT_TYPES) {
        source.addEventListener(eventType, (event) => {
          const parsed = parseSSEEvent(eventType, event.data);
          if (parsed) handlers.onEvent?.(parsed);
        });
      }

      source.onmessage = (event) => {
        const raw = asRecord(parseData(event.data));
        const type = asString(raw.type);
        const parsed = parseSSEEvent(type, event.data);
        if (parsed) handlers.onEvent?.(parsed);
      };

      return () => source.close();
    },
    listProviders: () => request<Provider[]>('provider'),
    getConfig: () => request<OpenCodeConfig>('config'),
    updateConfig: (patch: Partial<OpenCodeConfig>) =>
      request<OpenCodeConfig>('config', { method: 'PATCH', body: JSON.stringify(patch) }),
    readFile: (path: string) => request<string>('file', {}, { path }),
    async listDirectory(path: string): Promise<FileEntry[]> {
      const payload = await request<unknown>('file', {}, { path });
      return parseDirectoryListing(payload, path);
    }
  };
}
