import { Box, Text, render } from "ink";

const dashboardSubcommands = new Set(["start", "stop", "status", "open"]);

interface DashboardScreenProps {
  subcommand?: string;
}

function DashboardScreen({ subcommand }: DashboardScreenProps) {
  const requestedSubcommand = subcommand ?? "status";
  const isSupported = dashboardSubcommands.has(requestedSubcommand);

  return (
    <Box flexDirection="column">
      <Text>Coming soon: dashboard {isSupported ? requestedSubcommand : "status"}</Text>
      {isSupported ? null : <Text color="yellow">Unknown dashboard subcommand: {requestedSubcommand}</Text>}
    </Box>
  );
}

export async function renderDashboardScreen(subcommand?: string): Promise<void> {
  render(<DashboardScreen subcommand={subcommand} />).unmount();
}
