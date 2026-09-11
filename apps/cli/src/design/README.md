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
output directory can differ from Agent cwd. Hooks reuse `resolveDesignContext`; file watching should use the same resolver
instead of constructing paths.

Historical design readback uses the same context with the persisted Session's
project/worktree metadata when no runtime Session is loaded. Read-only source and
file-preview requests may read archived designs; deleted Sessions stay unavailable
and other Code Collab operations keep their archive gate. A historical project turn
with missing/invalid frozen input or a changed root fails explicitly; it never
substitutes today's draft. Work files may have changed since the original turn.

Old `candidates/<digest>.json` files retain complete documents and embedded assets.
The design worker returns a checksum/identity-verified original path, and ordinary
file preview supplies its bytes. No candidate approval, deletion, export-copy or
history catalogue is needed. New candidate production is retired; final conflicts preserve the existing draft and receipt diagnostics.

Agent previews continue through `render-preview.ts` and the shared desktop render
host, at the canvas's actual dimensions. The returned PNG path is available to
ordinary image-reading tools; rendering alone does not prove model image input.
Turn collection writes verdicts/receipts only, with no thumbnail generation,
reference amendment, or dedicated readback. Legacy optional outcome fields and
existing image files remain stored; the current read view ignores retired fields.

Pi design sessions use the registry ACP adapter `pi-acp@0.0.33` and explicitly
loaded native Pi extension. The verified runtime is Pi `0.85.1`; other versions
return an actionable design-hook error. The launcher resolves the existing
`PI_ACP_PI_COMMAND` (or PATH), preserves user configuration, and uses a temporary
executable shim because this adapter does not forward extension arguments. It
never installs Pi globally or selects a product default Agent/model.

`sync-service.ts` owns projection publication and `sync-baseline.ts` owns delivery
facts. Successful native Read ranges covering the entry and every exported page bind
artwork, draft path, current revision and exact text content. Partial subsets, failed and unmatched results cannot establish that baseline;
exact offset continuations accumulate only within the same projection revision. Eligibility is
captured at the native assistant `message_start`, before tools execute, so a
same-message Read cannot authorize already-generated Write/Edit arguments.
Every saved canvas, including the initial blank canvas, requires this read;
absence of an old PPTD or elements does not bypass it. Ordinary files are outside
the path guard. Shell/custom/MCP mutations are not sandboxed by this extension.

Successful controlled writes bind the collected artifact digest to the attempt.
Natural completion independently validates the artifact and assets and performs
canonical compare-and-swap using the live daemon baseline. Missing facts after
restart or changed bytes fail closed and preserve the draft. Re-reading never
rebases an established attempt or rewrites a frozen manifest.

`folio_resubmit_draft` is an optional explicit operation for retaining an existing
draft, including unchanged bytes after a conflict. It binds the complete read
baseline and exact draft digest captured before its assistant generation, then
checks both against current state. It never commits or finishes a turn. The new
attempt invalidates earlier generated writes, duplicate resubmissions and delayed
write results; subsequent generations may edit through the ordinary path.
Same-byte writes and rereading alone still leave inherited output `no_artifact`.

The operation uses the shared service and existing tool-hook RPC. Pi's thin native
registration is necessary because pinned `pi-acp@0.0.33` stores but never forwards
its MCP servers. Future adapters can expose the same operation through their real
hook/MCP facilities only after verifying generation fencing; there is no new MCP
transport or runtime framework here.

A final CAS conflict is recorded as `invalid` with durable reason, retained draft
path and explicit-continuation instructions in the existing receipt/history.
The Agent has already ended at that point: no automatic restart, paid retry,
semantic merge or mandatory finalize tool is introduced. The next user continuation
can read that receipt, current projection and unchanged draft. Ordinary changes and
regeneration use the same intake/assets/atomic-save pipeline. P1 manual save-copy
and read-only historical candidate JSON remain available.

Codex hook integration remains blocked at the pinned CLI `0.153.4` / ACP `1.10.0`:
native pre/post tool events do not supply the required awaited model-generation
fence. Interactive `write_stdin` has no separate prehook, and Bash posthook text
alone does not establish successful execution. See the
[native audit and reproducible probe](../../../../.agents/notes/proposed/architecture/2026-09-11-codex-design-hook-boundary.md).
This does not enable Codex shared-baseline or explicit-resubmission acceptance.

## Read-only source snapshots

The desktop's source preview resolves the current trusted Session source through
`design/source-path` without a turn ID, including a not-yet-created entry; supplied turn IDs retain the historical
frozen-manifest checks. The design worker calls `buildPreviewPayload(workdir, {})`
for two bounded, reference-only collections followed by the existing intake.
Names and exact content, including same-path image changes, identify the snapshot.
This observes a stable input, not a completed author transaction; valid intermediate
drafts may render. No preview operation writes canonical, baselines or turn state.

Actual open preview consumers share an Electron-owned native watch and serialized
observation. The existing watcher runs in explicit tracked-only mode, with no
workspace discovery. Validated dependencies include missing files; new targets are
watched and re-observed before publication. Matching exact bytes skip conversion.
Closing the last consumer releases watching and cached payloads; reopening, reconnect,
manual refresh and observed turn finalization reconcile independently. Invalid drafts
retain the last valid surface; watcher errors retain manual refresh. Formal turn
collection and exports remain independent.

Element-reference prompt markers are validated during `turn-input.ts` materialization
and frozen-input recovery against the actual artwork revision and stable IDs.
A stale marker blocks dispatch without changing its identity or selecting a replacement.
The original prompt and ordinary attachments remain the frozen input.

Explicit desktop import is separate from observation: Electron retains the displayed
payload and submits it to the unchanged `designOperation` save after canvas flush.
The store repeats structural/assets validation and atomic version checks, including
same-content lost-reply idempotence. Import does not write authoring files or claim
Agent read evidence.
