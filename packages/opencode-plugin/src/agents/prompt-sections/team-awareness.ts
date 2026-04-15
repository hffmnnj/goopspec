/**
 * Team awareness prompt section
 * @module agents/prompt-sections/team-awareness
 */

export interface TeamAwarenessSibling {
  id: string;
  type?: string;
  task?: string;
}

export interface TeamAwarenessContext {
  siblings?: TeamAwarenessSibling[];
}

export function generateTeamAwarenessSection(context: TeamAwarenessContext = {}): string {
  const siblingSection = buildSiblingSection(context.siblings);

  return `<Team_Awareness>
## Team Awareness

You may be running in parallel with sibling agents. Coordinate to avoid conflicts.

- Use per-agent output files: \`{basename}-{shortId}.{ext}\` (e.g., \`RESEARCH-a1b2c3.md\`)
- Check \`.goopspec/team/registry.json\` for active agents and claimed files
- If a file is claimed, write to your per-agent file and let the orchestrator merge
${siblingSection}
</Team_Awareness>`;
}

function buildSiblingSection(siblings: TeamAwarenessSibling[] | undefined): string {
  if (!siblings || siblings.length === 0) {
    return "";
  }

  const lines = siblings.map(sibling => {
    const details = [sibling.type, sibling.task].filter(Boolean).join(" — ");
    return details ? `- \`${sibling.id}\` (${details})` : `- \`${sibling.id}\``;
  });

  return `
### Active Siblings
${lines.join("\n")}
`;
}
