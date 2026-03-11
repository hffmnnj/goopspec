import { generateId } from "@goopspec/core";
import type { LaunchOptions, LaunchResult, WorkflowLauncher } from "./launcher.js";

interface SdkSessionResponse {
  id?: string;
  sessionId?: string;
}

interface SdkCreateSession {
  (input: Record<string, unknown>): Promise<SdkSessionResponse | string>;
}

interface SdkModuleShape {
  createSession?: SdkCreateSession;
  default?: {
    createSession?: SdkCreateSession;
  };
}

export class SdkLauncher implements WorkflowLauncher {
  readonly name = "sdk";

  async isAvailable(): Promise<boolean> {
    try {
      await import("@opencode-ai/sdk");
      return true;
    } catch {
      return false;
    }
  }

  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const fallbackSessionId = `sdk-${generateId()}`;

    try {
      const sdkModule = (await import("@opencode-ai/sdk")) as SdkModuleShape;
      const createSession = sdkModule.createSession ?? sdkModule.default?.createSession;

      if (!createSession) {
        return {
          sessionId: fallbackSessionId,
          status: "started",
        };
      }

      const response = await createSession({
        cwd: options.projectPath,
        workflowId: options.workflowId ?? "default",
        workItemId: options.workItemId,
        prompt: options.prompt,
        model: options.model,
      });

      const responseSessionId =
        typeof response === "string"
          ? response
          : response.id ?? response.sessionId ?? fallbackSessionId;

      return {
        sessionId: responseSessionId,
        status: "started",
      };
    } catch (error) {
      return {
        sessionId: fallbackSessionId,
        status: "failed",
        error: error instanceof Error ? error.message : "SDK launch failed",
      };
    }
  }
}
