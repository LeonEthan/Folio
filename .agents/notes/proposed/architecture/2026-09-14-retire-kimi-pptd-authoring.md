# Retire Kimi PPTD authoring while keeping the Bento loop

Status: proposed
Translation: current

[中文](2026-09-14-retire-kimi-pptd-authoring.zh.md)

## Abstract

BentoDoc stays the editable truth. The Agent authoring surface stops being PPTD: retire v2, drop v3's `elementId`/`elementType` aliases, and write a YAML projection of Bento fields (`design.yaml` + `pages/canvas.yaml` + `media/`). Do not invent a DSG graphics format or a `.dsg` extension. Rewrite skills and guides from scratch. Stop treating ALD/open-kimi as live upstream; keep the migration fact in an archived note and do not rewrite Git history. Create, edit, preview, save, and export stay. The approved Spec must return to draft and that revision must be approved before implementation. Afterward, the same blind prompt must score A/B/C all `否`.

## Problem and evidence

The graphic-design skill and PPTD v2 were extracted from open-kimi through ALD. Design-authoring changes on `codex/independent-release` are the Folio→Geon rename, not a format retirement. Blind-eval baseline (two independent runs, same [prompt](../../../eval/open-kimi-pptd-blind-prompt.md)): A product clone `否`; B skill text `借鉴`; C format DSL `借鉴`. Record: [blind eval](../testing/2026-09-14-open-kimi-pptd-blind-eval.md).

The current tree still admits `design.pptd`, ships a `version: v2` example, rejects `id`/`kind` in v3, defaults to MiSans, and names helpers/errors PPTD. The skill guides remain ALD-derived.

## Goals and non-goals

Keep: single-canvas create/edit, Agent-writable source, structural validation with draft preservation, `geon_render_preview`, human-save write-back, PNG/JPEG export, version history, live authoring preview.

Drop: Kimi/open-kimi `.pptd` interop; v2 HTML/theme/`seriesDefaults`; calling the product format PPTD.

Do not: invent a second canvas model or `.dsg` DSL; let Agents edit `design.json`; shrink open element kinds; rewrite public Git history; redo the Folio→Geon product rename.

## Scheme

### 1. Authoring is the existing Bento projection, not a new format

Manifest `design.yaml`, one page `pages/canvas.yaml`, assets `media/`. Keep YAML and the multi-file layout. Align fields with Bento: `id`/`kind`, structured text/table/chart, local `media/` paths. Reverse the `pptd-v3.ts` rejection of canonical aliases. Do not write PPTD `version: v2`/`v3`; if a version is needed, use a Geon/Bento identifier. Call it a YAML design source in public copy. Do not coin DSG.

### 2. Admit only that surface; retire PPTD v2

Stop accepting HTML `content.text`, `theme`/`$ref`, `seriesDefaults`, Google Fonts URLs, multiple pages, animation, notes, and `.pptd`. Saved artworks are BentoDoc. There is no public "import PPTD" feature. A default-off, undocumented, one-shot internal migrator may exist only for this product's historical drafts.

### 3. Write Agent materials from scratch

Replace `SKILL.md`, composition, replication, format guide, and the minimal example. Describe Geon's actual edit levels and local assets. Do not adapt open-kimi/ALD relationship tables, few-shot families, or the PPT five-step flow. The example must use the new layout, not `design.pptd`.

### 4. Remove PPTD/Kimi fingerprints

Replace `design.pptd`, `geon-pptd.mjs`, `PPTD-E*`, `common.kimiRuntime`, and "graphic-PPTD" in docs. Change the omitted-font default from MiSans to a bundled licensed font. Keep refusing a remote renderer; do not keep Kimi in the product-boundary row name.

### 5. Cut live upstream; do not erase history

Files that are rewritten or deleted must not stay listed as ALD/open-kimi adapted/verbatim. The build must not re-check those hashes. Drop Folio wording in `source-manifest`. Bento may be pinned directly from its MIT commit plus Geon patches. Keep the one-time migration fact in this note/archive; it must not enter the skill, runtime, or blind-eval required reading. Do not force-push Git.

### 6. Change the contract first

[The graphic-design platform Spec](../../../../specs/graphic-design-platform.md) 2026-09-14 revision is approved. Root `AGENTS.md` now uses YAML projection wording. The independent-release Spec remaining in draft does not substitute for [#36](https://github.com/LeonEthan/Geon/issues/36) runtime work.

### 7. Close with the same blind eval

Do not change the instrument. After implementation, two independent runs must score A/B/C all `否`. B must not still see the poster relationship table as an adaptation; C must not still see the authoring format as PPTD. Renaming while still accepting v2 is not a pass.

## Order after approval

1. Human approval of this Spec revision, then root `AGENTS.md` wording.
2. Projection and intake admit only `design.yaml`; retire v2; `id`/`kind`. The snapshot seam is landed in the [YAML artwork snapshot contract](../../implemented/architecture/2026-09-14-yaml-authoring-snapshot.md) ([#37](https://github.com/LeonEthan/Geon/issues/37)).
3. Watchers, finalize, no-artifact detection, preview paths. Turn collection, no-artifact detection, and human-save 画稿投影 now use `design.yaml`; leftover `.pptd` is not this turn’s artifact. See the [YAML turn/projection entry](../../implemented/architecture/2026-09-14-yaml-turn-projection.md) ([#38](https://github.com/LeonEthan/Geon/issues/38)). Preview subscriptions and explicit import remain [#39](https://github.com/LeonEthan/Geon/issues/39).
4. Skills, example, default font, error codes.
5. source-manifest and comments. Live fingerprints landed in the [implemented note](../../implemented/architecture/2026-09-14-drop-live-pptd-kimi-fingerprints.md) ([#41](https://github.com/LeonEthan/Geon/issues/41)).
6. Regression: open/save/export existing BentoDoc; new turns write the new files and preview.
7. Re-run the blind eval.

## Small items still for the Spec revision

- Page filename defaults to `pages/canvas.yaml` in this scheme.
- Which bundled font replaces MiSans.
- Whether the default-off internal v2-draft migrator exists at all.

## Spec approval (2026-09-14)

In this session the user replied "按这版批准", approving the 2026-09-14 YAML artwork-projection revision of [the graphic-design platform Spec](../../../../specs/graphic-design-platform.md) as `approved`. Approved bytes SHA256: Chinese `d64fd26041355c3d70fafd8eaa08d97470c8e00c083f3279fd6da40f7b3f6804`, English `5930e62d3846a0f1603f331bc7bfd2f0fc3ddaf7e0593f5eed54a3a86e9e5919`. The scope is the Spec text's intent and behavioral clauses; it does not authorize publication, does not treat the still-PPTD runtime as landed, and does not approve other documents. Implementation remains [#36](https://github.com/LeonEthan/Geon/issues/36). Root `AGENTS.md` now uses YAML projection instead of PPTD as the intent wording.

## Limits

Runtime work in this note remains proposed, not implementation authority or a legal opinion. The blind eval is a reader-regression check. Completion evidence remains: v2 gone, Bento field names, no `.pptd` entry, original skills, and no live ALD PPTD pin.
