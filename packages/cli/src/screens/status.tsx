import { Text, render } from "ink";

function StatusScreen() {
  return <Text>Coming soon: status</Text>;
}

export async function renderStatusScreen(): Promise<void> {
  render(<StatusScreen />).unmount();
}
