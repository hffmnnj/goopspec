import { Spinner } from "@inkjs/ui";
import { Box, Text, render } from "ink";
import { useEffect, useState } from "react";
import { Header, KeyHints, Panel } from "../components/index.js";
import {
  type StartResult,
  type StopResult,
  openDashboard,
  startDashboard,
  stopDashboard,
} from "../lib/dashboard.js";
import { type DashboardState, getDashboardState } from "../lib/dashboard-state.js";
import { colors } from "../theme.js";

const DASHBOARD_SUBCOMMANDS = new Set(["start", "stop", "status", "open"]);
const LABEL_WIDTH = 14;
const DEFAULT_PORT = 5173;
const EXIT_DELAY_MS = 1500;
const OPEN_DELAY_MS = 500;

type ScreenState = "loading" | "start" | "stop" | "status" | "open" | "done" | "error";

/**
 * Formats a millisecond duration as a human-friendly uptime string:
 * `42s`, `3m 42s`, or `1h 12m`. Seconds are dropped once hours are present.
 */
function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function dashboardUrl(port: number): string {
  return `http://localhost:${port}`;
}

/** Exits the process after a short delay so the user can read the final output. */
function scheduleExit(code: number, delayMs: number): void {
  setTimeout(() => process.exit(code), delayMs);
}

interface InfoLineProps {
  label: string;
  value: string;
  color?: string;
}

function InfoLine({ label, value, color }: InfoLineProps) {
  return (
    <Box>
      <Box width={LABEL_WIDTH}>
        <Text color={colors.muted}>{label}</Text>
      </Box>
      <Text color={color ?? colors.text}>{value}</Text>
    </Box>
  );
}

// ── Status ────────────────────────────────────────────────────────────────

function StatusView({ state }: { state: DashboardState }) {
  const port = state.port ?? DEFAULT_PORT;

  if (!state.running) {
    return (
      <Panel title="Dashboard" variant="subtle">
        <Text color={colors.warning}>Dashboard is not running</Text>
        <Text color={colors.muted}> — run &apos;goop dashboard start&apos;</Text>
      </Panel>
    );
  }

  return (
    <Panel title="Dashboard" variant="success">
      <InfoLine label="Status" value="running" color={colors.success} />
      {state.pid ? <InfoLine label="PID" value={String(state.pid)} /> : null}
      <InfoLine label="Port" value={String(port)} />
      <InfoLine label="URL" value={dashboardUrl(port)} color={colors.success} />
      {state.uptimeMs !== undefined ? (
        <InfoLine label="Uptime" value={formatUptime(state.uptimeMs)} />
      ) : null}
    </Panel>
  );
}

// ── Start ─────────────────────────────────────────────────────────────────

function StartView({ result }: { result: StartResult | null }) {
  if (result === null) {
    return (
      <Box>
        <Spinner label="Starting dashboard..." />
      </Box>
    );
  }

  if (!result.success) {
    return (
      <Panel title="Start Failed" variant="error">
        <Text color={colors.error}>{result.error ?? "Unknown error"}</Text>
      </Panel>
    );
  }

  if (result.alreadyRunning) {
    return (
      <Panel title="Already Running" variant="warning">
        <Text color={colors.warning}>
          Dashboard is already running{result.pid ? ` (PID ${result.pid})` : ""}
        </Text>
        <InfoLine label="URL" value={dashboardUrl(result.port)} color={colors.success} />
      </Panel>
    );
  }

  return (
    <Panel title="Dashboard Started" variant="success">
      <Text color={colors.success}>→ Dashboard started successfully!</Text>
      <Box marginTop={1} flexDirection="column">
        {result.pid ? <InfoLine label="PID" value={String(result.pid)} /> : null}
        <InfoLine label="URL" value={dashboardUrl(result.port)} color={colors.success} />
      </Box>
    </Panel>
  );
}

// ── Stop ──────────────────────────────────────────────────────────────────

