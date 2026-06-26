import { Box, Static, Text } from "ink";
import type { ReactNode } from "react";
import { colors } from "../theme.js";

interface StaticLogProps {
  items: string[];
  children?: ReactNode;
}

/**
 * The "scroll of completion" pattern: completed `items` are pinned permanently
 * above via Ink's <Static> (rendered once, never re-rendered), while `children`
 * render in the live dynamic area below.
 */
export function StaticLog({ items, children }: StaticLogProps) {
  return (
    <Box flexDirection="column">
      <Static items={items}>
        {(item, index) => (
          <Text key={`${index}:${item}`}>
            <Text color={colors.success}>✔ </Text>
            <Text color={colors.muted}>{item}</Text>
          </Text>
        )}
      </Static>
      {children ? <Box flexDirection="column">{children}</Box> : null}
    </Box>
  );
}
