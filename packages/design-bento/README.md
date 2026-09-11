# Pinned Bento resources

P0 loads a synthetic single-canvas design through Folio's Electron File menu.
The CLI owns the current JSON at `<Folio data root>/chats/folio-p0/design.json`;
Electron owns a sandboxed, network-blocked Bento view and PNG/JPEG rendering.
This fixed sample is not a new Session or a general document import API. P1 adds editable Session canvases; Agent generation remains P2.

Run `corepack pnpm --dir packages/design-bento build`. Normal Electron development
and production builds invoke the same builder. Install the pinned Bento submodule
with `git submodule update --init packages/design-bento/bento` first. Node 22.14+
and npm are required; the upstream npm lockfile pins build dependencies.

`source-manifest.json` identifies the source commit, five ordered patches, and
copied files. `vendor/packages` contains only the contracts, kernel and editor
source closure required by those patches. The capability matrix is retained as
source evidence, not a claim that P0 validates every capability. Authoring/PPTD,
quality orchestration, revision persistence, Web/HTTP/SSE applications and Agent
Runtime Manager are not migrated. The source repository is
https://github.com/LeonEthan/agentic-listing-design at
`7fd3c0691876ec7428fe3f3ef1ef6c4c46cdef12`; the original source has no root license
file. Preserve its provenance rather than attributing that adapter code to Bento.

Bento is pinned to `813c71fff72491e6898f5e55a20da44a562be586` (MIT, see
`bento/LICENSE`). Its own `slides` and `kernel` sources are assembled with the
adapter closure. Font Awesome Free glyph attribution is in `FONTAWESOME-LICENSE`;
Space Mono's bundled fixture font is covered by `SPACE-MONO-LICENSE`.
The fixture image is synthetic RGBA data. All fonts, icons and images are offline.

The builder emits `apps/electron/resources/design/editor.html`, sample JSON,
licenses and `build.json` with source and output hashes. No sibling checkout or
absolute source path is needed. The renderer uses the locked Electron 39.5.1
Chromium and the same Bento stage projection for display and export. PNG captures
the isolated transparent stage at 800×600; JPEG composites white first. There is
no window-chrome screenshot or fallback renderer.

P0 does not accept arbitrary documents. Saved sample changes fail without replacing
existing bytes. Repeating an open after a lost child-process response reuses the
already persisted file. No notification or separate chat metadata write is needed
to reconstruct this sample. Future Session association must derive from its stable
workspace/relative path after durable save, without rolling back saved content.

## P1 manual designs

`apps/cli/src/design/store.ts` owns `<Folio data root>/chats/<sessionId>/design.json`.
The file atomically contains the canonical BentoDoc, referenced content-addressed
asset bytes, and Session association. Assets are embedded so a confirmed save has
no partially committed external asset table. The module is the single committer:
the Electron-owned CLI worker forwards UI requests over stdin, and the daemon calls
the same exported operations in-process after a turn (P2.3). Both paths verify
expected content hashes and semantic kernel commands, fsync replacement bytes, then
acknowledge. A lost reply can be retried; a different baseline is a conflict — the
daemon keeps the imported document as a candidate instead of overwriting. Two callers
still do not mean two writers: commits are coordinated by content only, so a caller
that loses the baseline race never sees its bytes land.

`design-pending/` contains only unfinished Session associations. UI repair authors
those through the existing workspace writer, then acknowledges them to the CLI.
Acknowledged Sessions are not reconstructed by scanning design files, so ordinary
Session deletion keeps its existing meaning. No conversation or undo log is copied
when conflict edits become an independent design.

Each native view retains its editor while its canvas tab is open, including hidden
panels and Session route switches. A committed turn (and an adopted candidate)
re-creates clean instances from the store so an open view cannot
keep showing, or later saving, a superseded document. Explicit close releases undo
history. Save failures
block leaving with retry/discard choices; an unexpected crash recovers the last
confirmed file. Export uses an isolated instance of the same saved Bento document,
with fixed resources, decoded images and loaded fonts before stage capture.

P1 bounds canvases to 4096 pixels per side and imports PNG/JPEG/GIF images up to
16 MiB and 16 megapixels. These are resource limits, not new output formats. The
semantic controls expose these limits. `src/product-session.ts` and `src/image.ts`
are local overlays of the pinned adapters; the builder applies them after copying
vendor sources. The source manifest records relative kernel imports and stricter
TypeScript adaptations. Original upstream identity and licenses remain unchanged.

## PPTD projection contract

`vendor/packages/contracts/src/pptd-v3.ts` is a Folio-authored source adaptation
of the pinned Bento v4 types for lossless authoring projection. It adds no editor
capability and leaves the upstream frozen v1 capability matrix intact. The
conversion and projection capability mapping belong to `@folio/design-authoring`;
see its [README](../design-authoring/README.md#editable-projection-pptd-v3).
The source manifest pins this additional file separately and records its origin.

## Serial canvas editing

The desktop controls generic `folio.setReadonly`, `folio.flush` and `folio.state`.
Bento does not observe Agent status: the bridge rejects semantic mutations while
readonly, and the product overlay commits buffered input before freezing, then
flushes accepted saves. An unfinished composition or save failure retains the draft.
Views start readonly until the desktop confirms execution state. The daemon's
existing visible-turn owner waits for all artwork instances and keeps them readonly
through provider completion and artifact processing; hiding a view changes no ownership.
Unexpected dirty content blocks reload rather than being discarded. The original
store CAS remains independent. See the [implementation note](../../.agents/notes/implemented/architecture/2026-09-11-canvas-serial-execution.zh.md), including the headless limitation.
