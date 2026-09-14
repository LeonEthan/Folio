# 去掉现行 PPTD/Kimi 指纹

Status: implemented
Translation: current
PR: https://github.com/LeonEthan/Geon/pull/44

[English](2026-09-14-drop-live-pptd-kimi-fingerprints.md)

## 摘要

运行时与包来源不再把 PPTD 或 Kimi 当作现行创作格式。技能辅助包是 `geon-authoring.mjs`，面向 Geon 的诊断码是 `GEON-E*`，被排除的远程渲染探测名为 remote renderer，冻结矩阵行仍是 `common.kimiRuntime`。已重写技能和 PPTD 目录/示例不再作为 live ALD/open-kimi 校验；`source-manifest.json` 去掉 Folio 文案。Git 历史保持。这只覆盖 [#41](https://github.com/LeonEthan/Geon/issues/41)：回合、预览、技能原文重写和盲测仍是后续切片。

## 决定

关联[退役方案](../../proposed/architecture/2026-09-14-retire-kimi-pptd-authoring.zh.md)、[YAML 快照合同](2026-09-14-yaml-authoring-snapshot.zh.md) 与 [#41](https://github.com/LeonEthan/Geon/issues/41)。

未改 vendored Bento。冻结的 `PPTD-E*` 表和 `common.kimiRuntime` 留在 `packages/design-bento/vendor`。创作包在 `src/live-diagnostics.ts` 映射现行诊断，并把被排除的渲染器呈现为 `common.remoteRenderer` / payload `remote`。辅助脚本导入 `scripts/lib/geon-authoring.mjs`；构建会删除遗留的 `geon-pptd.mjs`。

已重写的 `SKILL.md`、辅助脚本、`pptd-authoring.md` 以及捆绑的 `poster.pptd` / `poster.page` 不再是 live ALD verbatim/adapted pin。其余 `src/` intake 文件仍记录为 pinned ALD authoring 包的 adapted；imagegen LICENSE、sample prompts 和 `swatch.png` 仍为 verbatim。一次性迁移事实留在本记录和退役方案，不进技能，也不进盲测必读。

未采用 YAML 文件仍自称 PPTD/Kimi 的双面呈现。未分叉 vendor 诊断，以免破坏 `FROZEN_MATRIX_SHA256`。未改写 Git 历史。

## 验证与限制

`packages/design-authoring` 测试覆盖辅助路径、发出的 `GEON-E*` 码、远程渲染呈现、已unpin 的清单行，以及仍在的 git log。包构建会再检查这些现行表面规则。CLI 回合/预览路径和技能教学在 [#38](https://github.com/LeonEthan/Geon/issues/38)–[#40](https://github.com/LeonEthan/Geon/issues/40) 之前仍可能提到遗留 PPTD。盲测见 [#42](https://github.com/LeonEthan/Geon/issues/42)。
