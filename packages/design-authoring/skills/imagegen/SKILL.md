---
name: imagegen
description: "Use when the user asks to generate images through Folio's image connection (for example: generate image, product shots, concept art, covers, or batch variants); calls the folio_generate_image MCP tool, which is registered only when an image connection is configured and enabled in Folio settings."
metadata:
  short-description: Generate images via Folio's image connection
---

# Image Generation Skill

Generates images for the current design work (product shots, concept art, covers,
website heroes, illustrations, infographic art). Calls the `folio_generate_image`
MCP tool, which talks to the user's configured OpenAI-Images-compatible connection
(default model `gpt-image-2`).

## Availability

`folio_generate_image` is registered only when the user has configured and enabled an
image connection (base URL, API key, model) in Folio settings. If the tool is not in
your tool list, that tool is unavailable for this session. Folio settings can enable
its connection; assess other capabilities from the actual tools available to your
Agent, without inferring that all image generation or image reading is unavailable.
Never ask the user to paste an API key in chat; keys live in the app's settings storage.

## When to use

- Generate a new image (concept art, product shot, cover, website hero)
- Batch runs (many prompts, or many variants across prompts)

## Using generated assets

Choose your own prompting, inspection, and iteration approach for the task. Useful
inputs include exact text, subject, composition, intended use, and constraints.
`folio_generate_image` writes returned bytes to the workspace asset area and
returns their path. For graphic-design, place the asset under the project's
`media/` and reference it there. Open outputs with an actual image-reading tool to
judge the result and decide whether further changes are useful. Report material
limits and the resulting asset path.

Prompt templates and taxonomy below are optional aids. They do not prescribe a
creative sequence, number of reviews, or automatic paid retries. The current tool
accepts a text prompt for generation; it does not accept source images for editing.
Edit and multi-image examples in the references are prompting knowledge, not a
claim that this connection exposes those operations.

## Prompt augmentation

A structured, production-oriented spec can help clarify a prompt. Only make implicit
details explicit; do not invent new requirements.

## Optional use-case taxonomy

These buckets organize the examples; use them when helpful.

Generate:

- photorealistic-natural — candid/editorial lifestyle scenes with real texture and natural lighting.
- product-mockup — product/packaging shots, catalog imagery, merch concepts.
- ui-mockup — app/web interface mockups that look shippable.
- infographic-diagram — diagrams/infographics with structured layout and text.
- logo-brand — logo/mark exploration, vector-friendly.
- illustration-story — comics, children’s book art, narrative scenes.
- stylized-concept — style-driven concept art, 3D/stylized renders.
- historical-scene — period-accurate/world-knowledge scenes.

Quick clarification (augmentation vs invention):

- If the user says “a hero image for a landing page”, you may add _layout/composition
  constraints_ that are implied by that use (e.g., “generous negative space on the
  right for headline text”).
- Do not introduce new creative elements the user didn’t ask for (e.g., adding a
  mascot, changing the subject, inventing brand names/logos).

Template (include only relevant lines):

```
Use case: <taxonomy slug>
Asset type: <where the asset will be used>
Primary request: <user's main prompt>
Scene/background: <environment>
Subject: <main subject>
Style/medium: <photo/illustration/3D/etc>
Composition/framing: <wide/close/top-down; placement>
Lighting/mood: <lighting + mood>
Color palette: <palette notes>
Materials/textures: <surface details>
Text (verbatim): "<exact text>"
Constraints: <must keep/must avoid>
Avoid: <negative constraints>
```

Augmentation rules:

- Keep it short; add only details the user already implied or provided elsewhere.
- The taxonomy slugs help find matching examples in
  [references/sample-prompts.md](references/sample-prompts.md).
- For a broad request (e.g., "generate images for this website"), use judgment to
  propose tasteful, context-appropriate assets using the examples as inspiration.
- If any critical detail is missing and blocks success, ask a question; otherwise
  proceed.

## Examples

### Generation example (hero image)

```
Use case: stylized-concept
Asset type: landing page hero
Primary request: a minimal hero image of a ceramic coffee mug
Style/medium: clean product photography
Composition/framing: centered product, generous negative space on the right
Lighting/mood: soft studio lighting
Constraints: no logos, no text, no watermark
```

## Prompting best practices (short list)

- Structure prompt as scene -> subject -> details -> constraints.
- Include intended use (ad, UI mock, infographic) to set the mode and polish level.
- Use camera/composition language for photorealism.
- Quote exact text and specify typography + placement.
- For tricky words, spell them letter-by-letter and require verbatim rendering.
- Targeted follow-ups can help identify which change improved an image.
- If results feel “tacky”, add a brief “Avoid:” line (stock-photo vibe; cheesy lens
  flare; oversaturated neon; harsh bloom; oversharpening; clutter) and specify
  restraint (“editorial”, “premium”, “subtle”).

More principles: [references/prompting.md](references/prompting.md). Copy/paste specs:
[references/sample-prompts.md](references/sample-prompts.md).

## Guidance by asset type

Asset-type templates (website assets, game assets, wireframes, logo) are consolidated
in [references/sample-prompts.md](references/sample-prompts.md).
