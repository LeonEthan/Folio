---
name: imagegen
description: "Use when the user asks to generate or edit images through Folio's image connection (for example: generate image, product shots, concept art, covers, or batch variants); calls the folio_generate_image MCP tool, which is registered only when an image connection is configured and enabled in Folio settings."
metadata:
  short-description: Generate and edit images via Folio's image connection
---

# Image Generation Skill

Generates images for the current design work (product shots, concept art, covers,
website heroes, illustrations, infographic art). Calls the `folio_generate_image`
MCP tool, which talks to the user's configured OpenAI-Images-compatible connection
(default model `gpt-image-2`).

## Availability

`folio_generate_image` is registered only when the user has configured and enabled an
image connection (base URL, API key, model) in Folio settings. If the tool is not in
your tool list, the connection is absent or disabled: do not attempt raw HTTP or
substitute another path — tell the user image generation is not configured and that
they can enable it in settings, then continue with the assets you have. Never ask the
user to paste an API key in chat; keys live in the app's settings storage.

## When to use

- Generate a new image (concept art, product shot, cover, website hero)
- Batch runs (many prompts, or many variants across prompts)

## Workflow

1. Collect inputs up front: prompt(s), exact text (verbatim), constraints/avoid list.
2. Augment the prompt into a short labeled spec (structure + constraints) without
   inventing new creative requirements.
3. Call `folio_generate_image` with the augmented prompt. The tool writes the returned
   bytes verbatim to the workspace asset area and returns the path — never re-encode
   or convert API images yourself.
4. For a graphic-design project, place the final asset under the project's `media/`
   directory and reference it from there.
5. Inspect outputs (open/view images) and validate: subject, style, composition, text
   accuracy, and avoid items.
6. Iterate: make a single targeted prompt change, re-run, re-check.
7. Report the final prompt used together with the asset path.

## Prompt augmentation

Reformat user prompts into a structured, production-oriented spec. Only make implicit
details explicit; do not invent new requirements.

## Use-case taxonomy (exact slugs)

Classify each request into one of these buckets and keep the slug consistent across
prompts and references.

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
- Always classify the request into a taxonomy slug above and tailor
  constraints/composition to that bucket. Use the slug to find the matching example in
  [references/sample-prompts.md](references/sample-prompts.md).
- For a broad request (e.g., "generate images for this website"), use judgment to
  propose tasteful, context-appropriate assets and map each to a taxonomy slug.
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
- Iterate with single-change follow-ups.
- If results feel “tacky”, add a brief “Avoid:” line (stock-photo vibe; cheesy lens
  flare; oversaturated neon; harsh bloom; oversharpening; clutter) and specify
  restraint (“editorial”, “premium”, “subtle”).

More principles: [references/prompting.md](references/prompting.md). Copy/paste specs:
[references/sample-prompts.md](references/sample-prompts.md).

## Guidance by asset type

Asset-type templates (website assets, game assets, wireframes, logo) are consolidated
in [references/sample-prompts.md](references/sample-prompts.md).
