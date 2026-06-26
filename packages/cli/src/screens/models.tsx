import { Text, render } from "ink";

function ModelsScreen() {
  return <Text>Coming soon: models</Text>;
}

export async function renderModelsScreen(): Promise<void> {
  render(<ModelsScreen />).unmount();
}
