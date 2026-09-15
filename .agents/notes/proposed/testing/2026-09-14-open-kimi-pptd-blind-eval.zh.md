# open-kimi-ppt-skill 盲测 eval（基线）

Status: proposed
Translation: current

[English](2026-09-14-open-kimi-pptd-blind-eval.md)

## 摘要

用无本轮对话上下文的 Agent，只看 Molly Design 当前树与钉死的 `open-kimi-ppt-skill`，按 A 产品克隆 / B 技能文本 / C 格式 DSL 三层打分。主评测禁止翻 `agentic-listing-design`、禁止打开本评测/退役笔记、禁止搜网页。仪器是 [盲测 prompt](../../../eval/open-kimi-pptd-blind-prompt.md)。基线两次独立 run 分层一致：A `否`，B `借鉴`，C `借鉴`。YAML 退役并改写剩余近原文后，又两次独立 run 分层一致：A `否`，B `否`，C `借鉴`。该历史组未满足 C 层通过线。获批单文件重构后，两次独立 Grok 4.6 CLI 测评均为 A/B/C 全部 `否`，在下文记录的抽样范围内达到约定评分线。不是法律结论，也不批准改 Spec 或改运行时。

## 合同

- 对照仓库：`/Users/macmini/dev/open-kimi-ppt-skill`，磁盘快照应保持 `c32890fe`。
- 被评仓库：`/Users/macmini/dev/Geon` 当前工作树。
- 主评测只填 A/B/C。谱系（是否经 ALD 抽取）不进通过线，也不许为了找谱系去打开 ALD。
- 判定词只能是 `否` / `借鉴` / `复制`。无双方路径的 `借鉴`/`复制` 作废。
- 同一 prompt 至少两次独立 run；分层判定不一致则记分歧，不挑选顺的一次。
- 超时、几乎没读 skill/格式文件的 run 作废。
- 改完后的期望（不是基线期望）：A/B/C 均为 `否`。基线允许 B/C 为 `借鉴` 或 `复制`。只换名仍收 v2 不算通过。

## 怎么跑

在无本会话记忆的进程里投递 prompt 全文（例如独立 subagent，cwd 不要落在会注入本评测笔记的上下文里；或 `cli -p` 读该文件）。不要把退役方案或本笔记当作必读材料。

```sh
# 对照仓库 revision（跑前核对）
git -C /Users/macmini/dev/open-kimi-ppt-skill rev-parse HEAD
```

## 基线环境

- Molly Design 分支：`codex/independent-release` @ `48fbd0e3764a72a27378aa78b678c0c8676c0e48`（另有未跟踪的本评测/退役笔记；prompt 禁止打开它们）
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
| A 产品克隆 | 否 | Molly Design 是单画布桌面平面设计台（Bento + PNG/JPEG），不交付 Kimi 托管编辑器、PPTX 导出脚本、约 30 套预设主题，也不做 PPTD+PPTX 双交付 | B: `README.md`、`editor/app.js`、`skills/open-kimi-ppt/scripts/export_pptx.py`、`theme.md`；A: `README.zh-CN.md`、`packages/design-authoring/skills/graphic-design/SKILL.md`、`packages/design-authoring/src/product-boundary.ts` |
| B 技能文本 | 借鉴 | `SKILL.md` 工作流本身不同，但海报方法指南的 8 行关系表与若干独特措辞是 B 文的压缩改写，不是泛泛设计建议 | B: `skills/open-kimi-ppt/SKILL.md`、`skills/open-kimi-ppt/reference/general-poster.md`；A: `packages/design-authoring/skills/graphic-design/SKILL.md`、`.../references/general-poster.md`、`.../references/replication.md` |
| C 格式 DSL | 借鉴 | Agent 面向的 v2 使用同一套 PPTD YAML 布局与字段名（`elementId`/`elementType`/`cropShape`/`seriesDefaults`、HTML 富文本、MiSans/18），但 A 不附带 B 的 `pptd.md` 全文，并裁成单页、禁动画/远程资源/PPTX | B: `skills/open-kimi-ppt/reference/pptd.md`、`example/dji-pocket4/dji-pocket4.pptd`；A: `packages/design-authoring/skills/graphic-design/references/pptd-authoring.md`、`packages/design-authoring/src/validate.ts`、`.../examples/minimal/poster.pptd` |

### Run 2（`01a09f64-5ad4-7f93-91fe-f5101db3a424`，约 301s）

