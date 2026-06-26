import { Box, Text } from "ink";
import type { ReactNode } from "react";
import { Panel } from "./Panel.js";
import { colors } from "../theme.js";

interface WizardStepProps {
  stepNumber: number;
  totalSteps: number;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Reusable wrapper for a single wizard step. Renders a `Step N of M` counter
 * above a primary-variant Panel that frames the step's title, optional
 * description, and interactive content. The active step always uses the
 * `primary` panel variant so the focused field reads as the foreground.
 */
export function WizardStep({
  stepNumber,
  totalSteps,
  title,
  description,
  children,
}: WizardStepProps) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={colors.accent} bold>
          Step {stepNumber}
        </Text>
        <Text color={colors.muted}> of {totalSteps}</Text>
      </Box>

      <Panel title={title} variant="primary">
        {description ? (
          <Box marginBottom={1}>
            <Text color={colors.muted}>{description}</Text>
          </Box>
        ) : null}
        {children}
      </Panel>
    </Box>
  );
}
