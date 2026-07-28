import { describe, expect, it } from "bun:test";
import { decodePng, encodePng } from "./png-codec.js";

describe("PNG codec", () => {
  it("round-trips dimensions and every RGBA pixel byte", () => {
    const original = {
      data: new Uint8Array([12, 34, 56, 78, 90, 123, 45, 67, 255, 0, 128, 200, 1, 2, 3, 4]),
      width: 2,
      height: 2,
    };

    const decoded = decodePng(encodePng(original));

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect([...decoded.data]).toEqual([...original.data]);
  });

  it("preserves transparent and opaque alpha values", () => {
    const original = {
      data: new Uint8Array([255, 0, 0, 0, 0, 255, 0, 64, 0, 0, 255, 127, 255, 255, 255, 255]),
      width: 4,
      height: 1,
    };

    const decoded = decodePng(encodePng(original));
    const alpha = Array.from(decoded.data, (_value, index) => decoded.data[index * 4 + 3]);

    expect(alpha).toEqual([0, 64, 127, 255]);
  });
});
