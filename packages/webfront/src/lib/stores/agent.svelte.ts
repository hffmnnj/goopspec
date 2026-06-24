import { createClient } from '../api/client.js';
import type { Agent, OpenCodeClient } from '../api/types.js';

const STORAGE_KEY = 'goopspec-selected-agent';
const ORCHESTRATOR_ID = 'goop-orchestrator';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStored(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Persistence is best-effort.
  }
}

function chooseDefault(agents: Agent[], stored: string | null): string | null {
  if (stored && agents.some((candidate) => candidate.id === stored)) return stored;
  if (agents.some((candidate) => candidate.id === ORCHESTRATOR_ID)) return ORCHESTRATOR_ID;
  return agents[0]?.id ?? null;
}

export class AgentStore {
  agents = $state<Agent[]>([]);
  selectedAgentId = $state<string | null>(readStored());
  loading = $state(false);
  error = $state<string | null>(null);

  constructor(private readonly client: OpenCodeClient = createClient()) {}

  get selectedAgent(): Agent | null {
    if (!this.selectedAgentId) return null;
    return this.agents.find((candidate) => candidate.id === this.selectedAgentId) ?? null;
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const loaded = await this.client.listAgents();
      this.agents = Array.isArray(loaded) ? loaded : [];
      const selected = chooseDefault(this.agents, readStored() ?? this.selectedAgentId);
      this.selectedAgentId = selected;
      if (selected) writeStored(selected);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load agents';
      this.agents = [];
      this.selectedAgentId = readStored() ?? this.selectedAgentId;
    } finally {
      this.loading = false;
    }
  }

  select(id: string): void {
    if (!this.agents.some((candidate) => candidate.id === id)) return;
    this.selectedAgentId = id;
    writeStored(id);
  }

  reset(): void {
    this.agents = [];
    this.selectedAgentId = null;
    this.loading = false;
    this.error = null;
  }
}

export function createAgentStore(client?: OpenCodeClient): AgentStore {
  return new AgentStore(client);
}

export const agent = createAgentStore();
