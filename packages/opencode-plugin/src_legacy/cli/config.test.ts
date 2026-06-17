import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CONFIG, type GoopspecConfig } from "@goopspec/core";

const ENV_KEYS = [
  "HOME",
  "GOOPSPEC_DAEMON_URL",
  "GOOPSPEC_DAEMON_PORT",
  "GOOPSPEC_DAEMON_HOST",
] as const;

let tempHomeDir = "";
let originalEnv: Record<(typeof ENV_KEYS)[number], string | undefined>;
let readConfig: () => Promise<GoopspecConfig>;
let writeConfig: (config: GoopspecConfig) => Promise<void>;

function configFilePath(homeDir: string): string {
  return join(homeDir, ".goopspec", "config.json");
}

describe("CLI config", () => {
  beforeAll(async () => {
    originalEnv = {
      HOME: process.env.HOME,
      GOOPSPEC_DAEMON_URL: process.env.GOOPSPEC_DAEMON_URL,
      GOOPSPEC_DAEMON_PORT: process.env.GOOPSPEC_DAEMON_PORT,
      GOOPSPEC_DAEMON_HOST: process.env.GOOPSPEC_DAEMON_HOST,
    };

    tempHomeDir = await mkdtemp(join(tmpdir(), "goopspec-config-test-"));

    const realOs = await import("node:os");
    mock.module("node:os", () => ({
      ...realOs,
      homedir: () => tempHomeDir,
    }));

    const module = await import("./config.js");
    readConfig = module.readConfig;
    writeConfig = module.writeConfig;
  });

  beforeEach(async () => {
    await rm(join(tempHomeDir, ".goopspec"), { recursive: true, force: true });

    delete process.env.GOOPSPEC_DAEMON_URL;
    delete process.env.GOOPSPEC_DAEMON_PORT;
    delete process.env.GOOPSPEC_DAEMON_HOST;
  });

  afterEach(() => {
    delete process.env.GOOPSPEC_DAEMON_URL;
    delete process.env.GOOPSPEC_DAEMON_PORT;
    delete process.env.GOOPSPEC_DAEMON_HOST;
  });

  afterAll(async () => {
    mock.restore();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(tempHomeDir, { recursive: true, force: true });
  });

  it("returns defaults when config file does not exist", async () => {
    const config = await readConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("writes and reads config as a round-trip", async () => {
    const next: GoopspecConfig = {
      daemonUrl: "http://127.0.0.1:8123",
      port: 8123,
      host: "127.0.0.1",
    };

    await writeConfig(next);

    const config = await readConfig();
    expect(config).toEqual(next);
  });

  it("applies environment overrides over file values", async () => {
    await writeConfig({
      daemonUrl: "http://localhost:8000",
      port: 8000,
      host: "localhost",
    });

    process.env.GOOPSPEC_DAEMON_URL = "http://10.0.0.7:9555";
    process.env.GOOPSPEC_DAEMON_PORT = "9555";
    process.env.GOOPSPEC_DAEMON_HOST = "10.0.0.7";

    const config = await readConfig();
    expect(config).toEqual({
      daemonUrl: "http://10.0.0.7:9555",
      port: 9555,
      host: "10.0.0.7",
    });
  });

  it("merges defaults, file values, and env overrides in precedence order", async () => {
    const configPath = configFilePath(tempHomeDir);
    await mkdir(join(tempHomeDir, ".goopspec"), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({ host: "127.0.0.1", daemonUrl: "http://127.0.0.1:7331" }),
      "utf8",
    );

    process.env.GOOPSPEC_DAEMON_PORT = "7444";

    const config = await readConfig();
    expect(config).toEqual({
      daemonUrl: "http://127.0.0.1:7331",
      port: 7444,
      host: "127.0.0.1",
    });
  });
});
