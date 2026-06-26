import { Box, Text } from "ink";
import { Fragment } from "react";
import { colors } from "../theme.js";

interface KeyHint {
  key: string;
  label: string;
}

interface KeyHintsProps {
  hints: KeyHint[];
}

/**
 * Compact footer of keyboard shortcuts rendered on a single line:
 * `↑/↓ navigate · ⏎ select · esc back`. Keys are dim, labels muted, with a
 * dim `·` separator between entries.
 */
export function KeyHints({ hints }: KeyHintsProps) {
  return (
    <Box marginTop={1}>
      {hints.map((hint, index) => (
        <Fragment key={`${hint.key}:${hint.label}`}>
          {index > 0 ? <Text dimColor> · </Text> : null}
          <Text dimColor>{hint.key} </Text>
          <Text color={colors.muted}>{hint.label}</Text>
        </Fragment>
      ))}
    </Box>
  );
}
