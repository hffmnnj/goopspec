import { ConfirmInput, Spinner, TextInput } from "@inkjs/ui";
import { Box, Text, render, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Header, KeyHints, Panel, WizardStep } from "../components/index.js";
import { mergeConfig, readConfig, writeConfig } from "../lib/config.js";
import type { GoopConfig } from "../lib/config.js";
import { computeConfigDiff, formatDiff } from "../lib/diff.js";
import { colors } from "../theme.js";

type WizardState =
  | "projectName"
  | "defaultModel"
  | "memoryEnabled"
  | "gitignoreGoopspec"
  | "confirm"
  | "saving"
  | "done"
  | "cancelled"
  | "noChanges";

const TOTAL_STEPS = 4;
const SAVE_EXIT_DELAY_MS = 1500;

const STEP_ORDER: WizardState[] = [
  "projectName",
  "defaultModel",
  "memoryEnabled",
  "gitignoreGoopspec",
  "confirm",
];

function nextStep(current: WizardState): WizardState {
  const index = STEP_ORDER.indexOf(current);
  if (index === -1 || index >= STEP_ORDER.length - 1) {
    return "confirm";
  }
  return STEP_ORDER[index + 1] as WizardState;
}

const BOOL_OPTIONS_MEMORY = [
  { label: "Enabled", value: "true" },
  { label: "Disabled", value: "false" },
];

const BOOL_OPTIONS_GITIGNORE = [
  { label: "Yes — add .goopspec to .gitignore", value: "true" },
  { label: "No — track .goopspec in git", value: "false" },
];

const FOOTER_HINTS = [
  { key: "⏎", label: "confirm" },
  { key: "esc", label: "cancel" },
];

interface BoolSelectStepProps {
  stepNumber: number;
  title: string;
  description: string;
  options: { label: string; value: string }[];
  initial: boolean;
  onSelect: (value: boolean) => void;
}

/**
 * A wizard step presenting a boolean choice as a keyboard-navigable list.
 *
 * Implemented as a self-contained selector rather than `@inkjs/ui` Select to
 * avoid a Select limitation: its `onChange` fires only on Enter when the value
 * differs from the default, so accepting a pre-highlighted default emits no
 * event and the wizard stalls. Here, ↑/↓ move the highlight and Enter always
 * advances with the highlighted value, guaranteeing forward progress and a
 * correctly tracked selection.
 */
function BoolSelectStep({
  stepNumber,
  title,
  description,
  options,
  initial,
  onSelect,
}: BoolSelectStepProps): ReactNode {
  const initialIndex = Math.max(
    0,
    options.findIndex((option) => option.value === (initial ? "true" : "false")),
  );
  const [index, setIndex] = useState(initialIndex);

  useInput((_input, key) => {
    if (key.upArrow) {
      setIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (key.downArrow) {
      setIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev));
    } else if (key.return) {
      const chosen = options[index];
      if (chosen) onSelect(chosen.value === "true");
    }
  });

  return (
    <WizardStep
      stepNumber={stepNumber}
      totalSteps={TOTAL_STEPS}
      title={title}
      description={description}
    >
      {options.map((option, optionIndex) => {
        const active = optionIndex === index;
        return (
          <Box key={option.value}>
            <Text color={active ? colors.highlight : colors.muted}>
              {active ? "❯ " : "  "}
            </Text>
            <Text color={active ? colors.highlight : colors.text} bold={active}>
              {option.label}
            </Text>
          </Box>
        );
      })}
    </WizardStep>
  );
}

interface ConfigWizardProps {
  existing: GoopConfig;
}

