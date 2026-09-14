# 退役 Kimi PPTD 创作面，保留 Bento 功能闭环

Status: proposed
Translation: current

[English](2026-09-14-retire-kimi-pptd-authoring.md)

## 摘要

Geon 的可编辑权威仍是 BentoDoc。Agent 创作面不再使用 PPTD：停收 v2，揭掉 v3 的 `elementId`/`elementType` 别名，磁盘改为 Bento 字段的 YAML 投影（`design.yaml` + `pages/canvas.yaml` + `media/`）。不发明名为 DSG 的新图形格式，不造 `.dsg` 扩展名。技能与指南从零编写。当前树不再把 ALD/open-kimi 当 live 上游；迁移事实留在归档笔记，不改写 Git 历史。用户侧生成、编辑、预览、保存、导出保持。已批准 Spec 须先退回 draft 并批准该修订后再实施。改完后用同一份盲测 prompt，A/B/C 均须为 `否`。

## 问题与已核对事实

graphic-design 技能与 PPTD v2 经 ALD 从 open-kimi 抽取。`codex/independent-release` 上的 design-authoring 差异是 Folio→Geon 换名，不是格式退役。盲测基线（两次独立 run，同一 [prompt](../../../eval/open-kimi-pptd-blind-prompt.md)）：A 产品克隆 `否`；B 技能文本 `借鉴`；C 格式 DSL `借鉴`。记录见 [盲测 eval](../testing/2026-09-14-open-kimi-pptd-blind-eval.zh.md)。

当前树仍：采集入口 `design.pptd`；示例 `version: v2`；v3 拒绝 `id`/`kind`；缺省 MiSans；`geon-pptd.mjs` / `PPTD-E*`；技能指南仍是 ALD 派生。

## 目标与非目标

保住：单画布创作与手工编辑、Agent 可写源文件、结构校验与草稿保留、`geon_render_preview`、人工保存回写、PNG/JPEG 导出、版本历史、创作文件实时预览。

放弃：Kimi/open-kimi `.pptd` 互通；v2 HTML/主题/`seriesDefaults`；产品自称 PPTD。

不做：新画布模型或 `.dsg` DSL；Agent 直接改 `design.json`；为避嫌缩小已开放元素种类；改写公开 Git 历史；重做 Folio→Geon 产品换名。

## 完整方案

### 1. 创作面 = 现有 Bento 投影，不是新格式

清单 `design.yaml`，一页 `pages/canvas.yaml`，素材 `media/`。YAML 与多文件保留。字段与 Bento 对齐：`id`/`kind`/结构化 text·table·chart、本地 `media/` 路径。撤销 `pptd-v3.ts` 对 canonical 别名的拒绝。清单不要写 PPTD 的 `version: v2`/`v3`；需要版本时用 Geon/Bento 自己的标识。对外就叫 YAML 设计源，不造 DSG 简称。

### 2. 只收这一面，停 PPTD v2

停收 HTML `content.text`、`theme`/`$ref`、`seriesDefaults`、Google Fonts URL、多页、动画、备注、`.pptd`。当前稿在 BentoDoc 里，重开不依赖 v2。不提供「导入 PPTD」产品。可选、默认关闭、不写进技能的一次性内部迁移器，仅处理本产品历史草稿。

### 3. 技能与示例从零写

替换 `SKILL.md`、构图、复刻、格式指南、最小示例。只写 Geon 实际编辑级别与本地素材。不改编 open-kimi/ALD 的关系表、few-shot、PPT 五步。示例必须是新布局，不能再发 `design.pptd`。

### 4. 去掉 PPTD/Kimi 指纹

`design.pptd`、`geon-pptd.mjs`、`PPTD-E*`、`common.kimiRuntime`、文档里的 graphic-PPTD 一并改掉。缺省字体改为已捆绑且有授权的字体，不用 MiSans。远程渲染继续拒绝，产品边界行不再叫 Kimi。

### 5. 切断 live 上游，不灭迹

重写或删除的文件不再标成 ALD/open-kimi 的 adapted/verbatim。构建不再核那些哈希。`source-manifest` 去掉 Folio 文案。Bento 继续用：可改为直接钉 Bento commit + Geon 补丁。一次迁移的事实留在本笔记/归档，不进技能、不进运行时、不进盲测必读。不 force-push 清 Git。

### 6. 先改合同

[平面设计工作台](../../../../specs/graphic-design-platform.zh.md) 2026-09-14 修订已批准。根 `AGENTS.md` 已改为 YAML 投影用语。独立发布 Spec 的 draft 不代替 [#36](https://github.com/LeonEthan/Geon/issues/36) 的运行时实施。

### 7. 用同一盲测收口

仪器不变。改完后两次独立 run：A/B/C 均为 `否`。B 不得再认出海报关系表改编；C 不得再认为创作格式是 PPTD。只改名而 v2 仍收，不算过。

## 实施顺序（批准之后）

1. 对本 Spec 修订的人类批准，以及根 `AGENTS.md` 用语。
2. 投影与 intake 只收 `design.yaml`；停 v2；`id`/`kind`。快照缝已落地，见 [YAML 画稿投影快照合同](../../implemented/architecture/2026-09-14-yaml-authoring-snapshot.zh.md)（[#37](https://github.com/LeonEthan/Geon/issues/37)）。
3. 监听、finalize、无产物判定、预览路径。
4. 技能、示例、缺省字体、错误码。
5. source-manifest 与注释。
6. 现有 BentoDoc 打开/保存/导出回归；新回合写新文件并预览。
7. 盲测复跑。

## 仍可在 Spec 里写死的小项

- 一页文件名固定为 `pages/canvas.yaml`（本方案默认）。
- 替代 MiSans 的具体捆绑字体。
- 历史 v2 草稿要不要那只默认关闭的内部迁移器。

## Spec 批准记录（2026-09-14）

用户在本会话显式回复「按这版批准」，批准 [平面设计工作台](../../../../specs/graphic-design-platform.zh.md) 2026-09-14 YAML 画稿投影修订为 `approved`。批准对象 SHA256：中文 `d64fd26041355c3d70fafd8eaa08d97470c8e00c083f3279fd6da40f7b3f6804`，英文 `5930e62d3846a0f1603f331bc7bfd2f0fc3ddaf7e0593f5eed54a3a86e9e5919`。范围是 Spec 文本的意图与行为条款；不授权发布，不把运行时尚未改成 YAML 入口当作已落地，也不批准其它文档。实施仍见 [#36](https://github.com/LeonEthan/Geon/issues/36)。根 `AGENTS.md` 已把 PPTD 意图用语改为 YAML 投影。

## 限制

本记录的运行时方案仍是 proposed，不是实施授权，也不是法律意见。盲测是观感回归，完成证据仍是停 v2、Bento 字段、无 `.pptd` 入口、新写技能、manifest 不再 pin ALD PPTD。
