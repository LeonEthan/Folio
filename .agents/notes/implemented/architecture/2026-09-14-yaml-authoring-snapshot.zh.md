# YAML 画稿投影快照合同

Status: implemented
Translation: current

[English](2026-09-14-yaml-authoring-snapshot.md)

## 摘要

`@geon/design-authoring` 的采集、校验、导入与导出只承认 YAML 画稿投影：`design.yaml`、一页 `pages/canvas.yaml`、本地 `media/`。元素使用 Bento `id` / `kind`。遗留 `.pptd`、PPTD v2 语法和 `elementId` / `elementType` 闭门拒绝。可编辑权威仍是 BentoDoc；YAML 不是第二份 canonical。省略的 `fontFamily` 不会写成 MiSans；产品缺省族名是已捆绑且有 OFL 授权的 Inter。本记录只覆盖快照缝（[#37](https://github.com/LeonEthan/Geon/issues/37)）。回合采集与人工保存投影见后续 [YAML 回合/投影入口](2026-09-14-yaml-turn-projection.zh.md)（[#38](https://github.com/LeonEthan/Geon/issues/38)）。不宣称预览、技能或指纹清扫已落地。

## 决定

关联已批准 [平面设计工作台](../../../../specs/graphic-design-platform.zh.md) 2026-09-14 修订、[退役方案](../../proposed/architecture/2026-09-14-retire-kimi-pptd-authoring.zh.md) 与 [#37](https://github.com/LeonEthan/Geon/issues/37)。

公开缝是 `collectAuthoring` / `intakeAuthoring` / `exportAuthoring`（`exportPptd` 为弃用别名）。校验走内核重放，丢弃重放结果，不静默修复。数组序是图层顺序；省略的 `zIndex` 按数组下标补齐，显式 `zIndex` 原样保留。缺页背景沿用既有白底 solid。Inter 作为未登记时仍允许的缺省族名，不把字体字节写进每份投影。

未采用长期双格式准入（PPTD+YAML）：遗留 `.pptd` 不是有效入口。未发明 DSG / `.dsg`。未改 vendored Bento（static-v1 仍可能在渲染层推导 MiSans）；作者层不把该缺省写回 YAML 或 BentoDoc。

## 验证与限制

`packages/design-authoring` 的 intake、roundtrip 与 skill-script 测试覆盖 YAML 往返、PPTD 拒收和省略字体。回合采集与人工保存投影见 [#38](https://github.com/LeonEthan/Geon/issues/38)。桌面监听、技能指南、示例 `poster.pptd`、PPTD-E\* 码名与 live ALD pin 仍留给 [#39](https://github.com/LeonEthan/Geon/issues/39)–[#41](https://github.com/LeonEthan/Geon/issues/41)。盲测见 [#42](https://github.com/LeonEthan/Geon/issues/42)。
