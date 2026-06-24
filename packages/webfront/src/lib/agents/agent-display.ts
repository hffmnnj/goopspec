function titleCase(value: string): string {
  return value
    .split(/([\s-_]+)/)
    .map((part) => {
      if (/^[\s-_]+$/.test(part)) return ' ';
      if (!part) return part;
      if (/[A-Z]/.test(part.slice(1))) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function agentDisplayName(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return 'Agent';
  if (trimmed === 'goop-orchestrator') return 'Orchestrator';

  const displayId = trimmed.startsWith('goop-') ? trimmed.slice('goop-'.length) : trimmed;
  return titleCase(displayId) || trimmed;
}
