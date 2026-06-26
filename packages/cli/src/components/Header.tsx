import BigText from "ink-big-text";
import Gradient from "ink-gradient";
import { Box, Text } from "ink";
import { colors, gradient } from "../theme.js";

const VERSION = process.env.npm_package_version ?? "0.1.0";
const BRAND = "GoopSpec";

interface HeaderProps {
  subtitle?: string;
}

/**
 * Renders the brand wordmark in big gradient text. ink-gradient + ink-big-text
 * declare `ink >=4` peer deps and are ESM-compatible with Ink v5; if either
 * throws at render time we fall back to a handcrafted per-character gradient so
 * the build and runtime never break on a styling dependency.
 */
function BrandMark() {
  try {
    return (
      <Gradient colors={gradient.colors}>
        <BigText text={BRAND} font="block" />
      </Gradient>
    );
  } catch {
    return <GradientFallback />;
  }
}

function GradientFallback() {
  const palette = gradient.fallback;
  return (
    <Text bold>
      {BRAND.split("").map((char, index) => (
        // Index keys are stable here: BRAND is a fixed constant string.
        // biome-ignore lint/suspicious/noArrayIndexKey: characters of a constant string
        <Text key={index} color={palette[index % palette.length]}>
          {char}
        </Text>
      ))}
    </Text>
  );
}

export function Header({ subtitle = "GoopSpec Control Center" }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <BrandMark />
      <Box>
        <Text color={colors.accent} bold>
          v{VERSION}
        </Text>
        <Text color={colors.muted}> · </Text>
        <Text color={colors.muted}>{subtitle}</Text>
      </Box>
    </Box>
  );
}
