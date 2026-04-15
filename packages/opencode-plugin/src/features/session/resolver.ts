import { isCancel, select } from "@clack/prompts";

import type { PluginContext, SessionInfo } from "../../core/types.js";
import { logError } from "../../shared/logger.js";

import { listSessions } from "./manager.js";
import { validateSessionId } from "./types.js";

const GOOPSPEC_SESSION_ENV = "GOOPSPEC_SESSION";

function getProjectDir(ctx: PluginContext): string {
  return ctx.input.directory;
}

async function promptForSession(sessions: SessionInfo[]): Promise<string | undefined> {
  try {
    const choice = await select({
      message: "Multiple GoopSpec sessions found. Select a session:",
      options: sessions.map((session) => ({
        value: session.id,
        label: session.id,
        hint: session.description ?? `${session.phase} · ${session.mode}`,
      })),
    });

    if (isCancel(choice)) {
      return undefined;
    }

    return typeof choice === "string" ? choice : undefined;
  } catch (error) {
    logError("Failed to prompt for session selection", error);
    return undefined;
  }
}

export async function resolveSession(
  ctx: PluginContext,
  options?: { silent?: boolean },
): Promise<string | undefined> {
  try {
    if (ctx.sessionId) {
      return ctx.sessionId;
    }

    const envSessionId = process.env[GOOPSPEC_SESSION_ENV];
    if (envSessionId && validateSessionId(envSessionId)) {
      return envSessionId;
    }

    const sessions = listSessions(getProjectDir(ctx));

    if (sessions.length === 0) {
      return undefined;
    }

    if (sessions.length === 1) {
      return sessions[0]?.id;
    }

    if (options?.silent) {
      return undefined;
    }

    return await promptForSession(sessions);
  } catch (error) {
    logError("Failed to resolve session", error);
    return undefined;
  }
}
