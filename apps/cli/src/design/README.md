# Design files in a Session workspace

`workspace.ts` is the shared resolved context for preparation, rendering, image
assets and collection. It takes the existing Session host cwd plus session/artwork
IDs; Agent cwd remains Lody's resolved cwd. New project drafts live at
`<cwd>/.folio/artworks/<artworkId>/<sessionId>/`. Ordinary chat workspaces retain
`<dataRoot>/chats/<sessionId>/`. No Git operation is needed.

Only the draft directory's `design.pptd`, `pages/` and `media/` are collectible
Agent output. `design-current/` reserves the fixed application projection path, separate from
the draft. It is not populated by dispatch; synchronization belongs to the
subsequent read-hook slice. Preparation never seeds or overwrites a draft.

The existing chat `design-input/<turnId>/` remains the immutable manifest,
reference-byte and receipt location. New manifests record `artifactWorkdir` and
artwork identity as dispatch facts. Every consumer compares them to paths derived
from the trusted live Session; manifest paths never authorize filesystem access.
Legacy manifests without the field retain their known chat-root interpretation.
Existing chat drafts are explicitly linked in the prompt and never relocated.

Switching the UI between sessions does not affect resolution. Reopening with the
same cwd recovers the same paths. Redirecting an old turn to another cwd is
rejected while preserving its files and manifest; automatic cross-directory
recovery is not provided. New turns can use the new workspace. Canonical canvas
storage and association recovery remain owned by `store.ts` and the existing
Electron design service.

MCP generation writes to this same draft's media directory. Image edits resolve
relative paths there and may read explicitly named attachments from the trusted
Session cwd. Render replies include the absolute preview path because their
output directory can differ from Agent cwd. Hooks and file watching are separate
work; they should reuse `resolveDesignContext` instead of constructing paths.
