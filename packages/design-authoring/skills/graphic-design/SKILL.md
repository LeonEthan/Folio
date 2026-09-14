---
name: graphic-design
description: "Create or reconstruct editable posters, infographics, social graphics, banners, covers, flyers, and other static single-canvas designs as a YAML artwork project for Geon's Bento-derived editor and renderer."
metadata:
  short-description: Create editable static single-canvas graphic designs
---

# Graphic Design

Create one static graphic canvas as editable source. The source is a YAML artwork
project that Geon imports into its Bento-derived editor and renderer. It is not a
slide deck. A reference image or a flattened render must never stand in for the
editable design.

Write the project in the design authoring directory supplied with the turn:

```text
design.yaml          # manifest (fixed entry name)
pages/canvas.yaml    # the one canvas
media/               # local raster and font assets
```

This directory may differ from Agent cwd in a local project; ordinary chat
workspaces retain their root. Geon collects exactly these draft files, validates
them, and imports the result as the editable document. The separate
`design-current/` path is application input, never a submitted draft; it may be
absent until synchronized. You do not write `design.json` yourself. Leftover
`.pptd` files are not an authoring entry.

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
  [references/artwork-format.md](references/artwork-format.md). Write Bento
  `id` / `kind` fields. Do not invent syntax from a presentation catalogue.

Do not load references for modes or element families that the task does not use.

## Authoring and optional helpers

Choose your own analysis, drafting, and review methods, order, and iteration count
for the user's task. Establish the communication goal, supplied facts and assets,
output scenario, and canvas geometry as needed. Use semantic elements at their
supported edit level; keep genuinely raster content in local assets.

Script paths below are relative to this skill's directory. These are optional
helpers, not prerequisites for creation, rendering, submission, or turn completion:

- `node scripts/reference-pack.mjs pack <reference> <work>/inspect` provides
  dimensions, grid, bands, and palette artifacts. Its `crop` command extracts a
  raster region into `media/`. See
  [replication.md](references/replication.md) for this script's format limits;
  use available image tools or other analysis methods as appropriate.
- `node scripts/finalize.mjs <project>/design.yaml[.tmp]` checks structure and can
  promote a clean `.tmp` manifest. You may write `design.yaml` directly. Geon
  independently validates structure, assets, and versions at intake; it does not
  require evidence that you ran this helper or completed a creative checklist.
- `node scripts/render-preview.mjs <project>/design.yaml` checks intake locally.
  This script does not render an image or perform visual review.

When using `geon_render_preview`, open the returned PNG with an actual
image-reading tool, inspect what was rendered, and continue modifying the project
as useful. Render and view updated images when you need to judge changes. A prior
image shows the prior file state; structural validation does not judge composition.
If `geon_render_preview` is absent, only that tool is unavailable; assess other
image-reading and rendering capabilities actually available to your Agent. Report
what you could and could not inspect without claiming a review you did not perform.
Agent review is advisory and its method and extent are your decision. Human
judgment establishes visual quality, not a result card or application score.

Report consequential fidelity or editability limitations, dropped effects, and
assumptions honestly.

## Invariants

- **Exactly one canvas**: the manifest references exactly one page,
  `pages/canvas.yaml`. Multiple deliverables are separate single-canvas projects,
  never pages in a presentation.
- **Editable source first**: never paste the reference or a near-complete render as
  the background to simulate editability.
- **Active means end-to-end**: validator acceptance alone is not a support claim. An
  element or property is usable only at the edit level declared by the Active Profile.
- **Fail closed**: do not invent fields, element kinds, enum values, fonts, or asset
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
- Image generation and editing. The imagegen skill describes `geon_generate_image`
  and `geon_edit_image` when available. Place image assets under `media/`. A materialized
  skill does not itself establish tool availability; use the actual tool list.
