import { Text, render } from "ink";

function UninstallScreen() {
  return <Text>Coming soon: uninstall</Text>;
}

export async function renderUninstallScreen(): Promise<void> {
  render(<UninstallScreen />).unmount();
}
