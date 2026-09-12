# Leave waits for a loading attach

Status: implemented
Translation: pending

## Abstract

`leaveDesign` read `window.folio.state()` on records whose attach was still
loading. A record exists from `records.set` onward while `window.folio` only
appears after the page commits, so a clean loading canvas reported `undefined`
state and raised a false "Canvas still has unsaved edits" dialog that blocked
close. The correction drains same-artwork loading attaches before reading any
record and re-checks until none remain. Load failure is handled by outcome,
not assumed away: a load rejected after `loadURL` failed has its record
destroyed, so the later per-record pass finds nothing; a load rejected later
(register/readonly) leaves a half-initialized record behind, and the same
per-record pass still protects it through the usual dialog. Selection and
re-check semantics live in testable `design-leave-drain-core.ts`.

## Problem and evidence

Diagnostic `93698` (exit 1, cleanup passed, no diagnosticErrors), evidence
`/tmp/folio-t29-export-leave-KdkskB/evidence`: `design.leave` started at
06:21:45.959Z, the old wc4 flush succeeded, then the check on the newly
attaching wc7 read `window.folio.state()` as `undefined` at 06:21:46.171Z and
showed the unsaved-edits dialog, while wc7's attach only finished at
06:21:46.694Z. Both instances ended dirty=false: a load race, not a dirty
draft and not a sidebar selector issue. The empty-canvas two-session control
diagnostic 55876 passed.

The misread window is `[records.set, preload-run]` inside one attach: tens of
milliseconds wide, so an external caller cannot target it reliably — renderer
IPC jitter alone is wider. The 06:21 run hit it because `leaveDesign` first
spent ~200ms flushing the old instance. No new paid calls, imports, or fixture
edits were used to establish this; the saved evidence above is retained
unchanged.

## Decision

`leaveDesign` now drains through `drainRelevantLoads` (new
`design-leave-drain-core.ts`, maps injected, no Electron import): with an
explicit `hostId` it awaits that host's loading promise; without one it awaits
loads whose host maps to the artwork plus loads with no host entry. The
no-host case is deliberate over-waiting: `hosts` records visibility intent,
not load ownership, so a hidden mid-load attach whose artwork is not yet
knowable cannot be filtered out — that only delays leave, never discards.
The drain loops until no relevant load remains, so an attach starting
mid-drain is covered too. Each awaited rejection is swallowed and falls
through to the existing per-record logic: a `loadURL`-failed load destroyed
its record (nothing to preserve), while a later-stage failure left a zombie
record that the same logic still protects via dialog. Init failure therefore
keeps the current protection, and `undefined` is never treated as
discardable. Selection, re-check, swallow, and host-scoping semantics are
covered by deterministic thenable tests
(`design-leave-drain-core.test.mjs`, 5 tests, no timers): a naive
single-pass, await-everything, or rethrowing implementation fails them.

`reloadDesignCanvas` shares the read-undefined-state shape but was left
untouched: the diagnosed symptom is leave-only, and the change stays minimal.
No Agent runtime, retry policy, or process lifecycle changes.

## Verification and limits

`leaveDesign` behavior on ready canvases is unchanged: a native regression
guard (`/tmp/folio-leave-race-repro.mjs`, dev-mode source build) opens fresh
sessions, calls `design.leave` on real attach cycles, and asserts leave true
with zero unsaved-edits dialogs — 3/3 rounds green. All three results record
`exercised:false`, so they prove only the routine ready-instance guard and do
not claim a second native hit on the initialization race. The
tens-of-milliseconds undefined window cannot be targeted deterministically
from outside this process, so old-code red versus new-code green on that exact
sub-window rests on the retained 06:21 evidence plus structural coverage: the
drain spans the whole load, which strictly contains the misread window. A load
that never settles would stall leave the way it already stalls attach; every
observed load settles. Full installed acceptance of the corrected build
remains pending with the release run.
