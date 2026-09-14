# Electron service contracts

`CLAUDE.md` links here; edit `AGENTS.md` only.

## Design canvas

Views accept validated CLI design-worker documents without Node, preload,
permissions or external network.
Bind saves to Session/host; CLI owns bytes, Electron renders and shows dialogs.
Retain hidden editors; explicit close saves before disposal.
Source previews never register for save/flush; preserve
canonical instances and reject late results after consumer/source changes.
Source previews share exact dependency watches and serialized conversion only
while consumers exist; release both with the last consumer. Re-observe new
dependencies after installing watches. Watch `design.yaml`, `pages/canvas.yaml`
and needed `media/`; leftover `.pptd` is not a watch or import source. Reject
old source/view generations; previews never commit or update Agent baselines.

Explicit import retains the clicked document/assets snapshot, flushes under the
artwork mutation gate, rechecks execution before save, and uses canonical CAS.
Preserve retry baselines and distinguish committed saves from reload failures.
`design-canvas-access` gates actual human writes and flushes all artwork instances
before dispatch. Execution state comes from the versioned daemon canvas-host
snapshot; unknown is readonly. Keep ownership independent of view lifetime, and
reject reload of dirty/composing/saving instances. Bento receives generic readonly
and flush only. A canonical attach completes only after Bento publishes its generic
state/snapshot/flush/readonly API and reports the real ready state; a navigation or
DOM load event alone is not canvas readiness. Before changing these boundaries, read
[design resources](../../../../../packages/design-bento/README.md).
The preview host uses the same local socket, independently of canvas preparation.
Keep render policy in Node-testable `design-render-host-core.ts`: no retries, repair,
per-turn thumbnails or thumbnail IPC. Previews/PNG/JPEG use canvas dimensions.
Historical files resolve by artwork/digest in the worker; local resources serve
original bytes and embedded assets.

Git history views reuse the isolated readonly renderer and have no file watcher or
import action. Save-version and restore flush through the artwork mutation gate;
restore preserves unversioned content in Git before canonical CAS. Report successful
disk writes separately from failed canvas reloads.

Element references originate only from visible canonical selections while idle.
Capture IDs before flush and pair them with its saved revision; never rebase stored
composer references. Validate artwork, revision and IDs again before dispatch.

Image context actions check image kinds in that saved canonical document, then
insert only a target mention and editable prompt into the ordinary composer.
They never mutate the artwork or dispatch a separate image job.

Application quit flushes editors before sealing design-worker requests; cancelled
flush leaves the service usable. Even with no open editor, drain accepted requests,
end worker input and await child exit before quitting. A closed worker never restarts.
