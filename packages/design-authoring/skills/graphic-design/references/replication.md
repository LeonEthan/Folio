# Reconstructing a Design from a Reference Image

Read this reference only when the user supplies an image and asks for a reconstruction.
The goal is a high-fidelity editable reconstruction within the platform's Active Profile,
not an unconditional promise of pixel identity and never the source image pasted back as
a background.

Also use [general-poster.md](general-poster.md) for composition judgment and
[graphic-canvas-profile.md](graphic-canvas-profile.md) before choosing native element
semantics.

## Establish reference geometry

Read the reference's pixel dimensions first. Set canvas `size` to those pixels and use
the same aspect ratio unless the user requests a different output. Every element's
closed rectangle stays inside that canvas: a block flush with the bottom edge uses
`y = canvasH - h`. If the exact dimensions exceed a real platform resource limit,
rescale proportionally and report the change; do not substitute a habitual preset.

## Inspect in one pass

Run the pack once, from this skill's directory:

```sh
node ../scripts/reference-pack.mjs pack <reference-image> <work>/inspect
```

Then read the artifacts it writes: `meta.json` (pixel dimensions and palette hexes),
`grid.png` (overview with original-coordinate grid for bounds), `bands.png`
(enlarged vertical bands for dense text, icons, badges, and edges), and
`palette.png`. That pack is the section list, the color samples, and the coordinate
reference — one pass, already on disk.

Extract each distinct photograph or product shot into the project's `media/` with
the same tool:

```sh
node ../scripts/reference-pack.mjs crop <reference-image> <x,y,w,h> <project>/media/<name>.png
```

Its bounds are validated against the image and the output is re-encoded clean, so
crops are safe to embed and to re-inspect. After a crop is saved under `media/`,
author from its path. Write the `.page` immediately after the pack and crops exist.
Further crops or color samples happen only to correct a written element.

The tool is dependency-free Node: PNG references are fully supported, while JPEG and
other formats report dimensions in `meta.json` but must be converted to PNG before
grid/bands/palette/crop. If conversion is impossible, measure from the reference
directly and report the reduced precision.

Do not write pixel-probing scripts (row/column scans, point color sampling,
edge hunts) against the reference: the grid's original-coordinate labels, the
palette hexes, and your reading of `grid.png` / `bands.png` are the measurement.
If a value cannot be read from them, estimate it from the grid and correct it
against the written element later.

Unclear wording, unavailable fonts, hidden geometry, and ambiguous layers are
fidelity limits: preserve known content and report consequential assumptions.

## Reconstruct semantically

Map each visible object to a semantic element only when the Active Profile declares the
needed render behavior and edit level:

- rebuild legible text as text; use separate elements only where the active text model
  requires it;
- redraw flat blocks, rules, simple geometry, and relationships with supported editable
  primitives;
- extract photographs, product shots, textures, scenes, and other genuinely raster
  regions into tight local crops under `media/`;
- keep raster aspect ratios faithful and use supported crop or fit behavior;
- do not claim native icons, tables, charts, masks, rich text, or other compound semantics
  merely because some upstream PPTD catalogue documents them.

A crop may contain photographic content. Do not use a large crop containing rebuildable
text or flat graphics to simulate editability. If the required semantic element is not
Active, choose an explicitly supported editable decomposition or report the limitation.

## Fidelity targets

Match the observable reference as closely as the evidence and Active Profile permit:

- canvas ratio, margins, element bounds, alignment, and z-order;
- sampled colors, repeated palette roles, and background treatment;
- type scale, weight, alignment, case, line breaks, and density;
- image selection, crop, subject scale, and relationship to text;
- borders, shadows, radii, paths, and other effects only where supported end to end.

Do not invent off-style decoration to fill uncertain regions. Keep a concise record of
material deviations that affect fidelity or editability.

## Verify in two loops

These loops run on a written project. If the `.page` is not on disk, return to writing
it.

First run `node ../scripts/finalize.mjs <project>/design.pptd.tmp` and fix every
diagnostic until the draft is promoted: font family, shape names, in-canvas bounds,
flat `src` / `shapeName` / `bold` fields, and `cropShape` object shape. Folio's
save/reopen and official export run after the session.

Then, when the `folio_render_preview` MCP tool is connected, render the project through
it, open the PNG with the image-reading tool, and inspect it at overview and detail
scales:

- no unintended stretching, blur, clipping, or crop drift;
- no text covering key subjects, logos, or facts;
- readable contrast, type size, line height, and information density;
- reference-consistent alignment, spacing, layering, and color;
- no unintended occlusion or unexplained missing objects;
- fidelity differences are understood and reported.

A passing validator does not prove visual fidelity, contrast, or editability. Any page
or asset correction invalidates the visual review: rerender and reopen the PNG. Stop
when the accepted target is met or the remaining gap is an explicit profile or
source-evidence limitation.
