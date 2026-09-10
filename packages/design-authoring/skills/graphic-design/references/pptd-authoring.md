# Graphic-PPTD Authoring Guide

This is a compact workflow guide. Read
[graphic-canvas-profile.md](graphic-canvas-profile.md) first. Write from the
membership below; Folio's intake validator enforces it after your turn.

If a field or combination is not in this membership, leave it out. No upstream PPTD
catalogue is bundled with this skill; such catalogues describe future Candidate work,
not an authoring permission.

## Static-v1 semantic facts

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

Scan every element before treating the project as done:

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

The manifest must reference exactly one `.page`. Write the `.page` first, then the
manifest. Keep all dependencies inside the project. Image and vector asset paths are
relative, remain under `media/`, and must not resolve to remote URLs or escape the
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

In session, the done check is executable: run
`node ../scripts/finalize.mjs <project>/design.pptd.tmp` and fix every diagnostic
until it promotes the draft to `design.pptd`. It invokes the same validator Folio
runs at intake after your turn, so a clean finalize means the write-time membership
above held. It does not prove the composition: when the `folio_render_preview` MCP
tool is connected, render through it and open the PNG before reporting completion.
Save/reopen, editing, and official export still run after the session.

Any silent drop, placeholder, reset after reopen, or mismatch between preview and export
is a failed capability, even if the source parsed. Remove the unsupported semantics,
choose a declared editable decomposition, or report the limitation.
