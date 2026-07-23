const HINTS: Record<string, string> = {
  "ast-grep":
    "Could not find the 'ast-grep' binary. Install it with: npm i -g @ast-grep/cli (invoke as `ast-grep`; avoid `sg`, which collides with the Linux shadow-utils binary). You can also set binaryPaths.ast-grep in goopspec.json to an absolute path.",
  scip: "Could not find the 'scip' CLI. Download a prebuilt binary from https://github.com/scip-code/scip/releases. Note: SCIP indexing also requires the TypeScript indexer; install it with: npm i -g @sourcegraph/scip-typescript. You can also set binaryPaths.scip in goopspec.json to an absolute path.",
  "scip-typescript":
    "Could not find the 'scip-typescript' binary. Install it with: npm i -g @sourcegraph/scip-typescript. You can also set binaryPaths.scip-typescript in goopspec.json to an absolute path.",
  difft:
    "Could not find the 'difft' binary (difftastic). Install it via Homebrew: brew install difftastic, or Cargo: cargo install difftastic, or download a prebuilt binary from https://github.com/Wilfred/difftastic/releases. There is no npm package. You can also set binaryPaths.difft in goopspec.json to an absolute path.",
};

export function installHint(key: string): string {
  return (
    HINTS[key] ??
    `Could not find binary '${key}'. Ensure it is installed and on PATH, or set binaryPaths.${key} in goopspec.json to an absolute path.`
  );
}
