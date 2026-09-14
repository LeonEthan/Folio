# YAML artwork snapshot contract

Status: implemented
Translation: current

[中文](2026-09-14-yaml-authoring-snapshot.zh.md)

## Abstract

The `@geon/design-authoring` collect, validate, import and export seam now admits only the YAML artwork projection: `design.yaml`, one `pages/canvas.yaml` page, and local `media/`. Elements use Bento `id` / `kind`. Leftover `.pptd`, PPTD v2 syntax, and `elementId` / `elementType` fail closed. BentoDoc remains the editable canonical; YAML is not a second canonical blob. Omitted `fontFamily` is not written as MiSans; the product default family name is bundled, OFL-licensed Inter. This note covers the snapshot seam ([#37](https://github.com/LeonEthan/Geon/issues/37)) only. Skills and the bundled example are [#40](https://github.com/LeonEthan/Geon/issues/40). Turns, preview, and fingerprint cleanup are not claimed done.

## Decision

Linked to the approved [graphic design platform](../../../../specs/graphic-design-platform.md) 2026-09-14 revision, the [retirement proposal](../../proposed/architecture/2026-09-14-retire-kimi-pptd-authoring.md), and [#37](https://github.com/LeonEthan/Geon/issues/37).

The public seam is `collectAuthoring` / `intakeAuthoring` / `exportAuthoring` (`exportPptd` is a deprecated alias). Validation uses kernel replay and discards the replay result; it never silently repairs output. Array order is z-order; omitted `zIndex` is filled from the array index, and an explicit `zIndex` is kept. A missing page background still becomes white solid, matching the existing importer exception. Inter is allowed as an unregistered default family name; font bytes are not embedded in every projection.

A long-lived dual admission of PPTD plus YAML was rejected: leftover `.pptd` is not a valid entry. No DSG / `.dsg` format was invented. Vendored Bento was not edited (static-v1 may still derive MiSans at render); the authoring layer does not write that default back into YAML or BentoDoc.

## Verification and limits

`packages/design-authoring` intake, roundtrip, and skill-script tests cover YAML roundtrip, PPTD rejection, and omitted fonts. Skill guides and the bundled YAML example are [#40](https://github.com/LeonEthan/Geon/issues/40). CLI/desktop watchers, turn collection, PPTD-E\* code names, and live ALD pins remain [#38](https://github.com/LeonEthan/Geon/issues/38)–[#41](https://github.com/LeonEthan/Geon/issues/41). Blind eval is [#42](https://github.com/LeonEthan/Geon/issues/42).
