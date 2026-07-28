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
  };

  it("rejects an empty prompt", async () => {
    await expect(validateGenerateOptions({ prompt: "" })).rejects.toThrow(ValidationError);
  });

  it("accepts the supported model", async () => {
    const result = await validateGenerateOptions({ ...base });
    expect(result.options.model).toBe("gpt-image-2");
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
    await expect(validateGenerateOptions({ ...base, inputImages: [path] })).rejects.toThrow(
      /exceeds 64 MiB/,
    );
  });

  it("accepts a valid input image", async () => {
    const path = join(testDir, "ok.png");
    writeFileSync(path, Buffer.from([0, 1, 2, 3]));
    const result = await validateGenerateOptions({
      ...base,
      inputImages: [path],
    });
    expect(result.options.inputImages).toEqual([path]);
  });

  describe("size rules for gpt-image-2", () => {
    it("rejects auto size", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "auto" })).rejects.toThrow(
        /not supported/,
      );
    });

    it("accepts both edges divisible by 16", async () => {
      const result = await validateGenerateOptions({ prompt: "x", size: "1280x720" });
      expect(result.options.size).toBe("1280x720");
    });

    it("rejects an edge not divisible by 16", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "1281x720" })).rejects.toThrow(
        /divisible by 16/,
      );
    });

    it("accepts a 3840px edge", async () => {
      const result = await validateGenerateOptions({ prompt: "x", size: "3840x1280" });
      expect(result.options.size).toBe("3840x1280");
    });

    it("rejects an edge above 3840px", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "3856x1280" })).rejects.toThrow(
        /exceeds the 3840px/,
      );
    });

    it("accepts a 3:1 aspect ratio", async () => {
      const result = await validateGenerateOptions({ prompt: "x", size: "3840x1280" });
      expect(result.options.size).toBe("3840x1280");
    });

    it("rejects an aspect ratio above 3:1", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "3840x1184" })).rejects.toThrow(
        /3:1/,
      );
    });

    it("accepts the minimum pixel count", async () => {
      // Minimum is 655,360 pixels. Use 1280 x 512 = 655,360; both divisible by 16, ratio 2.5.
      const result = await validateGenerateOptions({ prompt: "x", size: "1280x512" });
      expect(result.options.size).toBe("1280x512");
    });

    it("accepts the maximum pixel count", async () => {
      // 8,294,400 = 3840 x 2160; both edges divisible by 16, ratio 16/9.
      const result = await validateGenerateOptions({ prompt: "x", size: "3840x2160" });
      expect(result.options.size).toBe("3840x2160");
    });

    it("rejects a size below the pixel floor", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "1024x624" })).rejects.toThrow(
        /between 655,360 and 8,294,400/,
      );
    });

    it("rejects a size above the pixel ceiling", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "3840x2208" })).rejects.toThrow(
        /between 655,360 and 8,294,400/,
      );
    });
  });

  describe("validateSize boundaries (SPEC MH8)", () => {
    it("accepts 1024x1024", async () => {
      const result = await validateGenerateOptions({ prompt: "x", size: "1024x1024" });
      expect(result.options.size).toBe("1024x1024");
    });

    it("rejects auto because gpt-image-2 requires explicit dimensions", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "auto" })).rejects.toThrow(
        /not supported/,
      );
    });

    it("rejects 1000x1000 because edges are not divisible by 16", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "1000x1000" })).rejects.toThrow(
        /divisible by 16/,
      );
    });

    it("rejects 4096x1024 because the max edge exceeds 3840px", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "4096x1024" })).rejects.toThrow(
        /exceeds the 3840px/,
      );
    });

    it("rejects 3072x512 because the aspect ratio exceeds 3:1", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "3072x512" })).rejects.toThrow(
        /3:1/,
      );
    });

    it("rejects 512x512 because the pixel count is below the 655,360 floor", async () => {
      await expect(validateGenerateOptions({ prompt: "x", size: "512x512" })).rejects.toThrow(
        /between 655,360 and 8,294,400/,
      );
    });
  });

  describe("transparent background: green-screen augmentation and png requirement", () => {
    it("returns promptAugmentation with final === original + appended", async () => {
      const result = await validateGenerateOptions({ ...base, background: "transparent" });
      const aug = result.promptAugmentation;
      expect(aug).toBeDefined();
      expect(aug?.final).toBe((aug?.original ?? "") + (aug?.appended ?? ""));
    });

    it("augmented prompt mentions green background and no shadows", async () => {
      const result = await validateGenerateOptions({ ...base, background: "transparent" });
      const final = result.promptAugmentation?.final ?? "";
      expect(final).toContain("green background");
      expect(final.toLowerCase()).toContain("no shadows");
    });

    it("sets options.prompt to the augmented final prompt", async () => {
      const result = await validateGenerateOptions({ ...base, background: "transparent" });
      const aug = result.promptAugmentation;
      expect(aug).toBeDefined();
      if (!aug) return;
      expect(result.options.prompt).toBe(aug.final);
    });

    it("leaves options.background as transparent (internal intent survives validation)", async () => {
      const result = await validateGenerateOptions({ ...base, background: "transparent" });
      expect(result.options.background).toBe("transparent");
    });

    it("defaults output format to png when no format is specified", async () => {
      const result = await validateGenerateOptions({ ...base, background: "transparent" });
      expect(result.options.outputFormat).toBe("png");
    });

    it("rejects transparent background with jpeg output and mentions png", async () => {
      const error = await validateGenerateOptions({
        ...base,
        background: "transparent",
        outputFormat: "jpeg",
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as Error).message).toContain("png");
    });

    it("rejects transparent background with webp output and mentions png", async () => {
      const error = await validateGenerateOptions({
        ...base,
        background: "transparent",
        outputFormat: "webp",
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as Error).message).toContain("png");
    });
  });

  describe("non-transparent background: no augmentation", () => {
    it("returns promptAugmentation undefined and unmodified prompt for opaque", async () => {
      const result = await validateGenerateOptions({ ...base, background: "opaque" });
      expect(result.promptAugmentation).toBeUndefined();
      expect(result.options.prompt).toBe(base.prompt);
    });

    it("returns promptAugmentation undefined and unmodified prompt for auto", async () => {
      const result = await validateGenerateOptions({ ...base, background: "auto" });
      expect(result.promptAugmentation).toBeUndefined();
      expect(result.options.prompt).toBe(base.prompt);
    });

    it("returns promptAugmentation undefined and unmodified prompt when background is omitted", async () => {
      const result = await validateGenerateOptions({ ...base });
      expect(result.promptAugmentation).toBeUndefined();
      expect(result.options.prompt).toBe(base.prompt);
    });
  });
});
