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
  { name: "status", description: "Show current project and dashboard status" },
  { name: "config", description: "Configure GoopSpec" },
  { name: "models", description: "Assign default and per-role models" },
  { name: "dashboard start", description: "Start the dashboard" },
  { name: "dashboard stop", description: "Stop the dashboard" },
  { name: "dashboard status", description: "Show dashboard process status" },
  { name: "dashboard open", description: "Open the dashboard in a browser" },
  { name: "uninstall", description: "Remove GoopSpec files with confirmation" },
  { name: "help", description: "Show this help" },
];

const COMMAND_COLUMN_WIDTH = 26;

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
                goop {command.name}
              </Text>
            </Box>
            <Text color={colors.muted}>{command.description}</Text>
          </Box>
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
