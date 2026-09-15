# Kimi Code golden replication acceptance

Status: runner implemented; K3 High baseline and single-file technical/editability
checks passed; current single-file golden visually accepted by the user on 2026-09-15.

This is a required real-model acceptance case for the
[single-canvas authoring redesign](../.agents/notes/implemented/architecture/2026-09-15-single-canvas-authoring-redesign.zh.md).
The user selected the reference, prompt, Agent and high visual-fidelity pass
criterion on 2026-09-15. It supplements editable roundtrip and lifecycle tests.
It is a separate live-model acceptance lane; the result record, not this definition, establishes execution.

## Frozen input

| Item                | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Case                | `geon-kimi-magsafe-replication`                                              |
| Reference           | User-supplied `reference.jpg`, 285 × 2000 pixels                             |
| SHA-256             | `3f155040ce8152cd3e5808d000cbedb482307c1c1c1f4df68b6f50ae82baaa89`           |
| Initial user prompt | `复刻这个设计`                                                               |
| Agent               | Real Kimi Code CLI through Geon's normal Kimi integration; K3, Thinking High |
| Expected source     | The built Geon revision containing the authoring change under acceptance     |
| Pass authority      | Human visual acceptance plus existing technical/editability checks           |

The local source supplied for this case is
`/Users/macmini/dev/agentic-listing-design/cases/replication/magsafe-carmount/reference.jpg`.
Only the image is an input; its parent repository, neighbouring solutions,
authoring files, skills and acceptance records are not inputs. Copy the image
into the owned acceptance workspace and verify the hash before dispatch. Keep
the image and captured run evidence outside tracked fixtures, under the ignored
acceptance artifact lane. The case does not depend on the author's absolute path
at runtime: a supplied local copy must match the frozen hash.

Use the exact prompt without appended layout instructions, coordinates, extracted
copy, expected YAML or repair hints. Normal bundled Geon system instructions,
current format skills and configured tools remain available and are recorded.
The image is reference content, not an instruction source. Start each round with
a fresh session/workspace and no completed design seeded into the canvas.

## Real end-to-end path

