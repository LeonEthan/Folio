# Return to the current artwork after a new commit

Status: implemented
Translation: pending

## Abstract

A successful Agent commit refreshed the retained canonical editor while leaving the workbench on an unsubmitted source preview. The canvas now returns to the current artwork only after a new durable successful receipt and a successful guarded reload. Initial history hydration, failed outcomes, reload failures and newer explicit view choices do not cause that transition. This preserves the existing save, readonly and preview ownership boundaries; full human interaction acceptance remains separate from automated native evidence.

## Decision

Issue [#24](https://github.com/LeonEthan/Folio/issues/24) reuses the existing Session shell and P1 Focus canvas. The [Spec](../../../../specs/graphic-design-platform.zh.md) requires successful final collection to show the new canonical artwork directly. The [source preview](../feature/2026-09-11-automatic-pptd-preview.md) and [serial editing](../architecture/2026-09-11-canvas-serial-execution.zh.md) contracts remain authoritative. No preview bytes are committed by this UI transition, and no file event completes a turn.

The receipt identity includes both turn and saved revision. The first synchronized history snapshot establishes the baseline; historical success on reopen is not a fresh success. New successful receipts request the existing version-aware canonical synchronization. The Electron service remains responsible for detecting exceptional unsaved content before replacing stale views. Failed synchronization keeps the selected source and reports its error. An explicit source choice while synchronization is pending prevents that old async result from changing the view.

The existing sidebar, tabs, search, pins, rename, home input, Auto/custom size controls, native property panel, Focus canvas and native editor retention are reused. This change adds no presentation component or new visual state, so it does not introduce a separate Storybook imitation of the workbench. Real-component tests exercise the source transition, and native verification exercises the production shell.

## Evidence and limits

- Six deterministic React tests render the real `DesignCanvas`: historical hydration, delayed successful sync, unsaved reload failure, explicit view choice during sync, failed/new same-revision receipts, and an interrupted session synchronization.
- The built OSS Electron application passed a fresh native round with Claude Code 2.1.258 / ACP 0.70.0 and a synthetic external provider. The round used isolated Electron/Lody data directories and a unique CLI endpoint, and exited 0 including harness shutdown. It exercised home submission, native shape/image creation, selected-image mention submission, native Read/image-tool/Write, source preview while final completion was held, unchanged canonical bytes before finalization, disabled source export, automatic return after the new receipt, save/reopen, Focus at 850×750 and 1450×900, property hiding/showing, source/current toggles retaining the same native editor and snapshot, light/dark native controls, and PNG/JPEG export. Both exports are 800×600. A subsequent synthetic image-service failure preserved the canonical drawing, and an outdated element reference was rejected after manual crop.
- The first exploratory run stopped on an ambiguous Current artwork selector; the second selected a retained hidden preview instead of the visible canonical native view after reopen. The final probe scopes the first selector to the canvas and selects the visible native view explicitly. Neither probe correction changed the application or weakened readonly assertions.
- Production build, `pnpm format`, `pnpm check`, and `pnpm run docs check` passed. The initial full check inherited local Anthropic backend selectors and failed two existing credential-probe tests; the successful rerun removed only `ANTHROPIC_*` and `CLAUDE_CODE_USE_*` from the check subprocess environment. No global configuration was changed. Existing documentation size/translation and build chunk warnings remain.
- Human-operated acceptance, real Chinese IME input and subjective visual quality cannot be inferred from synthetic provider responses or screenshots. No paid model quality claim is made.

## Acceptance still requiring human evidence

The native round is automated interaction evidence, not the Issue's requested human-operated acceptance. A human still needs to run the complete journey and assess wide/narrow usability. Real Chinese IME composition, attachment paste/drop, modal focus, streaming scroll/tool-collapse behavior and sidebar search/pin/rename/tab navigation were not manually verified in this round. Those paths are unchanged and existing repository checks pass; unchanged code and automated checks do not mark the human acceptance box complete. No new UI state or component required a new Storybook presentation.
