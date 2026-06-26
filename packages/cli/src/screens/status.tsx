import { Box, Text, render } from "ink";
import { Fragment } from "react";
import { Header, KeyHints, Panel } from "../components/index.js";
import { readConfig, type GoopConfig } from "../lib/config.js";
import { getDashboardState } from "../lib/dashboard-state.js";
import { getActiveWorkflow } from "../lib/workflow.js";
import { colors } from "../theme.js";

const LABEL_WIDTH = 17;
const DEFAULT_PORT = 5173;

interface StatusLineProps {
  label: string;
  value: string;
  fallback?: string;
  color?: string;
}

function StatusLine({ label, value, fallback, color }: StatusLineProps) {
  const displayValue = value || fallback || "—";
  return (
    <Box>
      <Box width={LABEL_WIDTH}>
        <Text color={colors.muted}>{label}</Text>
      </Box>
      <Text color={color ?? colors.text}>{displayValue}</Text>
    </Box>
  );
}

interface ModelRowProps {
  role: string;
  model: string;
}

function ModelRow({ role, model }: ModelRowProps) {
  return (
    <Box>
      <Box width={LABEL_WIDTH}>
        <Text color={colors.muted}>{role}</Text>
      </Box>
      <Text color={colors.accent}>{model}</Text>
    </Box>
  );
}

function ConfigPanel({ config }: { config: GoopConfig | null }) {
  if (!config) {
    return (
      <Panel title="Project" variant="primary">
        <Text color={colors.warning} bold>
          No config found
        </Text>
        <Text color={colors.muted}> — run &apos;goop config&apos; to set up</Text>
      </Panel>
    );
  }

  return (
    <Panel title="Project" variant="primary">
      <StatusLine label="Project Name" value={config.projectName ?? ""} fallback="not set" />
      <StatusLine label="Default Model" value={config.defaultModel ?? ""} fallback="not set" />
      <StatusLine label="Memory" value={config.memoryEnabled ? "enabled" : "disabled"} />
      <StatusLine label="Git Ignore" value={config.gitignoreGoopspec ? "yes" : "no"} />
    </Panel>
  );
}

function ModelRoutingPanel({ config }: { config: GoopConfig | null }) {
  const overrides = Object.entries(config?.agentModels ?? {});

  return (
    <Panel title="Model Routing" variant="secondary">
      {overrides.length > 0 ? (
        overrides.map(([role, model]) => (
          <ModelRow key={role} role={role} model={model ?? ""} />
        ))
      ) : (
        <Text color={colors.muted}>No per-role overrides — all roles use the default model</Text>
      )}
    </Panel>
  );
}

function WorkflowPanel({ state }: { state: { workflowId: string | null; phase: string | null } }) {
  if (!state.workflowId) {
    return (
      <Panel title="Active Workflow" variant="subtle">
        <Text color={colors.muted}>No active workflow</Text>
      </Panel>
    );
  }

  return (
    <Panel title="Active Workflow" variant="subtle">
      <StatusLine label="Workflow" value={state.workflowId} />
      <StatusLine label="Phase" value={state.phase ?? ""} fallback="not set" />
    </Panel>
  );
}

function DashboardPanel({ state }: { state: { running: boolean; pid?: number; port: number } }) {
  const variant = state.running ? "success" : "subtle";

  return (
    <Panel title="Dashboard" variant={variant}>
      <StatusLine
        label="Status"
        value={state.running ? "running" : "stopped"}
        color={state.running ? colors.success : colors.muted}
      />
      <StatusLine label="Port" value={String(state.port)} />
      {state.running ? (
        <Fragment>
          <StatusLine label="URL" value={`http://localhost:${state.port}`} color={colors.success} />
          {state.pid ? <StatusLine label="PID" value={String(state.pid)} color={colors.muted} /> : null}
        </Fragment>
      ) : null}
    </Panel>
  );
}

function StatusScreen({ config, workflow, dashboard }: {
  config: GoopConfig | null;
  workflow: { workflowId: string | null; phase: string | null };
  dashboard: { running: boolean; pid?: number; port: number };
}) {
  return (
    <Box flexDirection="column">
      <Header subtitle="Status Overview" />

      <Box flexDirection="column" gap={1}>
        <ConfigPanel config={config} />
        <ModelRoutingPanel config={config} />
        <WorkflowPanel state={workflow} />
        <DashboardPanel state={dashboard} />
      </Box>

      <KeyHints hints={[{ key: "goop config", label: "update settings" }]} />
    </Box>
  );
}

export async function renderStatusScreen(): Promise<void> {
  const [config, workflow, dashboard] = await Promise.all([
    readConfig(),
    getActiveWorkflow(),
    getDashboardState(),
  ]);

  const { unmount, waitUntilExit } = render(
    <StatusScreen
      config={config}
      workflow={workflow}
      dashboard={{ running: dashboard.running, pid: dashboard.pid, port: dashboard.port ?? DEFAULT_PORT }}
    />,
  );

  setTimeout(() => unmount(), 3000);
  await waitUntilExit();
}
