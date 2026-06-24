import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { MessageRole, OpenCodeClient } from '../api/types.js';
import { createChatStore } from './chat.svelte.js';
import { agent } from './agent.svelte.js';
import { model } from './model.svelte.js';
import { commands } from './commands.svelte.js';

const assistantRole: MessageRole = 'assistant';

function reply() {
  return Promise.resolve({ id: 'm1', role: assistantRole, parts: [], createdAt: '' });
}

function createMockClient(): OpenCodeClient {
  return {
    listSessions: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    getMessages: mock(() => Promise.resolve([])),
    sendMessage: mock(() => reply()),
    runCommand: mock(() => reply()),
    subscribeEvents: () => () => undefined,
    listProviders: mock(() => Promise.resolve([])),
    listAgents: mock(() => Promise.resolve([])),
    listCommands: mock(() => Promise.resolve([])),
    getConfig: mock(() => Promise.resolve({})),
    updateConfig: mock(() => Promise.resolve({})),
    readFile: mock(() => Promise.resolve('')),
    listDirectory: mock(() => Promise.resolve([])),
  } as unknown as OpenCodeClient;
}

describe('chat store slash-command routing', () => {
  let client: OpenCodeClient;
  let chat: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    client = createMockClient();
    chat = createChatStore(client);
    model.reset();
    agent.reset();
    commands.commands = [
      { name: 'help', description: 'Show help' },
      { name: 'commit', description: 'Commit changes' },
    ];
  });

  afterEach(() => {
    model.reset();
    agent.reset();
    commands.reset();
  });

  it('routes a known leading-slash command to runCommand', async () => {
    await chat.loadHistory('s1');
    await chat.sendMessage('/commit tighten copy');

    expect(client.runCommand).toHaveBeenCalledWith('s1', {
      command: 'commit',
      arguments: 'tighten copy',
    });
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('routes a known command without arguments', async () => {
    await chat.loadHistory('s1');
    await chat.sendMessage('/help');

    expect(client.runCommand).toHaveBeenCalledWith('s1', { command: 'help', arguments: '' });
  });

  it('sends unknown slash text as a normal prompt', async () => {
    await chat.loadHistory('s1');
    await chat.sendMessage('/unknown thing');

    expect(client.sendMessage).toHaveBeenCalledWith('s1', { text: '/unknown thing' });
    expect(client.runCommand).not.toHaveBeenCalled();
  });

  it('sends plain text as a normal prompt', async () => {
    await chat.loadHistory('s1');
    await chat.sendMessage('hello there');

    expect(client.sendMessage).toHaveBeenCalledWith('s1', { text: 'hello there' });
    expect(client.runCommand).not.toHaveBeenCalled();
  });

  it('attaches the selected agent and model to a command run', async () => {
    agent.agents = [{ id: 'goop-orchestrator', name: 'goop-orchestrator' }];
    agent.select('goop-orchestrator');
    model.setProviders([
      { id: 'anthropic', name: 'Anthropic', models: [{ id: 'claude-opus', name: 'Claude Opus' }] },
    ]);
    model.select('anthropic', 'claude-opus');

    await chat.loadHistory('s1');
    await chat.sendMessage('/help');

    expect(client.runCommand).toHaveBeenCalledWith('s1', {
      command: 'help',
      arguments: '',
      agent: 'goop-orchestrator',
      model: 'anthropic/claude-opus',
    });
  });
});
