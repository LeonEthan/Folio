---
name: graphic-design
description: "Create or reconstruct editable posters, infographics, social graphics, banners, covers, flyers, and other static single-canvas designs as a self-contained graphic-PPTD project for Folio's Bento-derived editor and renderer."
metadata:
  short-description: Create editable static single-canvas graphic designs
---

# Graphic Design

Create one static graphic canvas as editable source. The source is a self-contained
graphic-PPTD project that Folio imports into its Bento-derived editor and renderer; it
is not a slide deck and the source image must never be used as a flattened substitute
for the design.

Write the project in the session workspace root: the manifest as `design.pptd.tmp`
(promoted to `design.pptd` when clean), pages under `pages/`, local assets under
`media/`. After your turn, Folio collects exactly `design.pptd`, `pages/`, and
`media/` from the workspace root, validates them, and imports the result as the
editable document — you do not write `design.json` yourself.

## Route the task

Read only the references needed for the current work:

- For a new design or an overall composition pass, read
  [references/general-poster.md](references/general-poster.md). This is the default
  design knowledge for this skill.
- When reconstructing a supplied reference image, also read
  [references/replication.md](references/replication.md).
- Before choosing element semantics or promising editability, read
  [references/graphic-canvas-profile.md](references/graphic-canvas-profile.md).
- When writing the project files, read
  [references/pptd-authoring.md](references/pptd-authoring.md). Write from that
  membership and its example. Fields it does not declare are unsupported; do not
  source them from any upstream PPTD catalogue.

Do not load references for modes or element families that the task does not use.

## Produce the design

The executable sequence is **inspect → draft → self-check → review → report**. Script
paths below are relative to this skill's own directory.

1. Establish the communication goal, supplied facts and assets, intended output
   scenario, and exact canvas size or aspect ratio.
2. Choose a composition that makes the canvas read as one visual field. Preserve
   factual content and prioritize a clear focus and reading order.
3. Inspect once. For a reconstruction, run
   `node scripts/reference-pack.mjs pack <reference> <work>/inspect` and read the
   artifacts it writes (`meta.json`, `grid.png`, `bands.png`, `palette.png`).
   Extract each genuinely raster region with
   `node scripts/reference-pack.mjs crop <reference> <x,y,w,h> <project>/media/<name>.png`.
   The pack is the whole measurement: never script pixel-level probing of the
   reference, and re-inspect only to correct a written element.
4. Draft the project: write the `.page` first, then the manifest as
   `design.pptd.tmp`, with local assets under `media/`. Represent content with
   semantic elements only when the Active Profile supports the required render and
   edit behavior; raster assets are for photographs, textures, and other genuinely
   raster content.
5. Self-check: run `node scripts/finalize.mjs <project>/design.pptd.tmp`, fix every
   diagnostic it prints against the membership in
   [pptd-authoring.md](references/pptd-authoring.md), and rerun until it promotes the
   draft to `design.pptd`. finalize runs the same validator Folio's intake runs after
   your turn; it is a convenience, not a gate — what matters is that the final project
   is named `design.pptd` and validates clean.
6. Review: if the `folio_render_preview` MCP tool is available in this session, use it
   to render the project and open the resulting PNG with the image-reading tool;
   inspect the full composition at overview and detail scales. Any page or asset edit
   invalidates that review: rerender and reopen the image. If the tool is not
   connected, run `node scripts/render-preview.mjs <project>/design.pptd` — it runs
   the same intake validation locally — and report that Agent Visual Review is
   incomplete. Never substitute another renderer.
7. Report any requested effect that could not be represented at the required fidelity
   or edit level. Never hide a dropped field, placeholder, flattening, or other
   degradation.

## Invariants

- **Exactly one canvas**: the manifest references exactly one page. Multiple
  deliverables are separate single-canvas projects, never pages in a presentation.
- **Editable source first**: never paste the reference or a near-complete render as
  the background to simulate editability.
- **Active means end-to-end**: validator acceptance alone is not a support claim. An
  element or property is usable only at the edit level declared by the Active Profile.
- **Fail closed**: do not invent fields, element types, enum values, fonts, or asset
  schemes. Unsupported or unverified semantics must be rejected or reported.
- **Local assets only**: image sources are relative paths under `media/`; do not use
  remote URLs or remote fonts.
- **Actual canvas size**: an explicit positive finite integer size wins. Presets are
  conveniences, not a whitelist; real resource failures must remain explicit.
- **Advisory review**: Agent Visual Review may drive corrections but never establishes
  visual acceptance; final quality judgment remains human.

## Outside this skill

- Presentation narrative, multiple slides, masters, speaker notes, transitions,
  animations, and PPT/PPTX import, export, or round-trip.
- Business-vertical dimensions, copy rules, and compliance policies.
- Image generation. When the `folio_generate_image` MCP tool is available (or the
  imagegen skill is materialized for this session), use it for requested generated
  assets and place the resulting files under `media/`. If neither is available, say so
  and continue with the assets you have.
