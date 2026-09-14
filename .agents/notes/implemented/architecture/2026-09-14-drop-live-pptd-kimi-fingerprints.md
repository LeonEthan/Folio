# Drop live PPTD/Kimi fingerprints

Status: implemented
Translation: current
PR: https://github.com/LeonEthan/Geon/pull/44

[中文](2026-09-14-drop-live-pptd-kimi-fingerprints.zh.md)

## Abstract

Runtime and package provenance no longer present PPTD or Kimi as the live authoring format. The skill helper bundle is `geon-authoring.mjs`, Geon-facing diagnostics are `GEON-E*`, and the excluded remote-renderer probe is named remote renderer while the frozen matrix row stays `common.kimiRuntime`. Rewritten skills and the PPTD catalogue/example are unpinned from live ALD/open-kimi verification; Folio wording is gone from `source-manifest.json`. Git history is intact. This is [#41](https://github.com/LeonEthan/Geon/issues/41) only: turns, preview, original skill teaching, and blind eval remain later slices.

## Decision

Linked to the [retirement proposal](../../proposed/architecture/2026-09-14-retire-kimi-pptd-authoring.md), the [YAML snapshot contract](2026-09-14-yaml-authoring-snapshot.md), and [#41](https://github.com/LeonEthan/Geon/issues/41).

Vendored Bento was not edited. Frozen `PPTD-E*` tables and `common.kimiRuntime` stay inside `packages/design-bento/vendor`. The authoring package maps live diagnostics at `src/live-diagnostics.ts` and presents the excluded renderer as `common.remoteRenderer` / payload `remote`. Helper scripts import `scripts/lib/geon-authoring.mjs`; the build deletes a leftover `geon-pptd.mjs`.

Rewritten `SKILL.md` files, helper scripts, `pptd-authoring.md`, and the bundled `poster.pptd` / `poster.page` example are no longer live ALD verbatim/adapted pins. Remaining `src/` intake files stay adapted from the pinned ALD authoring package; imagegen LICENSE, sample prompts, and `swatch.png` stay verbatim. The one-time migration fact stays in this note and the retirement proposal, not in the skill or the blind-eval required reading.

A long-lived dual presentation (YAML files with PPTD/Kimi names) was rejected. Forking vendor diagnostics was rejected because it would break `FROZEN_MATRIX_SHA256`. Rewriting Git history was rejected.

## Verification and limits

`packages/design-authoring` tests cover helper path, emitted `GEON-E*` codes, remote-renderer presentation, unpinned manifest rows, and surviving git log. The package build re-checks those live-surface rules. CLI turn/preview paths and skill teaching still mention leftover PPTD until [#38](https://github.com/LeonEthan/Geon/issues/38)–[#40](https://github.com/LeonEthan/Geon/issues/40). Blind eval is [#42](https://github.com/LeonEthan/Geon/issues/42).
