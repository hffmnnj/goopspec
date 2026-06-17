/**
 * GoopSpec CLI - Register Command
 * Registers the current project with the GoopSpec daemon.
 */

import type { Project } from "@goopspec/core";

import {
  createDaemonClient,
  DaemonApiError,
  DaemonUnavailableError,
} from "../../features/daemon/client.js";
import { handleCommandError } from "../command-utils.js";
import { commandExample, keyValue, statusLine, themedSpinner } from "../components.js";
import { detectProjectName } from "../detect-project.js";
import { bold, dim, info, warning } from "../theme.js";
import { sectionHeader, showBanner, showError } from "../ui.js";

/**
 * `goopspec register` command
 * Registers the current project with the GoopSpec daemon.
 */
export async function runRegister(flags: Record<string, string | boolean>): Promise<void> {
  try {
    showBanner();
    console.log();
    sectionHeader("Register Project", "🗂");
    console.log();

    // ── Detect project name ───────────────────────────────────────────
    const detection = await detectProjectName(process.cwd());
    const name = typeof flags["name"] === "string" ? flags["name"] : detection.name;
    const description = typeof flags["description"] === "string" ? flags["description"] : detection.description;

    console.log(
      statusLine(
        "Detected:",
        `${bold(detection.name)} ${dim(`(from ${detection.source})`)}`,
        "info",
      ),
    );

    if (typeof flags["name"] === "string") {
      console.log(
        statusLine("Override:", `${bold(name)} ${dim("(--name flag)")}`, "info"),
      );
    }

    console.log();

    // ── Connect to daemon ─────────────────────────────────────────────
    const spin = themedSpinner("Connecting to daemon...");

    let client;
    try {
      client = await createDaemonClient();
    } catch (error) {
      spin.fail("Failed to create daemon client");
      showError(
        "Could not initialize daemon client",
        "Check your configuration with: goopspec status",
      );
      return;
    }

    // ── Register project ──────────────────────────────────────────────
    spin.stop("Connected to daemon");

    const registerSpin = themedSpinner("Registering project...");

    try {
      const project = await client.post<Project>("/api/projects", {
        name,
        path: process.cwd(),
        ...(description ? { description } : {}),
      });

      registerSpin.stop("Project registered");
      console.log();
      console.log(statusLine("Project registered", "", "ok"));
      console.log();
      console.log(keyValue("name", bold(project.name)));
      if (project.description) {
        console.log(keyValue("description", project.description));
      }
      console.log(keyValue("id", info(project.id)));
      console.log(keyValue("daemon", dim(client.getBaseUrl())));
      console.log();
    } catch (error) {
      if (error instanceof DaemonUnavailableError) {
        registerSpin.fail("Daemon not reachable");
        console.log();
        showError(
          "Daemon not running. Start it with:",
        );
        console.log(commandExample("goopspec daemon start"));
        console.log();
        return;
      }

      if (error instanceof DaemonApiError) {
        if (error.message.includes("already registered")) {
          registerSpin.stop(warning("Project already registered"));
          console.log();
          console.log(
            statusLine(
              "Already registered",
              dim("This project path is already registered with the daemon."),
              "info",
            ),
          );
          console.log();
          return;
        }

        registerSpin.fail("Registration failed");
        console.log();
        showError(
          `Daemon returned an error: ${error.message}`,
          "Check the project path and try again",
        );
        console.log();
        return;
      }

      registerSpin.fail("Registration failed");
      console.log();
      showError(
        error instanceof Error ? error.message : "An unexpected error occurred",
        "Try again or check daemon status with: goopspec daemon status",
      );
      console.log();
    }
  } catch (error) {
    handleCommandError(error);
  }
}
