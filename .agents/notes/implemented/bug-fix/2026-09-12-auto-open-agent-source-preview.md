# Show intermediate Agent edits in the open canvas

Status: implemented
Translation: pending

## Abstract

An open Current artwork canvas stayed on the canonical editor throughout Agent
execution, so valid intermediate PPTD changes were invisible until the final
commit reloaded the artwork. When a design Agent turn starts with Current artwork
selected, the component now enters the existing readonly authoring preview and
receives its normal watched snapshots. A later explicit source choice is respected;
previewing still does not commit, unlock, or alter canonical artwork.

## Cause and decision

`DesignCanvas` initialized its local preview choice to false. Both the initial
`refreshPreview` call and the `design.preview` event subscription were conditional
on that choice, while live Agent status only disabled version mutations. The
Electron source-preview service and watcher already rendered valid intermediate
snapshots correctly, but the default Current artwork call site never became their
consumer.

The component now detects the transition into a live Agent run for the current
Session. It switches to the existing preview only when the user is viewing Current
artwork; an already selected source preview or history version is preserved. The
transition is consumed once per observed live interval, so choosing Current artwork
afterward is not undone while that status stays active. Successful final receipts
continue through the existing guarded canonical sync before returning to Current
artwork.

No watcher, conversion, Agent lifecycle, Bento state, storage, or commit protocol
was added. Invalid or incomplete source states retain the preview service's existing
last-valid-snapshot behavior.

## Regression evidence and limits

The focused component regression mounts the real `DesignCanvas` on Current artwork,
starts a live Agent turn, supplies a valid initial source snapshot, then publishes
a second `design.preview` snapshot. It requires the canonical canvas to hide, both
intermediate source identities to become visible through the preview, and an
explicit switch back to Current artwork to remain selected.

With the final test and the production transition removed, the focused suite failed
at `previewVisible === false` while its other four source-preview cases passed. With
the correction restored, all five cases passed. This deterministic component proof
does not replace a normal installed run with an actual Agent writing PPTD files;
that acceptance remains separate.

Root verification passed the five source-preview and six receipt regressions,
followed by `pnpm check`, `pnpm format` and `git diff --check`.
Correction: the initial document command omitted `run` and opened a package website
instead of checking documents. Its zero exit was not validation. The correct
`pnpm run docs check` found two oversized AGENTS.md files. After shortening them without dropping their constraints, the actual check
passed with no errors; pending translations and size warnings remain visible.
The completed checks establish correctness only at their tested scope;
installed intermediate-file rendering remains to be verified separately.
