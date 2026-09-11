# Electron service contracts

`CLAUDE.md` links here; edit `AGENTS.md` only.

## Design canvas

Views accept validated CLI design-worker documents without Node, preload,
permissions or external network.
Bind saves to Session/host; CLI owns bytes, Electron renders and shows dialogs.
Retain hidden editors; explicit close saves before disposal.
Source previews never register for save/flush; preserve
canonical instances and reject late results after consumer/source changes.
`design-canvas-access` gates actual human writes and flushes all artwork instances
before dispatch. Execution state comes from the versioned daemon canvas-host
snapshot; unknown is readonly. Keep ownership independent of view lifetime, and
reject reload of dirty/composing/saving instances. Bento receives generic readonly
and flush only. Before changing these boundaries, read
[design resources](../../../../../packages/design-bento/README.md).
The preview host uses the same local socket, independently of canvas preparation.
Keep render policy in Node-testable `design-render-host-core.ts`: no retries, repair,
per-turn thumbnails or thumbnail IPC. Previews/PNG/JPEG use canvas dimensions.
Historical files resolve by artwork/digest in the worker; local resources serve
original bytes and embedded assets.
