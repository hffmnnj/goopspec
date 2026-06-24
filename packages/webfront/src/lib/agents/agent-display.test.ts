import { describe, expect, it } from 'bun:test';
import { agentDisplayName } from './agent-display.js';

describe('agentDisplayName', () => {
  it('rebrands goop-orchestrator to Orchestrator for display only', () => {
    expect(agentDisplayName('goop-orchestrator')).toBe('Orchestrator');
  });

  it('prettifies goop agent ids', () => {
    expect(agentDisplayName('goop-executor-high')).toBe('Executor High');
    expect(agentDisplayName('goop_researcher')).toBe('Goop Researcher');
  });

  it('prettifies non-goop ids without changing friendly names', () => {
    expect(agentDisplayName('build')).toBe('Build');
    expect(agentDisplayName('Custom Agent')).toBe('Custom Agent');
  });
});
