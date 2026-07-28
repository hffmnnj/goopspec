# Image Prompting

A practical prompting guide for the `generate_image` tool, built on verified GPT Image 2 behavior. Every technique below is backed by observed model behavior, not generic image-generation advice.

The tool is invoked with `generate_image` and supports `prompt`, `out`, `images[]`, `size`, `quality`, `outputFormat`, `background`, `count`, `action`, `timeout`, `dryRun`, `authFile`, `moderation`, `outputCompression`, `detail`, `mask`, and `allowRefresh`. Images are generated with `gpt-image-2`; there is no caller-facing `model` argument.

## Canonical Prompt Skeleton

Order matters. Start with the scene, place the subject, add the details that control quality, then lock in constraints.

```text
[INTENDED USE]: Create a [TYPE] for [PURPOSE/AUDIENCE].
[SUBJECT]: [Main subject with key details]
[ENVIRONMENT/BACKGROUND]: [Setting, background treatment]
[STYLE/MEDIUM]: [Photorealistic / illustration / vector / etc.]
[COMPOSITION]: [Framing, layout, negative space]
[LIGHTING/MOOD]: [Lighting direction, quality, mood]
[CONSTRAINTS]: What to include, exclude, and preserve.
[TEXT IN IMAGE] (if needed): Exact text, typography, placement.
```

Stating the intended use calibrates polish level. "Create a realistic mobile app UI mockup for..." produces a different result than "A mobile app for a farmers market" because it tells the model which mode to enter.

## Length

Most tasks need 1-3 clear sentences. Complex tasks — infographics, multi-panel comics, detailed product shots — benefit from labeled segments.

Diminishing returns appear around 200-300 words. Beyond that, split the work into iterations: lock the base composition first, then refine.

## Specificity and Quality Cues

Concrete details beat generic superlatives. "8K" and "ultra-detailed" steer the image less reliably than specific camera and composition vocabulary.

Useful cues for photorealism:

- "photorealistic"
- "real photograph"
- "taken on a real camera"
- "professional photography"
- "iPhone photo"

Useful material and style cues:

- Surface material: "white marble", "matte silicone", "brushed aluminum"
- Lens or framing feel: "85mm portrait lens", "macro close-up", "wide environmental portrait"
- Texture cues: "film grain", "textured brushstrokes"

Example:

```text
Photorealistic product shot of a shampoo bottle on a white marble surface.
Soft studio lighting from the upper left, gentle shadows.
The bottle is centered with a slight angle to show the label.
Background: clean minimal gradient from white to light gray.
Style: professional e-commerce photography, high-end cosmetic brand aesthetic.
No watermarks, no extra text, no logos other than the product label.
```

## Composition Control

Describe layout in the same terms a photographer or designer would use:

- **Framing**: close-up, medium shot, wide shot, top-down, overhead
- **Perspective**: eye-level, low-angle, high-angle, three-quarter view
- **Placement**: "logo top-right", "subject centered with negative space on the left"
- **Lighting**: "soft diffuse window light", "golden hour rim light", "high-contrast neon"
- **Mood**: "cinematic", "clinical", "warm and inviting"

For mood-heavy scenes — rain, neon, low light, wide cinematic — add extra detail about scale, atmosphere, and color so the model does not flatten the mood into generic realism.

## Text Rendering

GPT Image 2 renders text better than earlier models, but it still garbles, misspells, or misplaces it. Make the text unmistakable:

- Put literal text in **quotes** or **ALL CAPS**.
- Specify typography: "bold sans-serif, white, centered at the top, 72pt".
- For tricky words, spell letter-by-letter: "O-P-E-N-A-I", "S-T-R-I-P-E".
- Use `quality: "medium"` or `"high"` for text-heavy images.
- Keep text short and simple; test simple phrases before complex layouts.

Example:

```text
Include the text "WEEKLY PLAN" in bold sans-serif, white, centered at the top.
No other text in the image.
```

## No Negative-Prompt Parameter and No Seed

The tool does **not** expose a negative-prompt parameter or a seed. Put exclusions directly in the prompt as explicit constraints:

```text
No watermarks, no extra text, no logos, no people, no gradients.
```

