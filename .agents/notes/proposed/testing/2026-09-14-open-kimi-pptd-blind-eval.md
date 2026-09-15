# Blind eval of Molly Design vs open-kimi-ppt-skill (baseline)

Status: proposed
Translation: current

[中文](2026-09-14-open-kimi-pptd-blind-eval.zh.md)

## Abstract

An Agent with no memory of this conversation scores Molly Design's current tree against a pinned `open-kimi-ppt-skill` checkout on three layers: A product clone, B skill text, C format DSL. The main eval must not open `agentic-listing-design`, must not open this eval or the retirement notes, and must not search the web. The instrument is the [blind prompt](../../../eval/open-kimi-pptd-blind-prompt.md). Two independent baseline runs agreed A `否`, B `借鉴`, C `借鉴`. After YAML retirement and a leftover-phrasing rewrite, two further independent runs agree A `否`, B `否`, C `借鉴`. That historical pair did not meet the C pass line. After the approved single-file redesign, two independent Grok 4.6 CLI runs score A/B/C all `否`, meeting the agreed score line within the sampling limits recorded below. This is not a legal opinion and does not approve Spec or runtime changes.

## Contract

- Comparison repo: `/Users/macmini/dev/open-kimi-ppt-skill`, on-disk snapshot should stay `c32890fe`.
- Repo under review: `/Users/macmini/dev/Geon` current worktree.
- Main eval fills A/B/C only. Lineage through ALD is not a pass gate and must not be hunted by opening ALD.
- Verdicts are only `否` / `借鉴` / `复制`. `借鉴`/`复制` without paths from both sides is void.
- Run the same prompt at least twice independently; record disagreement instead of picking the convenient run.
- A run that times out or barely reads skill/format files is void.
- After retirement (not the baseline expectation): A/B/C should all be `否`. The baseline may score B/C as `借鉴` or `复制`. A rename-only tree still on v2 would not pass.

## How to run

Deliver the full prompt in a process with no memory of this chat (independent subagent, cwd that does not inject these notes; or `cli -p` reading the prompt file). Do not treat the retirement proposal or this note as required reading.

```sh
git -C /Users/macmini/dev/open-kimi-ppt-skill rev-parse HEAD
```

## Baseline environment

- Molly Design branch: `codex/independent-release` @ `48fbd0e3764a72a27378aa78b678c0c8676c0e48` (untracked eval/retirement notes exist; the prompt forbids opening them)
- open-kimi-ppt-skill: `c32890fe0985bdf668f2722fed30f1010bdf24c9`
- Two runs: independent general-purpose subagents, cwd `/Users/macmini/dev`, no memory of this chat
- Instrument: full text of the [blind prompt](../../../eval/open-kimi-pptd-blind-prompt.md)

## Baseline results

Both runs agree. Both are valid (each opened both skills, poster guides, `pptd.md`/`pptd-authoring.md`, examples, and the validator).

| Layer | Run 1 | Run 2 | Baseline |
| --- | --- | --- | --- |
| A product clone | 否 | 否 | **否** |
| B skill text | 借鉴 | 借鉴 | **借鉴** |
| C format DSL | 借鉴 | 借鉴 | **借鉴** |

The post-retirement pass line is still A/B/C all `否`. Baseline: A already passes; B and C do not. Neither run used `复制`. Neither treated YAML, generic poster advice, or Bento itself as copying.

### Run 1 (`01a09f64-5ad3-7042-87a5-53f1afcf7255`, ~228s)

A: Molly Design is a single-canvas desktop design bench (Bento + PNG/JPEG); it does not ship the Kimi-hosted editor, PPTX export, ~30 presets, or dual PPTD+PPTX delivery.

B: The main `SKILL.md` workflows differ, but the eight-row relationship table and several distinctive phrases in `general-poster.md` are a compressed rewrite of B's poster guide.

C: Agent-facing v2 uses the same PPTD YAML layout and field names (`elementId`/`elementType`/`cropShape`/`seriesDefaults`, HTML rich text, MiSans/18), without shipping B's full `pptd.md`, and with a single page and no animation/remote/PPTX.

