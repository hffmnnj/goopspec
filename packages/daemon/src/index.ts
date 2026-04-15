import type { DaemonConfig } from "@goopspec/core";
import { getConfig } from "./config.js";
import { getDatabase } from "./db/index.js";
import { CliLauncher } from "./orchestration/cli-launcher.js";
import { WorkflowLifecycleManager } from "./orchestration/lifecycle.js";
import { createServer } from "./server.js";
import { RoomManager } from "./transport/rooms.js";
import { SseManager } from "./transport/sse.js";
import { WsServer, type WsData } from "./transport/ws-server.js";

const VERSION = "0.1.0";

export interface StoppableServer {
  stop: (closeActiveConnections?: boolean) => void;
}

export interface DaemonRuntime {
  readonly config: DaemonConfig;
  readonly server: StoppableServer;
  shutdown: (signal: string) => void;
  registerSignalHandlers: () => () => void;
}

export function createShutdownHandler(
  server: StoppableServer,
  onStopped: () => void,
  exit: (code: number) => never,
): (signal: string) => void {
  return (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.stop(true);
    onStopped();
    exit(0);
  };
}

export function startDaemon(config: DaemonConfig = getConfig()): DaemonRuntime {
  const db = getDatabase(config.dbPath);
  const lifecycle = new WorkflowLifecycleManager(db, new CliLauncher());
  const roomManager = new RoomManager<WsData>();
  const wsServer = new WsServer(roomManager, lifecycle);
  const sseManager = new SseManager(db, lifecycle);
  const app = createServer({ config, db, lifecycle, wsServer, sseManager });

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: (req, bunServer) => {
      const pathname = new URL(req.url).pathname;
      if (pathname === "/api/ws") {
        const upgradeResponse = wsServer.upgrade(req, bunServer);
        if (upgradeResponse !== undefined) {
          return upgradeResponse;
        }

        return app.fetch(req, bunServer);
      }

      return app.fetch(req, bunServer);
    },
    websocket: wsServer.websocket,
  });

  console.log(`GoopSpec Daemon v${VERSION} listening on http://${config.host}:${config.port}`);

  const shutdown = createShutdownHandler(
    server,
    () => {
      wsServer.destroy();
      sseManager.destroy();
      db.close();
      console.log("Daemon stopped.");
    },
    (code) => {
      process.exit(code);
    },
  );

  const registerSignalHandlers = (): (() => void) => {
    const onSigterm = () => shutdown("SIGTERM");
    const onSigint = () => shutdown("SIGINT");

    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);

    return () => {
      process.off("SIGTERM", onSigterm);
      process.off("SIGINT", onSigint);
    };
  };

  return {
    config,
    server,
    shutdown,
    registerSignalHandlers,
  };
}

if (import.meta.main) {
  const runtime = startDaemon();
  runtime.registerSignalHandlers();
}