Determinism is unavailable. Each generation is non-deterministic. For consistency, reuse the same prompt and reference images, chain edits in the same conversation, and reuse the `revisedPrompt` that the backend returns when you get a result you like.

## Reference Images and Editing

Pass up to five reference images via `images[]`. The `action` argument can be `generate`, `edit`, or `auto`; `auto` is the default and lets the model decide.

For surgical edits, use this exact pattern:

```text
Change only X. Keep everything else exactly the same.
```

Repeat the preserve list on every iteration. Drift happens when the model forgets earlier constraints.

```text
Do not change her face, facial features, skin tone, body shape, pose, or identity.
Preserve her exact likeness, expression, hairstyle, and proportions.
Replace only the clothing.
```

Label references by index so the model knows what each image is for:

```text
Image 1: product photo of a shampoo bottle.
Image 2: watercolor style reference.
Apply Image 2's style to the product in Image 1.
```

## Transparent Backgrounds

`gpt-image-2` has no native transparent background. When you set `background: "transparent"`, the tool renders the subject on a green screen, then keys the green to alpha locally and writes a PNG.

1. A green-screen instruction is appended to your prompt.
2. The wire request sends `background: "opaque"` — `"transparent"` is rejected by the v2 backend, and omitting the field can fall back to `auto`.
3. The returned image is decoded, the green is keyed to alpha, and the result is re-encoded as PNG.
4. The success message quotes the exact instruction under a `Transparency:` line.

Transparent output is PNG only. `outputFormat: "jpeg"` and `outputFormat: "webp"` are rejected because the local keyer produces PNG; if you omit `outputFormat` with `background: "transparent"`, it defaults to `png`.

If decode, key, or encode throws, the original un-keyed image is still written to disk and a warning is returned. The file on disk will still have a green background.

### Worked example

Prompt you write:

```text
A cute orange cat sticker, simple design, bold outlines, vibrant colors, crisp silhouette.
```

Call:

```json
{
  "prompt": "A cute orange cat sticker, simple design, bold outlines, vibrant colors, crisp silhouette.",
  "background": "transparent",
  "outputFormat": "png"
}
```

What the model actually receives:

```text
A cute orange cat sticker, simple design, bold outlines, vibrant colors, crisp silhouette.

Render the subject on a uniform, fully saturated green background. Produce no shadows, no contact shadows, and no reflections. Avoid green spill or green light bouncing onto the subject.
```

What you receive:

```text
Success: generated 1 image using gpt-image-2.
Files written:
  /project/.goopspec/generated-images/cute-orange-cat-sticker-1234567890.png
Transparency: gpt-image-2 has no native transparent background. The image was rendered on a green screen and keyed to alpha locally. The following instruction was appended to your prompt:

Render the subject on a uniform, fully saturated green background. Produce no shadows, no contact shadows, and no reflections. Avoid green spill or green light bouncing onto the subject.
```

If the local keying step fails, the same path is returned with a green background and a warning:

```text
Warnings:
  Image saved at /project/.goopspec/generated-images/cute-orange-cat-sticker-1234567890.png, but its background is still green rather than transparent because local green-screen keying failed.
```

### Getting a clean key

The main failure mode is shadows. A contact shadow under the subject keys as a hole or leaves a grey fringe because it is not pure green. The augmentation already asks for no shadows, no contact shadows, and no reflections, but the model may still draw them.

To reduce shadow artifacts:

- Keep the subject physically separated from any ground plane in the prompt. "Floating", "levitating", or "suspended in mid-air" removes the natural shadow anchor.
- Ask for hard, even studio lighting rather than directional light.
- Avoid prompts that imply a surface, such as "standing on a table" or "resting on a floor".
- If you do get fringes, add explicit constraints: "no ground shadow", "no drop shadow", "no cast shadow", "no ambient occlusion".
- Generate at a size large enough that soft edges are not a single pixel wide; a small anti-aliased fringe can disappear entirely or key unevenly.

## Size and Aspect Selection

`gpt-image-2` uses custom sizes only. Constraints:

- Format: `<width>x<height>` with both edges divisible by 16.
- Maximum edge: 3840px.
- Aspect ratio: long:short ≤ 3:1.
- Total pixels: 655,360 to 8,294,400.

