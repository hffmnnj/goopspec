import packageJson from "../../package.json" with { type: "json" };

export const GOOPSPEC_VERSION = packageJson.version ?? "unknown";