| 层 | 判定 | 一句话 | 双方证据路径 |
| --- | --- | --- | --- |
| A 产品克隆 | 否 | A 是单画布桌面平面设计工作台（Bento + PNG/JPEG），不交付 B 的 Kimi 托管编辑器、PPTX 导出、约 30 套主题包、动画/翻页与 PPTD+PPTX 双交付。 | B: `README.md`、`editor/`、`scripts/export_pptx.py`、`theme.md`；A: `README.md`、`packages/design-authoring/skills/graphic-design/SKILL.md`、`src/product-boundary.ts` |
| B 技能文本 | 借鉴 | A 的 `SKILL.md` 已改写成单画布流程，但 `general-poster.md` 的关系表与若干禁令句明显改写自 B 的海报指南，而非仅共享“做海报”这一通识。 | B: `skills/open-kimi-ppt/SKILL.md`、`reference/general-poster.md`；A: `skills/graphic-design/SKILL.md`、`references/general-poster.md`、`references/replication.md` |
| C 格式 DSL | 借鉴 | A 面向 Agent 的仍是同一套 PPTD YAML（`.pptd`+`pages/`+`media/`、`elementId`/`elementType`、MiSans/18、HTML 富文本、13 类 chart），但未倾销 B 的 `pptd.md` 全文，并砍掉多页/动画/PPTX。 | B: `reference/pptd.md`、`tests/fixtures/minimal/`；A: `references/pptd-authoring.md`、`examples/minimal/`、`src/validate.ts`、`src/richtext.ts` |

两次都强调：A 的主 `SKILL.md` 已不是 B 的 step0–step5；B 层的命中点是 `general-poster.md` 的八行关系表和近义禁令句。C 层的命中点是 v2 字段名、默认值、工程布局，同时承认未附带 2000 行 `pptd.md`、未做产品克隆。

## 退役后评测（[#42](https://github.com/LeonEthan/molly-design/issues/42)）

仪器未改。对照仓库仍是 `c32890fe0985bdf668f2722fed30f1010bdf24c9`。两次独立 general-purpose subagent，cwd `/Users/macmini/dev`，无本会话记忆，不打开 ALD，不把退役/评测笔记当必读。

### 第一对（树在 `f4d78bc`，改写剩余措辞前）

两次都有效（都打开了双方 skill、海报/复刻指南、格式文件、示例和 intake/校验源）。C 层不一致。B 的 `借鉴` 命中的是 `general-poster.md` 里压缩过的版权/比例近原文，不是已删除的关系表。

| 层 | Run 1 `01a0a066-f0b8-7642-8246-5eac699204e0`（约 356s） | Run 2 `01a0a066-f0b8-7642-8246-5ebe68db5dfb`（约 345s） |
| --- | --- | --- |
| A 产品克隆 | 否 | 否 |
| B 技能文本 | 借鉴 | 借鉴 |
| C 格式 DSL | 借鉴 | 否 |

B 双方证据：相对 open-kimi `reference/general-poster.md` 的 “self-owned, licensed, officially citable…” / 伪造 logo 句，以及裁切/text-safe 措辞。C 分歧：Run 1 把 `pages/`+`media/`、七类元素、`bounds`/`shapeName` 看成同一 PPTD 族 DSL；Run 2 把 Agent 入口 `design.yaml` + Bento `id`/`kind` 以及拒收 leftover PPTD 看成另一种格式。

随后在同一分支改写了这些剩余技能句，以及 imagegen 中的 `design.pptd` / “use the result in PPTD”。物化测试现在禁止这些被引用的短语。这不是改仪器。

### 第二对（同一 `f4d78bc` 树，加上本变更中的剩余措辞改写）

两次都有效，分层一致。

| 层 | Run 1 `01a0a072-f792-7dc0-9662-20a2af303d9c`（约 327s） | Run 2 `01a0a072-f793-7a93-849d-fc10117d36ef`（约 357s） | 采用 |
| --- | --- | --- | --- |
| A 产品克隆 | 否 | 否 | **否** |
| B 技能文本 | 否 | 否 | **否** |
| C 格式 DSL | 借鉴 | 借鉴 | **借鉴** |

A、B 已达通过线。C 未达。两次 C 都有双方路径，不作废。Agent 入口已是 `design.yaml` / Bento `id`/`kind`，leftover `.pptd` 被拒绝；`借鉴` 剩下的是 YAML 投影布局（`pages/`+`media/`）、七个 `kind`、`bounds`/`shapeName`，以及运行时对 leftover PPTD 的识别（含 `src/pptd-v3.ts`、`richtext.ts` 和 e2e `.pptd` 夹具）。这些字段名和 `pages/canvas.yaml` 路径是已批准的 Bento 投影，不是第二套活的 PPTD 创作格式。为了强行得到 `否` 去改它们属于改 Spec，不是改评测仪器。

