#!/usr/bin/env bun

import { route } from "./router.js";

const cliArgs = process.argv.slice(2);

if (cliArgs.includes("--version") || cliArgs.includes("-v")) {
  process.stdout.write("GoopSpec CLI v0.1.0\n");
  process.exit(0);
}

const [command = "help", ...args] = cliArgs;

if (command === "--help" || command === "-h") {
  await route("help", []);
  process.exit(0);
}

await route(command, args);
