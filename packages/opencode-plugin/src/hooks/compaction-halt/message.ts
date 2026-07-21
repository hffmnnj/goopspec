/** Build the hard-stop directive shown after a subsequent-turn tool call. */
export function buildCompactionHaltMessage(originalOutput: string): string {
  const directive =
    "COMPACTION PENDING — END YOUR TURN. Stop making tool calls so the session can reach idle and compaction can dispatch.";

  return originalOutput.trim() ? `${directive}\n\n${originalOutput}` : directive;
}