### Run 2 (`01a09f64-5ad4-7f93-91fe-f5101db3a424`, ~301s)

Same three-layer verdicts. Extra contrast: A's `SKILL.md` is already a single-canvas router (`finalize.mjs` / `render-preview.mjs`), not B's step0–step5 + Python export chain. C still calls the v2 authoring syntax the same PPTD DSL, including 13 chart types, while noting v3 is a product layer B does not have.

## Post-retirement eval ([#42](https://github.com/LeonEthan/molly-design/issues/42))

Instrument unchanged. Comparison repo still `c32890fe0985bdf668f2722fed30f1010bdf24c9`. Two independent general-purpose subagents, cwd `/Users/macmini/dev`, no chat memory, no ALD, no retirement/eval notes as required reading.

### First pair (tree at `f4d78bc`, before leftover phrasing rewrite)

Both runs were valid (skills, poster/replication guides, format files, examples, and intake/validator sources opened). They do not agree on C. B still scored `借鉴` on compressed authenticity/ratio sentences in `general-poster.md`, not on the retired relationship table.

| Layer | Run 1 `01a0a066-f0b8-7642-8246-5eac699204e0` (~356s) | Run 2 `01a0a066-f0b8-7642-8246-5ebe68db5dfb` (~345s) |
| --- | --- | --- |
| A product clone | 否 | 否 |
| B skill text | 借鉴 | 借鉴 |
| C format DSL | 借鉴 | 否 |

B evidence (both): near-verbatim “self-owned, licensed, officially citable…” / forge-logos sentence and crop/text-safe wording versus open-kimi `reference/general-poster.md`. C disagreement: Run 1 treated `pages/`+`media/`, seven kinds, and `bounds`/`shapeName` as the same PPTD-family DSL; Run 2 treated Agent-facing `design.yaml` + Bento `id`/`kind` plus leftover PPTD rejection as a different format.

Those leftover skill sentences and imagegen `design.pptd` / “use the result in PPTD” teaching were rewritten on the same branch. Packaged-skill tests now forbid the cited phrases. This is not an instrument edit.

### Second pair (same `f4d78bc` tree plus the leftover rewrite in this change)

Both runs valid. They agree.

| Layer | Run 1 `01a0a072-f792-7dc0-9662-20a2af303d9c` (~327s) | Run 2 `01a0a072-f793-7a93-849d-fc10117d36ef` (~357s) | Adopted |
| --- | --- | --- | --- |
| A product clone | 否 | 否 | **否** |
| B skill text | 否 | 否 | **否** |
| C format DSL | 借鉴 | 借鉴 | **借鉴** |

A and B now meet the pass line. C does not. Both C cells have both-repo paths, so they are not void. The Agent-facing entry is `design.yaml` / Bento `id`/`kind` and leftover `.pptd` is rejected; the `借鉴` is the remaining YAML projection layout (`pages/`+`media/`), seven `kind` values, `bounds`/`shapeName`, and runtime leftover-PPTD recognition (including `src/pptd-v3.ts`, `richtext.ts`, and e2e `.pptd` fixtures). Those field names and the `pages/canvas.yaml` path are the approved Bento projection, not a second live PPTD authoring format. Changing them to force a `否` would be a Spec change, not an eval-instrument tweak.

