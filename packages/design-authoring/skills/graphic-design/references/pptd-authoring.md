# Graphic-PPTD Authoring Guide

This is a compact format guide. Read
[graphic-canvas-profile.md](graphic-canvas-profile.md) first. Write from the
version-specific guidance below; Folio's intake validator enforces it after your turn.

Do not invent fields or combine syntax from different versions. No upstream PPTD
catalogue is bundled with this skill; such catalogues describe future Candidate work,
not an authoring permission.

## PPTD versions

The bundled minimal example uses PPTD v2. Existing editable documents can be
projected as lossless PPTD v3: a `version: v3` manifest with `size`, one `pages`
entry, optional `title` and `customFonts`; a page with `background`, `elements`,
and optional `diagnostics`. v3 elements use `elementId` and `elementType` and
otherwise preserve the Bento v4 fields, including structured `text`, `table`,
and `chart`, literal styles, and flat `groupId`. Preserve existing fields and
array order when editing a v3 projection; its asset `src` paths remain under
`media/`. Do not apply v2 HTML text or theme syntax to v3 structured fields.
Unknown fields and versions fail explicitly. This guide does not enumerate
every v3 field; use the existing projected document and structural diagnostics.

## Static-v1 semantic facts (v2)

The machine source for derivable defaults and modeled vocabularies is the platform's
contracts package (`static-v1`); validators, importers, editor commands, UI, and
projection consume that interface. Do not copy an upstream renderer's defaults into an
artifact. When text fields are omitted, static-v1 derives `fontSize: 18`,
`fontFamily: "MiSans"`, `color: "#000000"`, and `lineHeight: 1`; the importer leaves
those fields omitted in BentoDoc so there is no second persisted truth.

The modeled shape preset names are `rect`, `roundRect`, `ellipse`, `oval`, `triangle`,
and `arrow`; a custom shape is admitted only with its required `viewBox` and `path`.
Stars, bursts, and badges use `custom` with `viewBox` and `path`, or `ellipse` /
`roundRect`. For `custom`, `viewBox: [w, h]` carries the path's coordinate space and
`path` is the SVG path data string alone (the `d` attribute; commands
`M/L/H/V/C/S/Q/A/Z`, starting with `M`) — there is no width/height prefix inside the
string. Image `cropShape`, when used, is an object `{ shapeName: ... }` whose
`shapeName` is `rect`, `roundRect`, `ellipse`, `oval`, `triangle`, or `custom`
(`custom` includes `viewBox` and `path`). Omit `cropShape` for a rectangular photo.
Icon styles resolve to the canonical `fas`, `far`, or `fab`
forms against the pinned offline shelf; aliases are normalized before persistence, and
a missing style or name is an error rather than a placeholder permission.

## Write-time membership

The v2 format includes these structural constraints:

- `fontFamily` is omitted (static-v1 derives MiSans) or is exactly `MiSans`.
- Every `shapeName` is one of `rect`, `roundRect`, `ellipse`, `oval`, `triangle`,
  `arrow`, `custom`. `custom` includes `viewBox` and `path`.
- Every `bounds` is `[x, y, w, h]` with `x ≥ 0`, `y ≥ 0`, `w > 0`, `h > 0`,
  `x + w ≤ canvas width`, `y + h ≤ canvas height`. A block flush with the bottom
  edge uses `y = canvasH - h`.
- Image elements use top-level `src` under `media/`. Shape elements use top-level
  `shapeName`. Text weight uses `bold: true`. If `cropShape` is present it is
  `{ shapeName: roundRect }` (or another crop vocab name), never a bare string.

## Project shape

Deliver one self-contained project at the session workspace root:

```text
design.pptd       # manifest (fixed entry name)
pages/<name>.page # the one canvas
media/*           # optional local raster/vector assets
```

The manifest must reference exactly one `.page`. Keep all dependencies inside the
project. Image and vector asset paths are relative, remain under `media/`, and must not resolve to remote URLs or escape the
project.

## Minimal structural example

Read [../examples/minimal/](../examples/minimal/) (`poster.pptd`,
`pages/poster.page`, `media/`). It demonstrates packaging, geometry, and
membership together: a solid background, a `rect` band, a text element with
omitted `fontFamily`, an image with `fit` + `cropShape: { shapeName: roundRect }`,
and a `custom` five-point star with `viewBox` + bare-`d` `path`. Copy its field
shape; it is not a capability whitelist. A repository test runs the canonical
validator against these files, so the example cannot silently drift from the
schema. (The example's manifest is named `poster.pptd` for illustration; your
deliverable's manifest must be `design.pptd`.)

Two geometry habits the editor rewards:

- Give text bounds headroom instead of fitting the box exactly to the glyphs;
  the editor re-measures and grows text boxes on edit, and a tight box shifts
  layout under the user's first touch. Estimate width at `fontSize × 0.6` per
  latin character (bold uppercase runs wider) and height at
  `fontSize × lineHeight × lines × 1.25`, then round up. Export measures real
  glyphs in the renderer DOM and blocks overflow — a tight box does not ship.
- Do not place `wrap: false` text near canvas edges: it renders unclipped and
  overflows the canvas.

## Authoring invariants

- Use explicit finite canvas geometry and explicit element bounds in canvas coordinates.
- Keep every element ID unique and stable. Preserve array order when it carries z-order.
- Use locally resolvable assets under `media/` and the write-time font membership.
- Keep text as text and flat graphics as supported editable primitives. Rasterize only
  content that is genuinely raster or when the Active Profile explicitly declares and
  accepts the resulting edit limitation.
- Use compound elements only at their declared edit level. Do not call a decomposition a
  native table, chart, icon, rich-text block, or mask.
- Do not write fields merely because the validator type, Bento internals, or some
  upstream PPTD document mentions them. Active support requires the full lifecycle.
- Do not depend on presentation order, notes, animation, remote services, or PPTX
  semantics.

## Validation and handoff

`node scripts/finalize.mjs <project>/design.pptd[.tmp]` (from the skill directory)
is an optional structural self-check. It can promote a clean `.tmp`, but writing
`design.pptd` directly is supported. Neither this helper nor a review sequence is
a completion or commit requirement. Folio independently checks the collected
project and versions. When rendering through `folio_render_preview`, open the
PNG with an actual image-reading tool to judge composition and decide on edits.

Any silent drop, placeholder, reset after reopen, or mismatch between preview and export
is a failed capability, even if the source parsed. Remove the unsupported semantics,
choose a declared editable decomposition, or report the limitation.