| Size | Aspect | Best for |
|------|--------|----------|
| `1024x1024` | 1:1 | Fastest, reliable |
| `1536x1024` | 3:2 | Landscape presentations |
| `1024x1536` | 2:3 | Portrait assets |
| `2560x1440` | 16:9 | 2K, recommended upper reliability boundary |
| `3840x2160` | 16:9 | 4K, experimental above 2K |

If a custom size violates the rules, the tool returns a validation error before contacting the backend.

## Iteration Loops

Iterate in small, single-change steps. Hold the core prompt constant while adjusting one element at a time.

Effective follow-up prompts:

- "Make lighting warmer."
- "Remove the extra tree on the right."
- "Restore the original background."
- "Keep the same composition, but make the style more modern."

### When to Keep Going

Keep iterating when the subject, composition, and style are right and only one element needs adjustment. Re-specify critical details if they drift.

### When to Start Fresh

Start a new generation rather than editing when:

- The style needs a fundamental change.
- The subject is completely different.
- Multiple elements need to change at once.
- Edit history is causing compounding drift.
- You have done 3-4 iterations without improvement.

## Moderation

The `moderation` argument accepts `auto` (default) or `low`. `auto` applies standard filtering; `low` is less restrictive but still filtered.

Common triggers:

- Celebrity or political names
- Brand names and trademarks
- Violent, gory, sexual, or self-harm content
- Hate symbols or harassment
- Copyrighted characters

When the backend blocks generation, the error shape is:

```json
{
  "error": {
    "type": "image_generation_user_error",
    "code": "moderation_blocked",
    "moderation_details": {
      "moderation_stage": "input",
      "categories": ["harassment"]
    }
  }
}
```

`moderation_stage` can be `input`, `output`, or `unknown`. The `categories` field contains coarse public labels.

### Legitimate Rephrasing

This is rephrasing guidance, not bypass advice. Do not try to evade moderation. Instead, describe visual characteristics rather than naming a person, brand, or protected concept.

| Weak | Strong |
|------|--------|
| "A photo of Taylor Swift" | "A photorealistic portrait of a young woman with blonde hair and red lipstick, pop star aesthetic" |
| "Nike logo" | "A simple vector logo with a swoosh-like shape, athletic brand aesthetic" |
| "A bloody wound" | "A realistic medical illustration of a healing scrape, educational context" |

Adding context such as "educational", "artistic", or "historical" can help when the visual description itself is legitimate.

## Failure Modes

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Text rendering | Small or complex text, low quality, poor placement cues | Quote or ALL-CAPS text, specify typography, use `quality: "medium"` or `"high"`, spell tricky words letter-by-letter |
| Composition drift | Vague spatial language | Use explicit placement: "logo top-right", "subject centered with negative space on left", grid-like panel descriptions |
| Anatomy and hands | Complex poses and interactions | Describe body framing, specify hand positions, use reference images, avoid complex hand interactions when possible |
| Count accuracy | Diffusion models struggle with exact counts | "exactly three red apples, no more, no less", separate them spatially, describe each individually |
| Repeated elements | Model falls into local patterns | Add variety cues: "varied", "organic", "randomly scattered", "irregular pattern" |

## Quality and Latency Tradeoffs

| Quality | Typical latency | Use |
|---------|-----------------|-----|
| `low` | 5-15 seconds | Drafts, thumbnails, quick iteration |
| `medium` | 15-30 seconds | Balanced quality and speed |
| `high` | 30-120+ seconds | Final assets, dense text, diagrams |

Start with `quality: "low"` to validate composition, then switch to `"high"` for finals. Complex prompts can take up to two minutes.

## Rate Limits

ChatGPT subscription limits as observed:

- **Free**: ~2-3 images per 24-hour window.
- **Plus**: ~40-50 images per rolling 3-hour window.
- **Pro**: effectively unlimited, still subject to guardrails.

Because limits are tight on lower tiers, generate deliberately rather than speculatively. Use `dryRun: true` to inspect the constructed request before spending a generation. Draft at `quality: "low"`, then render the winner at `"high"`.

## Before/After Prompt Pairs

### Product Photography on a Surface

**Weak:**

```text
A shampoo bottle on a table.
```

**Strong:**

