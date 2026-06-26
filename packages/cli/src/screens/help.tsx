import { Box, Text, render } from "ink";
import { Header, KeyHints, Panel } from "../components/index.js";
import { colors } from "../theme.js";

interface HelpScreenProps {
  unknownCommand?: string;
}

interface CommandEntry {
  name: string;
  description: string;
}

const COMMANDS: CommandEntry[] = [
  { name: "status", description: "Show current configuration and system state" },
  { name: "config", description: "Interactive configuration wizard" },
  { name: "models", description: "Assign models to agent roles" },
  { name: "dashboard", description: "Manage the web dashboard [start|stop|status|open]" },
  { name: "uninstall", description: "Remove GoopSpec configuration and data" },
];

const OPTIONS: CommandEntry[] = [
  { name: "--help, -h", description: "Show this help message" },
  { name: "--version, -v", description: "Show version" },
];

const EXAMPLES = [
  "goop status",
  "goop config",
  "goop models",
  "goop dashboard start",
  "goop dashboard stop",
  "goop uninstall --dry-run",
];

const COMMAND_COLUMN_WIDTH = 18;

function HelpScreen({ unknownCommand }: HelpScreenProps) {
  return (
    <Box flexDirection="column">
      <Header subtitle="Configure, manage, and control GoopSpec" />

      {unknownCommand ? (
        <Box marginBottom={1}>
          <Panel variant="warning">
            <Text>
              <Text color={colors.warning} bold>
                Unknown command:{" "}
              </Text>
              <Text color={colors.text}>{unknownCommand}</Text>
            </Text>
          </Panel>
        </Box>
      ) : null}

      <Panel title="Commands" variant="primary">
        {COMMANDS.map((command) => (
          <Box key={command.name}>
            <Box width={COMMAND_COLUMN_WIDTH}>
              <Text color={colors.primary} bold>
                {command.name}
              </Text>
            </Box>
            <Text color={colors.muted}>{command.description}</Text>
          </Box>
        ))}
      </Panel>

      <Panel title="Options" variant="subtle">
        {OPTIONS.map((option) => (
          <Box key={option.name}>
            <Box width={COMMAND_COLUMN_WIDTH}>
              <Text color={colors.primary} bold>
                {option.name}
              </Text>
            </Box>
            <Text color={colors.muted}>{option.description}</Text>
          </Box>
        ))}
      </Panel>

      <Panel title="Examples" variant="secondary">
        {EXAMPLES.map((example) => (
          <Text key={example} color={colors.text}>
            {example}
          </Text>
        ))}
      </Panel>

      <KeyHints
        hints={[
          { key: "goop", label: "alias for goopspec" },
          { key: "<command>", label: "run a command" },
          { key: "help", label: "this screen" },
        ]}
      />
    </Box>
  );
}

export async function renderHelpScreen(unknownCommand?: string): Promise<void> {
  render(<HelpScreen unknownCommand={unknownCommand} />).unmount();
}