[#42](https://github.com/LeonEthan/molly-design/issues/42) stays open. Parent [#36](https://github.com/LeonEthan/molly-design/issues/36) stays open.

## Limits

Two independent runs of the same model per pair, not two product models. No `cli -p` run. Agent answers are not a legal opinion. `source-manifest.json` was opened; the verdicts did not introduce a third repository. The second pair read the leftover rewrite before it was committed; this change is that rewrite plus the score record.

## Single-file follow-up: Grok (2026-09-15)

The user requested an independent Grok recognition test after the approved single-file implementation. Two fresh local Grok CLI 1.0.30 (`04b7ffed98c6`) sessions used `grok-4.6`, cwd `/Users/macmini/dev`, the unchanged frozen prompt, plan permissions, disabled web and subagents, and an added read-only restriction excluding all Molly Design notes and prior evaluation artifacts. No earlier scores or conversation were supplied. Repo B remained `c32890fe0985bdf668f2722fed30f1010bdf24c9`; Repo A was the current uncommitted single-file worktree on `06aa8ba031e5ccff40c9fabe60c5432d8e850f7d`.

| Layer | Grok run 1 | Grok run 2 |
| --- | --- | --- |
| A product clone | 否 | 否 |
| B skill text | 否 | 否 |
| C format DSL | 否 | 否 |

Both contrast Molly Design's single-canvas PNG/JPEG product with B's editor/PPTX pipeline; the short canvas guides with B's step0–5, `style.md` and preset workflow; and `design.yaml`, `geon-canvas/1`, native `id`/`kind` and structured text with B's multi-file PPTD, `elementId`/`elementType`, themes and HTML. Their evidence includes both skills, both poster guides, Molly Design's format guide/example/codec and B's `reference/pptd.md` and example project.

Tool-log audit found 29 and 33 read/list/search calls respectively, no tool access to excluded source or notes, no mutation/network calls, and unchanged captured authoring/skill source hashes. Both processes exited successfully. Both emitted introductory progress before the requested table, a formatting deviation. Coverage is sampled: B's 2,029-line format guide was read only through line 150, and its 241-line poster guide through line 120/80; native editor code and full element details were not inspected. Run 1's claimed format coverage “through animation” overstates the actual read range. Treat the unanimous scores as a bounded Grok follow-up meeting the score line, not exhaustive similarity clearance or replacement of historical scores. Cross-session memory absence was requested, not independently proven from the CLI's internal context assembly.

Raw local outputs, tool logs, prompt and source hashes are retained outside Git at `/tmp/geon-grok-blind-20260915/`. This is the first actual CLI/model follow-up recorded here; the earlier Limits section describes earlier subagent pairs. The Kimi golden visual acceptance remains pending human review. No runtime code, Spec approval, issue status or provenance was changed by this test.


Subsequent human acceptance (2026-09-15): the user accepted the current single-file Kimi golden result and authorized committing this change. This supersedes the pending visual status above; the Grok sampling limits remain unchanged.

## Closure review (2026-09-15)

A read-only GitHub review found #37–#41 closed and #42/#36 open. The two Grok scores meet #42's agreed score line with the sampling/context-verification limits above. The baseline note is updated and the first-stage golden result has human acceptance. #36's former two-file layout was superseded by the approved single-file revision; close-out should explicitly record that change rather than silently claiming literal conformity to its older body.

Local accepted commit is `ce5a9c1d636aa75ec9fbb8a900c7093ddb0b7129`. At review time the public `codex/independent-release` branch was still `9003c522b96fad9bd93c2cebaf9f3594c87debce`, an ancestor 18 commits behind local HEAD, and GitHub could not resolve the accepted commit. Recommendation: publish the accepted code and evidence through the agreed landing workflow, update the issue conclusions, then close #42 followed by #36. No GitHub issue mutation, push or history rewrite was performed in this review.

History rewriting solely to hide old borrowing is not recommended: #36 explicitly retains history, and GitHub documents changed commit IDs and surviving clones/forks/cached references after rewriting ([GitHub documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)). No specific secret or prohibited historical blob was identified by this scoped review; it was not a full historical secret/license audit. Current `design-authoring/source-manifest.json` still records adapted/ported files; `design-bento/README.md` distinguishes the ALD adapter closure (whose pinned source has no root license file) from MIT Bento. Closing these authoring issues must not imply a repository-wide provenance or licensing clearance. The user subsequently confirmed ALD is their own project and its adapter code is not a blocker for this task. The close-out scope is similarity to open-kimi-ppt-skill; ALD provenance remains recorded.


The user authorized committing/publishing the close-out and updating/closing #42 and #36. Keep Git history intact. The current Bento-aligned YAML is retained; deeper type-block restructuring is optional future usability work, not a remaining condition for these issues. Closure applies to the accepted implementation on `codex/independent-release`, not a claim of release or merge to `main`.
