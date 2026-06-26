import { Text, render } from "ink";

function ConfigScreen() {
  return <Text>Coming soon: config</Text>;
}

export async function renderConfigScreen(): Promise<void> {
  render(<ConfigScreen />).unmount();
}
