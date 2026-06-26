#!/usr/bin/env bun

import { route } from "./router.js";

const [command = "help", ...args] = process.argv.slice(2);

await route(command, args);