Reuse [ElectronHarness](src/support/electron-harness.ts) and the
[installed target selection](README.md#installed-geon-acceptance):

1. Verify the built/installed Geon source identity. Launch with owned isolated
   Electron and CLI data, workspace and endpoint. Record Kimi CLI version,
   adapter/artifact version and checksum, actual model identity, bundled skills
   and enabled tools. Never silently select a different Agent or model.
2. Through the normal product reference-attachment and conversation path, submit
   the frozen image and exact prompt to Kimi Code CLI. Establish actual image
   delivery/reading separately from successful attachment upload. Use the real
   configured model connection; scripted ACP and fixture responses cannot pass.
3. Let Kimi author the design using the current public DSL and normal tools.
   Capture previews when available. Observe natural completion, normal artifact
   collection, schema/kernel/assets/version validation and the commit receipt.
   Do not prewrite the answer or fix Kimi's output in the test driver.
4. Open the committed artwork in Bento. Export PNG and JPEG through the product,
   then reopen the saved artwork and export again. Verify dimensions, assets and
   document preservation. Compare actual exports, not screenshots of the window.
5. Preserve the unedited replication export for visual judgment. In an owned copy
   or after recording that revision, edit a visible heading, move a text element
   and adjust an image crop; save/reopen and verify those changes. Retain stable
   IDs and original replication evidence.
6. Produce the full-length comparison and aligned detail panels described below.
   Hand the exports and editable artwork to the human reviewer. Capture the
   verdict separately from automatic checks; an Agent cannot sign it.
7. Tear down only owned processes and endpoints. Preserve failures and evidence;
   a surviving owned process or failed teardown does not count as a clean run.

The real-model connection is explicitly requested for this acceptance case.
Keep it separate from the no-live-network deterministic regression suite; do not
add it to ordinary `@P0`/`@P1` runs or Daily retries. Image generation/editing may
use an already authorized connection and the user's configured model. Apply the
task's shared image-call budget; no unapproved model default or automatic paid
retry is introduced. A missing connection/model is recorded as blocked, not
replaced with a synthetic successful run.

## Visual pass criterion

**The rendered replication must have high visual consistency with the frozen
reference, as confirmed by the human reviewer.** A valid DSL, committed artwork,
successful export, or the Agent saying it replicated the image is insufficient.

Compare the full image at matching aspect ratio and the following regions at
readable scale:

| Region                      | What must closely match                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Hero                        | Product and phone placement, vent background, orange product label and cyan `2-in-1` badge         |
| Magnet explanation          | Two-column geometry, demonstration/exploded-view composition, cyan/orange accents and caption band |
| One-hand operation          | Photo extent, phone/mount placement, heading and transition into the next section                  |
| Mounting scenarios          | Section headings and the three-image arrangement for vent/flat-surface mounting                    |
| Adhesive mounting           | Explanatory text, large product photo and adhesive inset                                           |
| Hook and vent compatibility | Hook explanation, `Fit 99% Air Vent` layout and the three compatibility tiles                      |
| Usage and parts             | Instruction block, four-part grid, separators and cyan labels                                      |

Review overall aspect ratio, region heights, margins, spacing, line breaks,
typographic hierarchy, colours, product silhouette/orientation and image crops.
Missing or reordered regions, wrong products, grossly different proportions,
substituted copy or unreadable/clipped text prevent a pass. Minor differences
caused by the low-resolution source, JPEG compression or font rasterization are
judged in context by the human reviewer.

Use the original 285 × 2000 canvas where practical. If the Agent chooses a
uniformly scaled canvas within product limits, record its dimensions and compare
an aspect-preserving normalized view. Do not stretch, crop away differences,
locally warp or independently align sections to improve the score. Detail panels
use corresponding fixed source regions.

SSIM, pixel differences, OCR and automated image assessments may support review;
none has a calibrated pass threshold for this case. Do not invent one or replace
the user's visual criterion with an automatic score. Record `pending` until a
human judges the actual output.

## Editable replication, not reference-image display

Existing editable-design requirements still apply. Standalone headings,
explanatory copy, labels and suitable simple graphic elements must remain
independently editable. Product photography, reflections and complex raster
details may use crops/extractions from the supplied reference or other authorized
image operations. Text inherently inside a photograph is distinct from the
layout's standalone text.

A single full-reference image, or a tiled set of reference panels that bakes all
layout text into pixels, cannot satisfy this DSL acceptance case even if its
pixel similarity is perfect. The heading/move/crop checks above establish actual
editing rather than merely counting elements or accepting hidden text overlays.
This does not require rebuilding photographic products as vector primitives.

## Rounds, evidence and completion

Create independent immutable rounds under
`e2e/artifacts/acceptance/geon-kimi-magsafe-replication/<round-id>/` using the
existing [artifact conventions](ARTIFACTS.md). Retain:

- Input hash/dimensions, exact prompt and source/build/runtime/model identities.
- Attachment/image-read observations, owned execution outcome and commit receipt.
- Final source, canonical artwork and required asset bytes, with hashes.
- Actual PNG/JPEG exports before and after reopen, and editable-check evidence.
- Full reference/output comparison, fixed-region closeups and optional differences.
- Separate technical verdict, human visual verdict, human editing verdict and
  concrete defects, including the reviewer and reviewed output hashes.
- All failed/interrupted attempts, any follow-up prompts and any model/image calls;
  captured conversations, logs and credentials are never committed to the repo.

Initially compare the current DSL baseline and the single-file revision using
the same frozen input and recorded Kimi/model/tool settings. Baseline success
cannot pass the later revision; if the baseline already fails, retain that fact.
If type-block restructuring is evaluated, it must pass its own round as well.
Record configuration changes rather than attributing their effects to the DSL.

Kimi's autonomous corrections within the original task are part of the run.
Human repair hints change the test: preserve the original failed/pending round,
record the assisted attempt separately, and use a new clean fixed-prompt round
for the golden verdict. Never hide earlier failures by selecting only the best
output. A successful round proves that round, not a general model success rate.

Overall pass requires completed technical/editability checks and explicit human
confirmation of high visual consistency. The generic `run-acceptance.mjs` subjects
do not run this case.

## Run the golden case

Build the intended revision once, then invoke from the repository root:

```sh
corepack pnpm e2e:build
node e2e/scripts/run-kimi-replication.mjs \
  --reference /absolute/path/to/reference.jpg \
  --round single-file-01 --phase single-file
```

Use `--phase baseline` for a separately built baseline. Each round name must be
fresh. The default turn deadline is 45 minutes; `--timeout-ms` makes a different
budget explicit. The runner verifies the reference hash before dispatch, uses the
normal built-in Kimi provider with the managed CLI, and relies on the user's
existing Kimi authentication. It records the actual model/settings UI and runtime
manifest; it never substitutes a deterministic provider or adds a repair prompt.
The isolated profile starts without configured image-service connections.
The 2026-09-15 user clarification fixes the exact `K3` model (not `K3-256k`) and
`Thinking High`. The runner selects both through normal UI and checks the selected
values before dispatch; it fails if either is unavailable. The earlier K2.8
Preview / Thinking Max exploratory baseline was interrupted when this requirement
arrived and is retained as non-qualifying evidence. Both qualifying rounds use K3 High.

The runner observes real turn settlement and the durable commit receipt, exports
PNG/JPEG, closes/reopens the editor and compares export hashes. It then preserves
the golden as a Git version, exercises native text/move/crop controls with autosave
and reopen checks, and restores the unedited golden. `comparison.html` contains
full-resolution pairs and fixed corresponding regions. `report.json` separates
technical, editing and pending human visual judgments. Owned processes stop before
an isolated `review-profile` is retained. Failures stay in their original round;
no automatic paid or model rerun occurs.

## 2026-09-15 execution

`baseline-k3-high-01` and `single-file-k3-high-01` both completed through the real
managed Kimi CLI with K3 / Thinking High. Both have committed receipts, successful
PNG/JPEG exports, identical export hashes after reopen, and successful native
heading/move/crop edits with save/reopen/YAML roundtrip checks. Each unedited golden
was restored after the edit checks; owned processes were stopped before retaining
the review profiles. Both rounds used an explicit 90-minute ceiling.

The baseline is 285×2000; the single-file result is 570×4000 and is uniformly
displayed at the reference size for comparison. The new PNG SHA-256 is
`d2b8b6ce7e159baf089f43ba25cbfd07b1b25861909935b6161f151bfa0b7914`.
Evidence is under the ignored `e2e/artifacts/acceptance/geon-kimi-magsafe-replication/`
round directories, with a three-way `geon-single-canvas-20260915/review.html`.

The single-file build also fixes the isolated canvas's missing bundled Inter and
clarifies generic text-field placement in the format guide. The baseline Agent
independently registered Arial. These differences are recorded; this is not a
controlled causal measurement of syntax alone. Agent advisory inspection still
finds body line-height/alignment, wrapping and crop differences. At execution end both rounds awaited human review. On 2026-09-15 the user
accepted the current single-file golden result and authorized closing this change.
The single-file golden now passes technical, editing and human visual acceptance;
this does not separately approve the baseline image or remove the noted differences. The interrupted K2.8 Preview exploration is retained
outside these qualifying rounds and is excluded from their verdicts.
