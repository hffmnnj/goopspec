import { describe, expect, it } from "bun:test";
import { keyGreenScreen } from "./chromakey.js";

function imageFromPixels(pixels: readonly (readonly [number, number, number, number])[]) {
  return {
    data: new Uint8Array(pixels.flat()),
    width: pixels.length,
    height: 1,
  };
}

function pixel(
  image: { data: Uint8Array },
  index: number,
): readonly [number, number, number, number] {
  const offset = index * 4;
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3],
  ];
}

describe("keyGreenScreen", () => {
  it("makes pure green transparent while preserving an opaque subject interior", () => {
    const image = imageFromPixels([
      [0, 255, 0, 255],
      [0, 255, 0, 255],
      [200, 40, 30, 255],
      [200, 40, 30, 255],
    ]);

    const keyed = keyGreenScreen(image);

    expect(keyed).toBe(image);
    expect(pixel(image, 0)[3]).toBe(0);
    expect(pixel(image, 1)[3]).toBe(0);
    expect(pixel(image, 2)[3]).toBe(255);
    expect(pixel(image, 3)[3]).toBe(255);
  });

  it("keeps a near-green subject pixel just outside the outer tolerance opaque", () => {
    const image = imageFromPixels([[0, 154, 0, 255]]);

    keyGreenScreen(image);

    expect(pixel(image, 0)[3]).toBe(255);
  });

  it("does not despill a saturated green subject outside the configured outer tolerance", () => {
    const image = imageFromPixels([[50, 180, 50, 255]]);

    keyGreenScreen(image, { outerTolerance: 90 });

    expect(pixel(image, 0)[3]).toBe(255);
    expect(pixel(image, 0)[1]).toBe(180);
    expect(pixel(image, 0)[1]).toBeGreaterThan((50 + 50) / 2);
  });

  it("assigns anti-aliased transition pixels an intermediate alpha", () => {
    const image = imageFromPixels([[0, 195, 0, 255]]);

    keyGreenScreen(image);

    expect(pixel(image, 0)[3]).toBeGreaterThan(0);
    expect(pixel(image, 0)[3]).toBeLessThan(255);
  });

  it("despills transition pixels contaminated by green", () => {
    const image = imageFromPixels([[20, 200, 20, 255]]);

    keyGreenScreen(image);

    expect(pixel(image, 0)[1]).toBeLessThan(200);
    expect(pixel(image, 0)[1]).toBeGreaterThanOrEqual(20);
  });

  it("keeps despill continuous across the outer tolerance boundary", () => {
    const image = imageFromPixels([
      [0, 156, 0, 255],
      [0, 154, 0, 255],
    ]);

    keyGreenScreen(image);

    expect(Math.abs(pixel(image, 0)[1] - pixel(image, 1)[1])).toBeLessThanOrEqual(3);
  });
});
