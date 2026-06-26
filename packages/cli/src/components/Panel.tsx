import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { type PanelVariant, panelVariants } from "../theme.js";

interface PanelProps {
  title?: string;
  variant?: PanelVariant;
  children: ReactNode;
  width?: number | string;
}

/**
 * Bordered container whose border style and color are driven by a semantic
 * variant (see theme.panelVariants). The optional title renders inline above
 * the body with the same accent color as the border.
 */
export function Panel({ title, variant = "primary", children, width }: PanelProps) {
  const { borderStyle, borderColor } = panelVariants[variant];

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={1}
      width={width}
    >
      {title ? (
        <Box marginBottom={1}>
          <Text color={borderColor} bold>
            {title}
          </Text>
        </Box>
      ) : null}
      {children}
    </Box>
  );
}
