import { Box, Text, render } from "ink";

interface HelpScreenProps {
  unknownCommand?: string;
}

function HelpScreen({ unknownCommand }: HelpScreenProps) {
  return (
    <Box flexDirection="column">
      <Text bold>GoopSpec CLI</Text>
      {unknownCommand ? <Text color="yellow">Unknown command: {unknownCommand}</Text> : null}
      <Text>Configure, manage, and control GoopSpec.</Text>
      <Text> </Text>
      <Text bold>Commands</Text>
      <Text>  goopspec status              Show current project and dashboard status</Text>
      <Text>  goopspec config              Configure GoopSpec</Text>
      <Text>  goopspec models              Assign default and per-role models</Text>
      <Text>  goopspec dashboard start     Start the dashboard</Text>
      <Text>  goopspec dashboard stop      Stop the dashboard</Text>
      <Text>  goopspec dashboard status    Show dashboard process status</Text>
      <Text>  goopspec dashboard open      Open the dashboard in a browser</Text>
      <Text>  goopspec uninstall           Remove GoopSpec files with confirmation</Text>
      <Text>  goopspec help                Show this help</Text>
      <Text> </Text>
      <Text dimColor>Alias: goop</Text>
    </Box>
  );
}

export async function renderHelpScreen(unknownCommand?: string): Promise<void> {
  render(<HelpScreen unknownCommand={unknownCommand} />).unmount();
}
