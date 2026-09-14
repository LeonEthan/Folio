# open-kimi-ppt-skill 盲测 eval（基线）

Status: proposed
Translation: current

[English](2026-09-14-open-kimi-pptd-blind-eval.md)

## 摘要

用无本轮对话上下文的 Agent，只看 Geon 当前树与钉死的 `open-kimi-ppt-skill`，按 A 产品克隆 / B 技能文本 / C 格式 DSL 三层打分。主评测禁止翻 `agentic-listing-design`、禁止打开本评测/退役笔记、禁止搜网页。仪器是 [盲测 prompt](../../../eval/open-kimi-pptd-blind-prompt.md)。基线两次独立 run 分层一致：A `否`，B `借鉴`，C `借鉴`。基线用于对照后续退役工作，不是法律结论，也不批准改 Spec 或改运行时。

## 合同

- 对照仓库：`/Users/macmini/dev/open-kimi-ppt-skill`，磁盘快照应保持 `c32890fe`。
- 被评仓库：`/Users/macmini/dev/Geon` 当前工作树。
- 主评测只填 A/B/C。谱系（是否经 ALD 抽取）不进通过线，也不许为了找谱系去打开 ALD。
- 判定词只能是 `否` / `借鉴` / `复制`。无双方路径的 `借鉴`/`复制` 作废。
- 同一 prompt 至少两次独立 run；分层判定不一致则记分歧，不挑选顺的一次。
- 超时、几乎没读 skill/格式文件的 run 作废。
- 改完后的期望（不是基线期望）：A/B/C 均为 `否`。基线允许 B/C 为 `借鉴` 或 `复制`。

## 怎么跑

在无本会话记忆的进程里投递 prompt 全文（例如独立 subagent，cwd 不要落在会注入本评测笔记的上下文里；或 `cli -p` 读该文件）。不要把退役方案或本笔记当作必读材料。

```sh
# 对照仓库 revision（跑前核对）
git -C /Users/macmini/dev/open-kimi-ppt-skill rev-parse HEAD
```

## 基线环境

- Geon 分支：`codex/independent-release` @ `48fbd0e3764a72a27378aa78b678c0c8676c0e48`（另有未跟踪的本评测/退役笔记；prompt 禁止打开它们）
- open-kimi-ppt-skill：`c32890fe0985bdf668f2722fed30f1010bdf24c9`
- 两次 run：独立 general-purpose subagent，cwd `/Users/macmini/dev`，无本会话记忆
- 仪器：[盲测 prompt](../../../eval/open-kimi-pptd-blind-prompt.md) 全文投递

## 基线结果

两次分层判定一致，run 有效（都打开了双方 skill、海报指南、`pptd.md`/`pptd-authoring.md`、示例和校验器）。

| 层 | Run 1 | Run 2 | 基线采用 |
| --- | --- | --- | --- |
| A 产品克隆 | 否 | 否 | **否** |
| B 技能文本 | 借鉴 | 借鉴 | **借鉴** |
| C 格式 DSL | 借鉴 | 借鉴 | **借鉴** |

改完后的通过线仍是 A/B/C 均为 `否`。当前基线：A 已通过；B、C 未通过。没有 `复制`。两次都没有把 YAML/海报通识或 Bento 本身判成抄袭。

### Run 1（`01a09f64-5ad3-7042-87a5-53f1afcf7255`，约 228s）

| 层 | 判定 | 一句话 | 双方证据路径 |
| --- | --- | --- | --- |
| A 产品克隆 | 否 | Geon 是单画布桌面平面设计台（Bento + PNG/JPEG），不交付 Kimi 托管编辑器、PPTX 导出脚本、约 30 套预设主题，也不做 PPTD+PPTX 双交付 | B: `README.md`、`editor/app.js`、`skills/open-kimi-ppt/scripts/export_pptx.py`、`theme.md`；A: `README.zh-CN.md`、`packages/design-authoring/skills/graphic-design/SKILL.md`、`packages/design-authoring/src/product-boundary.ts` |
| B 技能文本 | 借鉴 | `SKILL.md` 工作流本身不同，但海报方法指南的 8 行关系表与若干独特措辞是 B 文的压缩改写，不是泛泛设计建议 | B: `skills/open-kimi-ppt/SKILL.md`、`skills/open-kimi-ppt/reference/general-poster.md`；A: `packages/design-authoring/skills/graphic-design/SKILL.md`、`.../references/general-poster.md`、`.../references/replication.md` |
| C 格式 DSL | 借鉴 | Agent 面向的 v2 使用同一套 PPTD YAML 布局与字段名（`elementId`/`elementType`/`cropShape`/`seriesDefaults`、HTML 富文本、MiSans/18），但 A 不附带 B 的 `pptd.md` 全文，并裁成单页、禁动画/远程资源/PPTX | B: `skills/open-kimi-ppt/reference/pptd.md`、`example/dji-pocket4/dji-pocket4.pptd`；A: `packages/design-authoring/skills/graphic-design/references/pptd-authoring.md`、`packages/design-authoring/src/validate.ts`、`.../examples/minimal/poster.pptd` |

### Run 2（`01a09f64-5ad4-7f93-91fe-f5101db3a424`，约 301s）

| 层 | 判定 | 一句话 | 双方证据路径 |
| --- | --- | --- | --- |
| A 产品克隆 | 否 | A 是单画布桌面平面设计工作台（Bento + PNG/JPEG），不交付 B 的 Kimi 托管编辑器、PPTX 导出、约 30 套主题包、动画/翻页与 PPTD+PPTX 双交付。 | B: `README.md`、`editor/`、`scripts/export_pptx.py`、`theme.md`；A: `README.md`、`packages/design-authoring/skills/graphic-design/SKILL.md`、`src/product-boundary.ts` |
| B 技能文本 | 借鉴 | A 的 `SKILL.md` 已改写成单画布流程，但 `general-poster.md` 的关系表与若干禁令句明显改写自 B 的海报指南，而非仅共享“做海报”这一通识。 | B: `skills/open-kimi-ppt/SKILL.md`、`reference/general-poster.md`；A: `skills/graphic-design/SKILL.md`、`references/general-poster.md`、`references/replication.md` |
| C 格式 DSL | 借鉴 | A 面向 Agent 的仍是同一套 PPTD YAML（`.pptd`+`pages/`+`media/`、`elementId`/`elementType`、MiSans/18、HTML 富文本、13 类 chart），但未倾销 B 的 `pptd.md` 全文，并砍掉多页/动画/PPTX。 | B: `reference/pptd.md`、`tests/fixtures/minimal/`；A: `references/pptd-authoring.md`、`examples/minimal/`、`src/validate.ts`、`src/richtext.ts` |

两次都强调：A 的主 `SKILL.md` 已不是 B 的 step0–step5；B 层的命中点是 `general-poster.md` 的八行关系表和近义禁令句。C 层的命中点是 v2 字段名、默认值、工程布局，同时承认未附带 2000 行 `pptd.md`、未做产品克隆。

## 限制

这是两次同模型独立 run，不是两个不同产品模型。未跑 `cli -p`。Agent 回答不是法律结论。source-manifest 被打开过，但判定未引入第三仓库。
