import { Badge } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import { fuzzyFilterModels } from "../lib/fuzzy.js";
import type { ModelEntry } from "../lib/models.js";
import type { ModelSource } from "../lib/models.js";
import { colors } from "../theme.js";
import { KeyHints } from "./KeyHints.js";
import { Panel } from "./Panel.js";

const MAX_VISIBLE = 15;

interface ModelPickerProps {
  models: ModelEntry[];
  source: ModelSource;
  /** Pre-selected model id, highlighted when present in the results. */
  defaultValue?: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

const FOOTER_HINTS = [
  { key: "↑/↓", label: "navigate" },
  { key: "type", label: "filter" },
  { key: "⏎", label: "select" },
  { key: "esc", label: "cancel" },
];

/**
 * Self-contained fuzzy-search model picker. A custom text input at the top
 * filters the list in real time via fuzzysort; arrow keys move the cursor and
 * Enter selects. A single `useInput` handler multiplexes typing and navigation:
 * printable characters edit the query (and reset the cursor to the top),
 * arrows/Enter/Esc drive selection. This avoids the focus conflicts that arise
 * from composing a separate TextInput with list navigation.
 */
export function ModelPicker({ models, source, defaultValue, onSelect, onCancel }: ModelPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => fuzzyFilterModels(models, query), [models, query]);
  const visible = filtered.slice(0, MAX_VISIBLE);

  // Keep the cursor within the visible window as results shrink/grow.
  const clampedIndex = Math.min(selectedIndex, Math.max(0, visible.length - 1));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      const chosen = visible[clampedIndex];
      if (chosen) onSelect(chosen.id);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < visible.length - 1 ? prev + 1 : prev));
      return;
    }

    if (key.backspace || key.delete) {
      setQuery((prev) => prev.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Printable characters extend the search and reset the cursor to the top.
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setQuery((prev) => prev + input);
      setSelectedIndex(0);
    }
  });

  const sourceLabel = source === "live" ? "Live" : "Fallback";
  const sourceColor = source === "live" ? colors.success : colors.warning;
  const hiddenCount = filtered.length - visible.length;

  return (
    <Box flexDirection="column">
      <Panel title="Model Picker" variant="primary">
        <Box marginBottom={1}>
          <Text color={colors.muted}>Source: </Text>
          <Badge color={sourceColor}>{sourceLabel}</Badge>
        </Box>

        <Box marginBottom={1}>
          <Text color={colors.muted}>Search: </Text>
          <Text color={colors.text}>{query}</Text>
          <Text color={colors.accent}>▏</Text>
        </Box>

        {visible.length === 0 ? (
          <Box>
            <Text color={colors.muted}>No models match "{query}".</Text>
          </Box>
        ) : (
          visible.map((model, index) => {
            const active = index === clampedIndex;
            const isDefault = defaultValue !== undefined && model.id === defaultValue;
            return (
              <Box key={model.id}>
                <Text color={active ? colors.highlight : colors.muted}>
                  {active ? "▸ " : "  "}
                </Text>
                <Text color={active ? colors.highlight : colors.text} bold={active}>
                  {model.name}
                </Text>
                {isDefault ? <Text color={colors.success}> ✓</Text> : null}
                <Text color={colors.muted}> ({model.provider})</Text>
              </Box>
            );
          })
        )}

        <Box marginTop={1}>
          <Text color={colors.muted}>
            {filtered.length} {filtered.length === 1 ? "model" : "models"} found
            {hiddenCount > 0 ? ` (showing top ${visible.length})` : ""}
          </Text>
        </Box>
      </Panel>

      <KeyHints hints={FOOTER_HINTS} />
    </Box>
  );
}
