export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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
}

export interface OpenCodeConfig {
  provider?: string;
  model?: string;
  theme?: string;
  [key: string]: unknown;
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
}

export interface SendMessageInput {
  text: string;
  providerId?: string;
  modelId?: string;
  parts?: MessagePart[];
}

export interface EventHandlers {
  onEvent?: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
}

export type Unsubscribe = () => void;

export interface OpenCodeClient {
  listSessions(): Promise<Session[]>;
  createSession(opts?: CreateSessionOptions): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  renameSession(id: string, title: string): Promise<Session>;
  getMessages(sessionId: string): Promise<Message[]>;
  sendMessage(sessionId: string, input: SendMessageInput): Promise<Message>;
  subscribeEvents(sessionId: string, handlers: EventHandlers): Unsubscribe;
  listProviders(): Promise<Provider[]>;
  getConfig(): Promise<OpenCodeConfig>;
  updateConfig(patch: Partial<OpenCodeConfig>): Promise<OpenCodeConfig>;
  readFile(path: string): Promise<string>;
}
