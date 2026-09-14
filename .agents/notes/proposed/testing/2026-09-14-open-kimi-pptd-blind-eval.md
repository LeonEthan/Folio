# Blind eval of Geon vs open-kimi-ppt-skill (baseline)

Status: proposed
Translation: current

[中文](2026-09-14-open-kimi-pptd-blind-eval.zh.md)

## Abstract

An Agent with no memory of this conversation scores Geon's current tree against a pinned `open-kimi-ppt-skill` checkout on three layers: A product clone, B skill text, C format DSL. The main eval must not open `agentic-listing-design`, must not open this eval or the retirement notes, and must not search the web. The instrument is the [blind prompt](../../../eval/open-kimi-pptd-blind-prompt.md). Two independent baseline runs agree: A `否`, B `借鉴`, C `借鉴`. The baseline is for later retirement work. It is not a legal opinion and does not approve Spec or runtime changes.

## Contract

- Comparison repo: `/Users/macmini/dev/open-kimi-ppt-skill`, on-disk snapshot should stay `c32890fe`.
- Repo under review: `/Users/macmini/dev/Geon` current worktree.
- Main eval fills A/B/C only. Lineage through ALD is not a pass gate and must not be hunted by opening ALD.
- Verdicts are only `否` / `借鉴` / `复制`. `借鉴`/`复制` without paths from both sides is void.
- Run the same prompt at least twice independently; record disagreement instead of picking the convenient run.
- A run that times out or barely reads skill/format files is void.
- After retirement (not the baseline expectation): A/B/C should all be `否`. The baseline may score B/C as `借鉴` or `复制`.

## How to run

Deliver the full prompt in a process with no memory of this chat (independent subagent, cwd that does not inject these notes; or `cli -p` reading the prompt file). Do not treat the retirement proposal or this note as required reading.

```sh
git -C /Users/macmini/dev/open-kimi-ppt-skill rev-parse HEAD
```

## Baseline environment

- Geon branch: `codex/independent-release` @ `48fbd0e3764a72a27378aa78b678c0c8676c0e48` (untracked eval/retirement notes exist; the prompt forbids opening them)
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

A: Geon is a single-canvas desktop design bench (Bento + PNG/JPEG); it does not ship the Kimi-hosted editor, PPTX export, ~30 presets, or dual PPTD+PPTX delivery.

B: The main `SKILL.md` workflows differ, but the eight-row relationship table and several distinctive phrases in `general-poster.md` are a compressed rewrite of B's poster guide.

C: Agent-facing v2 uses the same PPTD YAML layout and field names (`elementId`/`elementType`/`cropShape`/`seriesDefaults`, HTML rich text, MiSans/18), without shipping B's full `pptd.md`, and with a single page and no animation/remote/PPTX.

### Run 2 (`01a09f64-5ad4-7f93-91fe-f5101db3a424`, ~301s)

Same three-layer verdicts. Extra contrast: A's `SKILL.md` is already a single-canvas router (`finalize.mjs` / `render-preview.mjs`), not B's step0–step5 + Python export chain. C still calls the v2 authoring syntax the same PPTD DSL, including 13 chart types, while noting v3 is a product layer B does not have.

## Limits

Two independent runs of the same model, not two product models. No `cli -p` run. Agent answers are not a legal opinion. `source-manifest.json` was opened; the verdicts did not introduce a third repository.
