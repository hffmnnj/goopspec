export const DEFAULT_KEY_COLOR = [0, 255, 0] as const;
export const DEFAULT_INNER_TOLERANCE = 40;
export const DEFAULT_OUTER_TOLERANCE = 100;

interface RgbaImage {
  data: Uint8Array;
  width: number;
  height: number;
}

interface KeyGreenScreenOptions {
  keyColor?: readonly [number, number, number];
  innerTolerance?: number;
  outerTolerance?: number;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function validTolerance(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? value : fallback;
}

function validChannel(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined ? clampChannel(value) : fallback;
}

function despill(green: number, red: number, blue: number, weight: number): number {
  const despilledGreen = Math.min(green, (red + blue) / 2);
  return clampChannel(green + (despilledGreen - green) * weight);
}

/**
 * Keys green-screen pixels by mutating and returning the supplied RGBA buffer.
 * Malformed dimensions or short buffers are processed only through their shared
 * complete-pixel range.
 */
export function keyGreenScreen(image: RgbaImage, options: KeyGreenScreenOptions = {}): RgbaImage {
  const innerTolerance = validTolerance(options.innerTolerance, DEFAULT_INNER_TOLERANCE);
  const requestedOuterTolerance = validTolerance(options.outerTolerance, DEFAULT_OUTER_TOLERANCE);
  const outerTolerance = Math.max(innerTolerance, requestedOuterTolerance);
  const [defaultRed, defaultGreen, defaultBlue] = DEFAULT_KEY_COLOR;
  const keyRed = validChannel(options.keyColor?.[0], defaultRed);
  const keyGreen = validChannel(options.keyColor?.[1], defaultGreen);
  const keyBlue = validChannel(options.keyColor?.[2], defaultBlue);
  const expectedPixelCount =
    Number.isFinite(image.width) &&
    Number.isFinite(image.height) &&
    image.width > 0 &&
    image.height > 0
      ? Math.floor(image.width) * Math.floor(image.height)
      : 0;
  const pixelCount = Math.min(expectedPixelCount, Math.floor(image.data.length / 4));
  const innerSquared = innerTolerance * innerTolerance;
  const outerSquared = outerTolerance * outerTolerance;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const deltaRed = red - keyRed;
    const deltaGreen = green - keyGreen;
    const deltaBlue = blue - keyBlue;
    const distanceSquared = deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue;

    if (distanceSquared <= innerSquared) {
      image.data[offset + 3] = 0;
      continue;
    }

    if (distanceSquared >= outerSquared || outerTolerance === innerTolerance) {
      continue;
    }

    // Band checks use squared distances; only the soft-matte band needs linear distance.
    const distance = Math.sqrt(distanceSquared);
    const transition = (distance - innerTolerance) / (outerTolerance - innerTolerance);
    const matte = transition * transition * (3 - 2 * transition);
    image.data[offset + 3] = clampChannel(image.data[offset + 3] * matte);
    image.data[offset + 1] = despill(green, red, blue, 1 - matte);
  }

  return image;
}