[#42](https://github.com/LeonEthan/molly-design/issues/42) 保持开放。父议题 [#36](https://github.com/LeonEthan/molly-design/issues/36) 保持开放。

## 限制

每对是两次同模型独立 run，不是两个不同产品模型。未跑 `cli -p`。Agent 回答不是法律结论。source-manifest 被打开过，但判定未引入第三仓库。第二对读到的是提交前的剩余措辞改写；本变更就是该改写加上分数记录。

## 单文件后续盲测：Grok（2026-09-15）

用户在已批准的单文件实现后要求 Grok 独立测试识别情况。两次全新本地 Grok CLI 1.0.30（`04b7ffed98c6`）会话使用 `grok-4.6`、工作目录 `/Users/macmini/dev`、原封不动的冻结提示词、plan 权限，禁用网页与子代理，另加只读及禁止读取 Molly Design 全部 notes、既往测评产物的约束。未提供此前评分或本会话内容。Repo B 保持 `c32890fe0985bdf668f2722fed30f1010bdf24c9`；Repo A 为 `06aa8ba031e5ccff40c9fabe60c5432d8e850f7d` 上尚未提交的单文件工作树。

| 层 | Grok 第一轮 | Grok 第二轮 |
| --- | --- | --- |
| A 产品克隆 | 否 | 否 |
| B 技能文本 | 否 | 否 |
| C 格式 DSL | 否 | 否 |

两轮共同依据：Molly Design 的单画布 PNG/JPEG 产品与 B 的编辑器/PPTX 管线不同；简短画布指南与 B 的 step0–5、`style.md`、预设工作流不同；`design.yaml`、`geon-canvas/1`、原生 `id`/`kind`、结构化文本与 B 的多文件 PPTD、`elementId`/`elementType`、主题和 HTML 不同。证据覆盖双方技能、海报指南、Molly Design 格式指南/示例/编解码器，以及 B 的 `reference/pptd.md` 和示例项目。

工具日志审计分别为 29、33 次读取/列目录/搜索，无对排除源码或 notes 的工具访问，无修改或联网调用，采集的 authoring/skill 源文件哈希未变。两个进程均正常退出。两轮都在要求的表格前输出进度文字，存在格式偏差。阅读属于抽样：B 的 2,029 行格式指南仅读前 150 行，241 行海报指南分别读前 120/80 行，未读原生编辑器和完整元素细则。第一轮声称格式读至“动画章”超出了实际读取范围。因此，一致评分作为达到评分线的有限 Grok 后续证据，不能当作穷尽相似性排查，也不覆盖历史评分。已要求不使用跨会话记忆，但没有独立证明 CLI 内部上下文组装不含记忆。

原始输出、工具日志、提示词及源码哈希仅保留于 Git 外的 `/tmp/geon-grok-blind-20260915/`。这是本记录首次实际 CLI/另一模型的后续测评；此前“限制”描述的是历史子代理组。Kimi 黄金视觉验收仍待人工审核。本次未改运行时代码、Spec 批准状态、Issue 状态或来源记录。


后续人工验收（2026-09-15）：用户接受当前单文件 Kimi 黄金结果，并授权提交本次调整。此确认取代上文的视觉待审核状态；Grok 抽样限制保持不变。

## 收尾核查（2026-09-15）

只读核对 GitHub：#37–#41 已关闭，#42/#36 仍开放。Grok 两轮达到 #42 约定的评分线，阅读抽样和上下文验证限制仍如上；基线笔记已更新，第一阶段黄金结果已获人工接受。#36 原文的双文件结构已被后续获批单文件修订取代，收尾时应明确记录该变更，不能声称逐字符合旧正文。

本地验收提交为 `ce5a9c1d636aa75ec9fbb8a900c7093ddb0b7129`。核查时公开的 `codex/independent-release` 分支仍为 `9003c522b96fad9bd93c2cebaf9f3594c87debce`，是本地 HEAD 之前 18 个提交的祖先；GitHub 无法找到本地验收提交。建议按约定落地流程公开已验收代码及证据，更新 Issue 结论后，依次关闭 #42、#36。本次核查未修改 GitHub Issue、推送或改写历史。

不建议仅为隐藏旧借鉴痕迹重写历史：#36 明确保留历史，GitHub 也说明重写会改变提交 ID，且旧克隆、fork、缓存引用仍可能保留（[官方说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)）。本次限定范围核查未识别出具体泄露密钥或必须移除的历史文件，不等于完成全历史秘密/许可审计。当前 `design-authoring/source-manifest.json` 仍登记 adapted/ported 文件；`design-bento/README.md` 区分 ALD 适配闭包（固定来源无根许可证文件）与 MIT Bento。关闭创作层 Issue 不代表全仓来源或许可问题已清零；用户随后确认 ALD 是自己的项目，其适配代码不是本任务的阻碍。本次收尾范围为与 open-kimi-ppt-skill 的相似性，ALD 来源记录继续保留。


用户已授权提交/公开收尾内容、更新并关闭 #42 与 #36。保留 Git 历史，继续采用贴近 Bento 的当前 YAML；更深的类型区块重组属于可选的后续易用性工作，不是这些 Issue 的剩余验收条件。关闭针对 `codex/independent-release` 上已验收的实现，不代表已发布或合并到 `main`。
