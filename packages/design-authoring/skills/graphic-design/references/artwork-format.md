# YAML artwork format

This is a compact format guide. Read
[graphic-canvas-profile.md](graphic-canvas-profile.md) first. Write the YAML
artwork projection below; Geon's intake validator enforces it after your turn.

Do not invent fields. Do not write a presentation catalogue, HTML rich text,
theme `$ref`, or leftover `.pptd` syntax.

## Project shape

Deliver one self-contained project at the session workspace root:

```text
design.yaml          # manifest (fixed entry name)
pages/canvas.yaml    # the one canvas (fixed page path)
media/*              # optional local raster and font assets
```

The manifest must reference exactly `pages/canvas.yaml`. Keep all dependencies
inside the project. Image and font asset paths are relative, remain under
`media/`, and must not resolve to remote URLs or escape the project.

## Manifest

`design.yaml` admits `title`, `size`, `pages`, and optional `customFonts`.
`size` is a positive integer pair `[width, height]`. `pages` is exactly
`[pages/canvas.yaml]`. Do not write a `version` field.

Omit `fontFamily` to use Inter, the bundled licensed default family name. Other
families need a `customFonts` registration whose `src` is a local `media/` font
file.

## Canvas

`pages/canvas.yaml` admits `background`, `elements`, and optional `diagnostics`.
Each element uses Bento `id` and `kind`. IDs must be unique and stable. Array
order is z-order; an omitted `zIndex` is filled from the array index, and an
explicit `zIndex` is kept.

Admitted `kind` values are `text`, `shape`, `line`, `image`, `icon`, `table`,
and `chart`. Common fields include `bounds`, optional `rotation`, `flip`,
`groupId`, `opacity`, and `shadow`. `bounds` is `[x, y, w, h]` with `x ≥ 0`,
`y ≥ 0`, `w > 0`, `h > 0`, `x + w ≤ canvas width`, and `y + h ≤ canvas height`.
A block flush with the bottom edge uses `y = canvasH - h`.

Kind-specific fields (not a complete whitelist):

- `text`: structured `text.paragraphs[].runs[]`. Do not write HTML `content`.
- `shape`: `shapeName` (`rect`, `roundRect`, `ellipse`, `oval`, `triangle`,
  `arrow`, or `custom` with `viewBox` and `path`), plus `fill` / `border`.
- `line`: `viewBox`, `points`, optional `curve` / `arrow`, plus `border`.
- `image`: `src` under `media/`, `fit` (`cover`, `contain`, or `fill`), optional
  `crop` and `cropShape`.
- `icon`: `iconName` as `style:name` against the pinned offline shelf.
- `table` / `chart`: structured `table` / `chart` objects with literal styles.

Groups are the existing flat `groupId`, not nested nodes. Preserve existing
fields and array order when editing a projected document.

## Minimal structural example

Read [../examples/minimal/](../examples/minimal/) (`design.yaml`,
`pages/canvas.yaml`, `media/`). It demonstrates packaging, geometry, and
membership together: a solid background, a `rect` band, structured text, and an
image with `fit: cover`. Copy its field shape; it is not a capability whitelist.
A repository test runs intake against these files, so the example cannot
silently drift from the schema.

Two geometry habits the editor rewards:

- Give text bounds headroom instead of fitting the box exactly to the glyphs;
  the editor re-measures and grows text boxes on edit, and a tight box shifts
  layout under the user's first touch.
- Do not place `wrap: false` text near canvas edges: it renders unclipped and
  overflows the canvas.

## Authoring invariants

- Use explicit finite canvas geometry and explicit element bounds in canvas
  coordinates.
- Keep every element `id` unique and stable. Preserve array order when it
  carries z-order.
- Use locally resolvable assets under `media/` and Inter (or a registered
  custom family) for type.
- Keep text as text and flat graphics as supported editable primitives.
  Rasterize only content that is genuinely raster or when the Active Profile
  explicitly declares and accepts the resulting edit limitation.
- Use compound elements only at their declared edit level. Do not call a
  decomposition a native table, chart, icon, rich-text block, or mask.
- Do not write fields merely because a TypeScript type, Bento internals, or an
  external catalogue mentions them. Active support requires the full lifecycle.
- Do not depend on presentation order, notes, animation, remote services, or
  PPTX semantics.

## Validation and handoff

`node scripts/finalize.mjs <project>/design.yaml[.tmp]` (from the skill
directory) is an optional structural self-check. It can promote a clean `.tmp`,
but writing `design.yaml` directly is supported. Neither this helper nor a
review sequence is a completion or commit requirement. Geon independently
checks the collected project and versions. When rendering through
`geon_render_preview`, open the PNG with an actual image-reading tool to judge
composition and decide on edits. If `geon_render_preview` is absent, only that
tool is unavailable.

Any silent drop, placeholder, reset after reopen, or mismatch between preview
and export is a failed capability, even if the source parsed. Remove the
unsupported semantics, choose a declared editable decomposition, or report the
limitation.