```text
Create a photorealistic product shot of a shampoo bottle on a white marble surface.
Soft studio lighting from the upper left, gentle shadows.
The bottle is centered with a slight angle to show the label.
Background: clean minimal gradient from white to light gray.
Style: professional e-commerce photography, high-end cosmetic brand aesthetic.
No watermarks, no extra text, no logos other than the product label.
```

**Why it works:** It names the surface, lighting direction, composition, background treatment, style reference, and explicit exclusions.

### Transparent Background Assets

**Weak:**

```text
A cute orange cat sticker on a transparent background.
```

**Strong:**

```json
{
  "prompt": "A cute orange cat sticker, simple design, bold outlines, vibrant colors, crisp silhouette, no halos or fringing.",
  "background": "transparent",
  "outputFormat": "png"
}
```

**Why it works:** `background: "transparent"` triggers green-screen rendering and local chromakey to alpha; `outputFormat: "png"` is required because the keyer produces PNG only.

### UI / App Mockups

**Weak:**

```text
An app for a farmers market.
```

**Strong:**

```text
Create a realistic mobile app UI mockup for a local farmers market.
Show today's market with a simple header, a short list of vendors with small photos and categories,
a small "Today's specials" section, and basic information for location and hours.
Design it to be practical and easy to use.
White background, subtle natural accent colors, clear typography, minimal decoration.
It should look like a real, well-designed, beautiful app for a small local market.
Place the UI mockup in an iPhone frame.
```

**Why it works:** It avoids concept-art language and instead lists layout elements, hierarchy, design constraints, and presentation.

### Technical Diagrams

**Weak:**

```text
A diagram of cellular respiration.
```

**Strong:**

```json
{
  "prompt": "Create a simple biology diagram titled 'Cellular Respiration at a Glance' for high school students.
Show how glucose turns into energy inside a cell. Include glycolysis, the Krebs cycle, and the electron transport chain.
Use arrows to connect the steps and label the main molecules: glucose, pyruvate, ATP, NADH, FADH2, CO2, O2, and H2O.
Make it look like a clean classroom handout or slide, with a white background, simple icons, clear labels, and easy-to-read text.
Avoid tiny text, extra decoration, or anything that makes the diagram hard to understand.",
  "quality": "high"
}
```

**Why it works:** It names the audience, required components, visual format, and negative constraints, and uses `quality: "high"` for dense labels.

### Hero Banner with Negative Space

**Weak:**

```text
A landscape with space for text.
```

**Strong:**

```text
Create a wide landscape banner image for a tech company website hero section.
Scene: misty mountain range at sunrise, soft golden light, atmospheric depth.
Composition: mountains in lower third, upper two-thirds open sky with subtle gradient.
Leave generous negative space in the upper left quadrant for headline text overlay.
Style: cinematic photography, professional stock photo quality, inspiring and calm mood.
No text, no logos, no watermarks in the image itself.
```

**Why it works:** It specifies the exact use case, scene, composition thirds, negative-space location, and constraints.

### Character Consistency Across Images

**First generation:**

```text
Create a photorealistic portrait of a young woman with curly red hair, green eyes, and a friendly smile.
She's wearing a blue denim jacket. Soft natural lighting, outdoor setting.
```

**Follow-up edit with reference:**

```json
{
  "images": ["portrait.png"],
  "prompt": "Generate a new photo of the SAME woman from the reference image.
She is now in a coffee shop, wearing a black turtleneck, holding a mug.
Preserve her exact facial features, hair color and style, eye color, and overall appearance.
Maintain photorealistic style and natural lighting."
}
```

**Why it works:** It uses the same reference image, the phrase "SAME woman", and an explicit preservation list. `gpt-image-2` processes reference images at high fidelity by default.

### Flat Vector Illustration

**Weak:**

```text
A vector illustration of a cat.
```

**Strong:**

```text
Create a flat vector illustration of a cat sitting upright.
Style: minimalist, clean lines, geometric shapes, limited color palette (teal, coral, cream).
No gradients, no shadows, no textures.
Simple background: solid cream color.
The cat should have a friendly, approachable expression.
Suitable for use as a website icon or app asset.
```

**Why it works:** It defines the style in negative and positive terms, limits the palette, and states the intended use.

---

*Image Prompting v1.0 - GoopSpec Reference*