function StopView({ result }: { result: StopResult | null }) {
  if (result === null) {
    return (
      <Box>
        <Spinner label="Stopping dashboard..." />
      </Box>
    );
  }

  if (!result.success) {
    return (
      <Panel title="Stop Failed" variant="error">
        <Text color={colors.error}>{result.error ?? "Unknown error"}</Text>
      </Panel>
    );
  }

  if (!result.wasRunning) {
    return (
      <Panel title="Dashboard" variant="subtle">
        <Text color={colors.muted}>Dashboard was not running</Text>
      </Panel>
    );
  }

  return (
    <Panel title="Dashboard Stopped" variant="success">
      <Text color={colors.success}>→ Dashboard stopped.</Text>
    </Panel>
  );
}

// ── Open ──────────────────────────────────────────────────────────────────

function OpenView({ port }: { port: number }) {
  return (
    <Box>
      <Text color={colors.primary}>Opening </Text>
      <Text color={colors.success}>{dashboardUrl(port)}</Text>
      <Text color={colors.primary}> in your browser...</Text>
    </Box>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────

function ErrorView({ message }: { message: string }) {
  return (
    <Panel title="Error" variant="error">
      <Text color={colors.error}>{message}</Text>
    </Panel>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────

interface DashboardScreenProps {
  subcommand?: string;
}

function DashboardScreen({ subcommand }: DashboardScreenProps) {
  const requested = subcommand ?? "status";
  const valid = DASHBOARD_SUBCOMMANDS.has(requested);

  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [statusState, setStatusState] = useState<DashboardState | null>(null);
  const [startResult, setStartResult] = useState<StartResult | null>(null);
  const [stopResult, setStopResult] = useState<StopResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!valid) {
        setErrorMessage("Unknown dashboard command. Use: start, stop, status, open");
        setScreenState("error");
        scheduleExit(1, EXIT_DELAY_MS);
        return;
      }

      try {
        switch (requested) {
          case "status": {
            const state = await getDashboardState();
            if (cancelled) return;
            setStatusState(state);
            setScreenState("status");
            scheduleExit(0, EXIT_DELAY_MS);
            return;
          }
          case "start": {
            setScreenState("start");
            const result = await startDashboard();
            if (cancelled) return;
            setStartResult(result);
            scheduleExit(result.success ? 0 : 1, EXIT_DELAY_MS);
            return;
          }
          case "stop": {
            setScreenState("stop");
            const result = await stopDashboard();
            if (cancelled) return;
            setStopResult(result);
            scheduleExit(result.success ? 0 : 1, EXIT_DELAY_MS);
            return;
          }
          case "open": {
            setScreenState("open");
            await openDashboard();
            if (cancelled) return;
            scheduleExit(0, OPEN_DELAY_MS);
            return;
          }
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setScreenState("error");
        scheduleExit(1, EXIT_DELAY_MS);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [requested, valid]);

  return (
    <Box flexDirection="column">
      <Header subtitle="Dashboard Management" />

      {screenState === "loading" ? (
        <Box>
          <Spinner label="Reading dashboard state..." />
        </Box>
      ) : null}

      {screenState === "status" && statusState ? <StatusView state={statusState} /> : null}
      {screenState === "start" ? <StartView result={startResult} /> : null}
      {screenState === "stop" ? <StopView result={stopResult} /> : null}
      {screenState === "open" ? <OpenView port={DEFAULT_PORT} /> : null}
      {screenState === "error" ? <ErrorView message={errorMessage} /> : null}

      {screenState === "status" ? (
        <KeyHints
          hints={[
            { key: "goop dashboard start", label: "launch" },
            { key: "goop dashboard stop", label: "halt" },
            { key: "goop dashboard open", label: "browser" },
          ]}
        />
      ) : null}
    </Box>
  );
}

export async function renderDashboardScreen(subcommand?: string): Promise<void> {
  const { waitUntilExit } = render(<DashboardScreen subcommand={subcommand} />);
  await waitUntilExit();
}
