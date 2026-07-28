/**
 * PNG codec seam — the only file permitted to import pngjs. This is the swap
 * point: replacing pngjs (e.g. once Bun.Image exposes raw pixels) touches
 * exactly one file. The keying module imports no image library and operates
 * purely on the { data, width, height } RGBA buffer produced here.
 *
 * data is RGBA, 4 bytes per pixel. pngjs normalises every input colour type to
 * 8-bit RGBA on read and the packer defaults write 8-bit RGBA, so both
 * functions are thin wrappers over PNG.sync.read / PNG.sync.write.
 */

import { PNG } from "pngjs";

interface RgbaImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export function decodePng(buffer: Buffer): RgbaImage {
  const png = PNG.sync.read(buffer);
  return { data: png.data, width: png.width, height: png.height };
}

export function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}