function ConfigWizard({ existing }: ConfigWizardProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<WizardState>("projectName");
  const [values, setValues] = useState<Partial<GoopConfig>>({});

  // Global ESC handling: cancel out of any interactive step (not while
  // saving or on a terminal screen, where it would be meaningless).
  const escEnabled =
    step !== "saving" && step !== "done" && step !== "noChanges" && step !== "cancelled";
  useInput(
    (_input, key) => {
      if (key.escape) {
        setStep("cancelled");
      }
    },
    { isActive: escEnabled },
  );

  // Compute the proposed merge + diff once we reach the confirm step.
  const merged = mergeConfig(existing, values);
  const diffs = computeConfigDiff(existing, merged);

  // Drive terminal-state transitions (cancel / no-changes / done) toward exit.
  useEffect(() => {
    if (step === "confirm" && diffs.length === 0) {
      setStep("noChanges");
    }
  }, [step, diffs.length]);

  useEffect(() => {
    if (step === "cancelled" || step === "noChanges") {
      const timer = setTimeout(() => exit(), 400);
      return () => clearTimeout(timer);
    }
    if (step === "done") {
      const timer = setTimeout(() => {
        exit();
        process.exit(0);
      }, SAVE_EXIT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step, exit]);

  // Perform the write when entering the saving state.
  useEffect(() => {
    if (step !== "saving") return;
    let active = true;
    void (async () => {
      try {
        await writeConfig(values);
        if (active) setStep("done");
      } catch {
        if (active) setStep("done");
      }
    })();
    return () => {
      active = false;
    };
  }, [step, values]);

  function advance(key: keyof GoopConfig, value: string | boolean | undefined) {
    setValues((prev) => {
      if (value === undefined) return prev;
      return { ...prev, [key]: value };
    });
    setStep((current) => nextStep(current));
  }

  function handleTextSubmit(key: "projectName" | "defaultModel", raw: string) {
    const trimmed = raw.trim();
    // Empty submission means "no change" — don't write an empty string.
    advance(key, trimmed.length > 0 ? trimmed : undefined);
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="Configuration Wizard" />

      {step === "projectName" ? (
        <WizardStep
          stepNumber={1}
          totalSteps={TOTAL_STEPS}
          title="Project Name"
          description="A friendly name for this project. Leave blank to keep the current value."
        >
          <TextInput
            placeholder="my-project"
            defaultValue={existing.projectName ?? ""}
            onSubmit={(value) => handleTextSubmit("projectName", value)}
          />
        </WizardStep>
      ) : null}

      {step === "defaultModel" ? (
        <WizardStep
          stepNumber={2}
          totalSteps={TOTAL_STEPS}
          title="Default Model"
          description="The fallback model for all roles. Leave blank to keep the current value."
        >
          <TextInput
            placeholder="claude-sonnet-4-6"
            defaultValue={existing.defaultModel ?? ""}
            onSubmit={(value) => handleTextSubmit("defaultModel", value)}
          />
        </WizardStep>
      ) : null}

      {step === "memoryEnabled" ? (
        <BoolSelectStep
          stepNumber={3}
          title="Memory"
          description="Enable the persistent memory feature for this project."
          options={BOOL_OPTIONS_MEMORY}
          initial={existing.memoryEnabled ?? true}
          onSelect={(value) => advance("memoryEnabled", value)}
        />
      ) : null}

      {step === "gitignoreGoopspec" ? (
        <BoolSelectStep
          stepNumber={4}
          title="Git Ignore .goopspec"
          description="Whether the .goopspec directory should be added to .gitignore."
          options={BOOL_OPTIONS_GITIGNORE}
          initial={existing.gitignoreGoopspec ?? true}
          onSelect={(value) => advance("gitignoreGoopspec", value)}
        />
      ) : null}

      {step === "confirm" && diffs.length > 0 ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={colors.accent} bold>
              Review changes
            </Text>
          </Box>
          <Panel title="Pending changes" variant="subtle">
            {formatDiff(diffs)
              .split("\n")
              .map((line) => (
                <Text key={line} color={colors.text}>
                  {line}
                </Text>
              ))}
          </Panel>
          <Box marginTop={1}>
            <Text color={colors.highlight}>Save changes? </Text>
            <ConfirmInput
              onConfirm={() => setStep("saving")}
              onCancel={() => setStep("cancelled")}
            />
          </Box>
        </Box>
      ) : null}

      {step === "saving" ? (
        <Box>
          <Spinner label="Saving configuration…" />
        </Box>
      ) : null}

      {step === "done" ? (
        <Panel title="Saved" variant="success">
          <Text color={colors.success} bold>
            ✓ Configuration saved to .goopspec/config.json
          </Text>
        </Panel>
      ) : null}

      {step === "noChanges" ? (
        <Panel title="Nothing to do" variant="subtle">
          <Text color={colors.muted}>No changes to save.</Text>
        </Panel>
      ) : null}

      {step === "cancelled" ? (
        <Panel title="Cancelled" variant="warning">
          <Text color={colors.warning}>No changes were written.</Text>
        </Panel>
      ) : null}

      {escEnabled ? <KeyHints hints={FOOTER_HINTS} /> : null}
    </Box>
  );
}

export async function renderConfigScreen(): Promise<void> {
  const existing = (await readConfig()) ?? {};
  const { waitUntilExit } = render(<ConfigWizard existing={existing} />);
  await waitUntilExit();
}
