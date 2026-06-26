import { ConfirmInput, Spinner } from "@inkjs/ui";
import { Box, Text, render, useApp, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { Header, KeyHints, ModelPicker, Panel } from "../components/index.js";
import { readConfig, writeConfig, type GoopConfig } from "../lib/config.js";
import { fetchModels, type ModelFetchResult } from "../lib/models.js";
import { AGENT_ROLES, ROLE_LABELS, type AgentRole } from "../lib/roles.js";
import { colors } from "../theme.js";

type ModelsScreenState =
  | "loading"
  | "role-select"
  | "model-pick"
  | "reset-confirm"
  | "saving"
  | "resetting"
  | "done";

const ROLE_LIST_FOOTER_HINTS = [
  { key: "↑/↓", label: "navigate" },
  { key: "⏎", label: "select" },
  { key: "esc", label: "done" },
];

const RESET_FOOTER_HINTS = [
  { key: "y", label: "confirm" },
  { key: "n", label: "cancel" },
];

const DONE_FOOTER_HINTS = [{ key: "⏎", label: "exit" }];

interface RoleSelectProps {
  assignments: Partial<Record<AgentRole, string>>;
  onSelectRole: (role: AgentRole) => void;
  onResetAll: () => void;
  onDone: () => void;
}

const EXTRA_OPTIONS = ["reset", "done"] as const;
type ExtraOption = (typeof EXTRA_OPTIONS)[number];

type ListItem = { kind: "role"; role: AgentRole } | { kind: "extra"; option: ExtraOption };

/**
 * Combined list of 13 agent roles plus the reset/done actions. Navigation is a
 * single cursor over the flattened items; Enter dispatches to the appropriate
 * handler. Cancel exits the screen.
 */
function RoleSelect({ assignments, onSelectRole, onResetAll, onDone }: RoleSelectProps) {
  const [index, setIndex] = useState(0);

  const items: ListItem[] = useMemo(
    () => [
      ...AGENT_ROLES.map((role): ListItem => ({ kind: "role", role })),
      { kind: "extra", option: "reset" },
      { kind: "extra", option: "done" },
    ],
    [],
  );

  useInput((_input, key) => {
    if (key.escape) {
      onDone();
      return;
    }

    if (key.upArrow) {
      setIndex((prev) => (prev > 0 ? prev - 1 : prev));
      return;
    }

    if (key.downArrow) {
      setIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
      return;
    }

    if (key.return) {
      const item = items[index];
      if (!item) return;

      if (item.kind === "role") {
        onSelectRole(item.role);
      } else if (item.option === "reset") {
        onResetAll();
      } else {
        onDone();
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Panel title="Model Routing" variant="primary">
        <Box marginBottom={1}>
          <Text color={colors.accent} bold>
            Model Selector
          </Text>
        </Box>

        {items.map((item, itemIndex) => {
          const active = itemIndex === index;
          if (item.kind === "role") {
            const role = item.role;
            const label = ROLE_LABELS[role];
            const model = assignments[role];
            return (
              <Box key={role}>
                <Text color={active ? colors.highlight : colors.muted}>
                  {active ? "▸ " : "  "}
                </Text>
                <Text color={active ? colors.highlight : colors.text} bold={active}>
                  {label}
                </Text>
                <Text color={colors.muted}>
                  {" "}
                  →{" "}
                </Text>
                <Text color={model ? colors.text : colors.muted}>
                  {model ?? "default"}
                </Text>
              </Box>
            );
          }

          const label = item.option === "reset" ? "Reset all to defaults" : "Done";
          const color = item.option === "reset" ? colors.warning : colors.success;
          return (
            <Box key={item.option}>
              <Text color={active ? color : colors.muted}>{active ? "▸ " : "  "}</Text>
              <Text color={active ? color : colors.text} bold={active}>
                {label}
              </Text>
            </Box>
          );
        })}
      </Panel>

      <KeyHints hints={ROLE_LIST_FOOTER_HINTS} />
    </Box>
  );
}

interface ResetConfirmProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function ResetConfirm({ onConfirm, onCancel }: ResetConfirmProps) {
  return (
    <Box flexDirection="column">
      <Panel title="Reset Model Overrides" variant="warning">
        <Box marginBottom={1}>
          <Text color={colors.text}>Clear all per-role model overrides?</Text>
        </Box>
        <Text color={colors.muted}>This will remove every assignment and fall back to defaults.</Text>
      </Panel>
      <Box marginTop={1}>
        <ConfirmInput onConfirm={onConfirm} onCancel={onCancel} />
      </Box>
      <KeyHints hints={RESET_FOOTER_HINTS} />
    </Box>
  );
}

interface SuccessMessageProps {
  message: string;
}

function SuccessMessage({ message }: SuccessMessageProps) {
  const { exit } = useApp();

  useInput((_input, key) => {
    if (key.return || key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Panel title="Done" variant="success">
        <Text color={colors.success} bold>
          ✓ {message}
        </Text>
      </Panel>
      <KeyHints hints={DONE_FOOTER_HINTS} />
    </Box>
  );
}

interface ModelRoutingScreenProps {
  initialConfig: GoopConfig | null;
}

function ModelsScreen({ initialConfig }: ModelRoutingScreenProps) {
  const { exit } = useApp();
  const [state, setState] = useState<ModelsScreenState>("loading");
  const [fetchResult, setFetchResult] = useState<ModelFetchResult | null>(null);
  const [activeRole, setActiveRole] = useState<AgentRole | null>(null);
  const [assignments, setAssignments] = useState<Partial<Record<AgentRole, string>>>(
    () => (initialConfig?.agentModels as Partial<Record<AgentRole, string>>) ?? {},
  );
  const [successMessage, setSuccessMessage] = useState("");

  // Fetch models on mount, then move to role selection.
  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await fetchModels();
      if (active) {
        setFetchResult(result);
        setState("role-select");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Terminal-state transitions for done.
  useEffect(() => {
    if (state === "done") {
      const timer = setTimeout(() => exit(), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state, exit]);

  function handleSelectRole(role: AgentRole) {
    setActiveRole(role);
    setState("model-pick");
  }

  function handleModelSelect(role: AgentRole, modelId: string) {
    setState("saving");
    void (async () => {
      const nextAssignments = { ...assignments, [role]: modelId };
      await writeConfig({ agentModels: nextAssignments });
      setAssignments(nextAssignments);
      setSuccessMessage(`${ROLE_LABELS[role]} assigned to ${modelId}`);
      setState("done");
    })();
  }

  function handleResetConfirm() {
    setState("resetting");
    void (async () => {
      await writeConfig({ agentModels: {} });
      setAssignments({});
      setSuccessMessage("All model overrides cleared");
      setState("done");
    })();
  }

  function handleModelCancel() {
    setActiveRole(null);
    setState("role-select");
  }

  function handleResetCancel() {
    setState("role-select");
  }

  function handleDone() {
    setSuccessMessage("Model routing saved");
    setState("done");
  }

  if (state === "loading" || fetchResult === null) {
    return (
      <Box>
        <Spinner label="Fetching models..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="Model Selector" />

      {state === "role-select" ? (
        <RoleSelect
          assignments={assignments}
          onSelectRole={handleSelectRole}
          onResetAll={() => setState("reset-confirm")}
          onDone={handleDone}
        />
      ) : null}

      {state === "model-pick" && activeRole !== null ? (
        <ModelPicker
          models={fetchResult.models}
          source={fetchResult.source}
          defaultValue={assignments[activeRole]}
          onSelect={(modelId) => handleModelSelect(activeRole, modelId)}
          onCancel={handleModelCancel}
        />
      ) : null}

      {state === "reset-confirm" ? (
        <ResetConfirm onConfirm={handleResetConfirm} onCancel={handleResetCancel} />
      ) : null}

      {state === "saving" ? (
        <Box>
          <Spinner label="Saving assignment..." />
        </Box>
      ) : null}

      {state === "resetting" ? (
        <Box>
          <Spinner label="Clearing overrides..." />
        </Box>
      ) : null}

      {state === "done" ? <SuccessMessage message={successMessage} /> : null}
    </Box>
  );
}

export async function renderModelsScreen(): Promise<void> {
  const initialConfig = await readConfig();
  const { waitUntilExit } = render(<ModelsScreen initialConfig={initialConfig} />);
  await waitUntilExit();
}
