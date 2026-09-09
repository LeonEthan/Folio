# Pinned Bento resources

P0 loads a synthetic single-canvas design through Folio's Electron File menu.
The CLI owns the current JSON at `<Folio data root>/chats/folio-p0/design.json`;
Electron owns a sandboxed, network-blocked Bento view and PNG/JPEG rendering.
This fixed sample is not a new Session or a general document import API. Editing,
Agent generation, and session-side-panel integration belong to P1/P2.

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
