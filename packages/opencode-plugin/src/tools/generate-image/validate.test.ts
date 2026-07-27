import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupTestEnvironment } from "../../test-utils.js";
import { MAX_COUNT, MAX_INPUT_IMAGES, MAX_INPUT_IMAGE_BYTES } from "./constants.js";
import type { GenerateOptions } from "./types.js";
import { ValidationError, validateGenerateOptions } from "./validate.js";

describe("validateGenerateOptions", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("generate-image-validate");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  const base: GenerateOptions = {
    prompt: "a red circle",
    model: "gpt-image-2",
  };

  it("rejects an empty prompt", async () => {
    await expect(validateGenerateOptions({ prompt: "", model: "gpt-image-2" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects a missing model", async () => {
    await expect(validateGenerateOptions({ prompt: "hi" } as GenerateOptions)).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects an unsupported model", async () => {
    await expect(
      validateGenerateOptions({ ...base, model: "dall-e-3" as "gpt-image-2" }),
    ).rejects.toThrow(/not supported/);
  });

  it("accepts the supported models", async () => {
    for (const model of ["gpt-image-2", "gpt-image-1.5"] as const) {
      const result = await validateGenerateOptions({ ...base, model });
      expect(result.options.model).toBe(model);
    }
  });

  it("normalizes jpg to jpeg", async () => {
    const result = await validateGenerateOptions({ ...base, outputFormat: "jpg" as "jpeg" });
    expect(result.options.outputFormat).toBe("jpeg");
  });

  it("rejects an unsupported output format", async () => {
    await expect(
      validateGenerateOptions({ ...base, outputFormat: "gif" as "jpeg" }),
    ).rejects.toThrow(/not supported/);
  });

  it("rejects an unsupported quality", async () => {
    await expect(validateGenerateOptions({ ...base, quality: "ultra" as "high" })).rejects.toThrow(
      /not supported/,
    );
  });

  it("rejects an unsupported background", async () => {
    await expect(
      validateGenerateOptions({ ...base, background: "gradient" as "transparent" }),
    ).rejects.toThrow(/not supported/);
  });

  it("rejects an unsupported detail level", async () => {
    await expect(validateGenerateOptions({ ...base, detail: "medium" as "high" })).rejects.toThrow(
      /not supported/,
    );
  });

  it("rejects an unsupported action", async () => {
    await expect(
      validateGenerateOptions({ ...base, action: "upscale" as "generate" }),
    ).rejects.toThrow(/not supported/);
  });

  it("rejects an unsupported input fidelity", async () => {
    await expect(
      validateGenerateOptions({ ...base, inputFidelity: "medium" as "high" }),
    ).rejects.toThrow(/not supported/);
  });

  it("rejects an unsupported moderation level", async () => {
    await expect(
      validateGenerateOptions({ ...base, moderation: "strict" as "auto" }),
    ).rejects.toThrow(/not supported/);
  });

  it("clamps count below 1 to 1", async () => {
    const result = await validateGenerateOptions({ ...base, count: 0 });
    expect(result.options.count).toBe(1);
  });

  it("clamps count above MAX_COUNT to MAX_COUNT", async () => {
    const result = await validateGenerateOptions({ ...base, count: 99 });
    expect(result.options.count).toBe(MAX_COUNT);
  });

  it("preserves a valid count", async () => {
    const result = await validateGenerateOptions({ ...base, count: 2 });
    expect(result.options.count).toBe(2);
  });

  it("caps input images at MAX_INPUT_IMAGES", async () => {
    const images = Array.from({ length: MAX_INPUT_IMAGES + 1 }, (_, i) =>
      join(testDir, `img${i}.png`),
    );
    await expect(validateGenerateOptions({ ...base, inputImages: images })).rejects.toThrow(
      /Too many input images/,
    );
  });

  it("rejects an input image over 64 MiB", async () => {
    const path = join(testDir, "big.png");
    writeFileSync(path, Buffer.alloc(MAX_INPUT_IMAGE_BYTES + 1));
    await expect(
      validateGenerateOptions({ ...base, model: "gpt-image-1.5", inputImages: [path] }),
    ).rejects.toThrow(/exceeds 64 MiB/);
  });

  it("accepts a valid input image", async () => {
    const path = join(testDir, "ok.png");
    writeFileSync(path, Buffer.from([0, 1, 2, 3]));
    const result = await validateGenerateOptions({
      ...base,
      model: "gpt-image-1.5",
      inputImages: [path],
    });
    expect(result.options.inputImages).toEqual([path]);
  });

  describe("size rules for gpt-image-1 / 1.5", () => {
    const model = "gpt-image-1.5" as const;

    it.each(["1024x1024", "1536x1024", "1024x1536", "auto"])(
      "accepts fixed size %s",
      async (size) => {
        const result = await validateGenerateOptions({ prompt: "x", model, size });
        expect(result.options.size).toBe(size);
      },
    );

    it("rejects a custom size on gpt-image-1.5", async () => {
      await expect(
        validateGenerateOptions({ prompt: "x", model, size: "1280x720" }),
      ).rejects.toThrow(/not supported/);
    });
  });

  describe("size rules for gpt-image-2", () => {
    const model = "gpt-image-2" as const;

    it("rejects auto size", async () => {
      await expect(validateGenerateOptions({ prompt: "x", model, size: "auto" })).rejects.toThrow(
        /not supported/,
      );
    });

    it("accepts both edges divisible by 16", async () => {
      const result = await validateGenerateOptions({ prompt: "x", model, size: "1280x720" });
      expect(result.options.size).toBe("1280x720");
    });

    it("rejects an edge not divisible by 16", async () => {
      await expect(
        validateGenerateOptions({ prompt: "x", model, size: "1281x720" }),
      ).rejects.toThrow(/divisible by 16/);
    });

    it("accepts a 3840px edge", async () => {
      const result = await validateGenerateOptions({ prompt: "x", model, size: "3840x1280" });
      expect(result.options.size).toBe("3840x1280");
    });

    it("rejects an edge above 3840px", async () => {
      await expect(
        validateGenerateOptions({ prompt: "x", model, size: "3856x1280" }),
      ).rejects.toThrow(/exceeds the 3840px/);
    });

    it("accepts a 3:1 aspect ratio", async () => {
      const result = await validateGenerateOptions({ prompt: "x", model, size: "3840x1280" });
      expect(result.options.size).toBe("3840x1280");
    });

    it("rejects an aspect ratio above 3:1", async () => {
      await expect(
        validateGenerateOptions({ prompt: "x", model, size: "3840x1184" }),
      ).rejects.toThrow(/3:1/);
    });

    it("accepts the minimum pixel count", async () => {
      // Minimum is 655,360 pixels. Use 1280 x 512 = 655,360; both divisible by 16, ratio 2.5.
      const result = await validateGenerateOptions({ prompt: "x", model, size: "1280x512" });
      expect(result.options.size).toBe("1280x512");
    });

    it("accepts the maximum pixel count", async () => {
      // 8,294,400 = 3840 x 2160; both edges divisible by 16, ratio 16/9.
      const result = await validateGenerateOptions({ prompt: "x", model, size: "3840x2160" });
      expect(result.options.size).toBe("3840x2160");
    });

    it("rejects a size below the pixel floor", async () => {
      await expect(
        validateGenerateOptions({ prompt: "x", model, size: "1024x624" }),
      ).rejects.toThrow(/between 655,360 and 8,294,400/);
    });

    it("rejects a size above the pixel ceiling", async () => {
      await expect(
        validateGenerateOptions({ prompt: "x", model, size: "3840x2208" }),
      ).rejects.toThrow(/between 655,360 and 8,294,400/);
    });
  });

  describe("model gating", () => {
    it("downgrades gpt-image-2 to gpt-image-1.5 when background is transparent", async () => {
      const result = await validateGenerateOptions({
        ...base,
        background: "transparent",
      });

      expect(result.options.model).toBe("gpt-image-1.5");
      expect(result.modelSubstitution).toEqual({
        from: "gpt-image-2",
        to: "gpt-image-1.5",
        reason:
          'background="transparent" is not supported by gpt-image-2; the model has been switched to gpt-image-1.5.',
      });
    });

    it("does not downgrade when background is opaque or auto", async () => {
      for (const background of ["opaque", "auto"] as const) {
        const result = await validateGenerateOptions({ ...base, background });
        expect(result.options.model).toBe("gpt-image-2");
        expect(result.modelSubstitution).toBeUndefined();
      }
    });

    it("omits input_fidelity entirely for gpt-image-2", async () => {
      const result = await validateGenerateOptions({
        ...base,
        inputFidelity: "high",
      });
      expect(result.options.model).toBe("gpt-image-2");
      expect(result.options.inputFidelity).toBeUndefined();
      const keys = Object.keys(result.options);
      expect(keys).not.toContain("inputFidelity");
    });

    it("preserves input_fidelity for gpt-image-1.5", async () => {
      const result = await validateGenerateOptions({
        prompt: "x",
        model: "gpt-image-1.5",
        inputFidelity: "high",
      });
      expect(result.options.inputFidelity).toBe("high");
    });
  });
});
