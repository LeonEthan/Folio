# 删除逐轮缩略图，保留渲染和读图（T08）

Status: implemented
Translation: pending

## 摘要

逐轮结果卡退役后，回合结束仍生成缩略图、写引用并保留专用读回接口，已无产品消费者。本次删除该完整链路及只为它服务的缩放参数，提交回执、普通图片和 Agent 的 PNG 渲染预览继续复用既有能力。旧 outcome 的可选缩略图字段只在读取视图中忽略，原历史和用户文件不做迁移或清理。确定性验证覆盖回执、旧记录及文件保留；真实模型读图与本机导出证据在下节分别记录，不以渲染成功推断模型已看图。

## 决定和消费者核对

落实 [#10](https://github.com/LeonEthan/Folio/issues/10)，承接 [T07](2026-09-11-design-files-without-result-cards.zh.md) 和[范围复核](../../proposed/simplification/2026-09-11-design-result-feedback.zh.md)。实施基线为 `fb7914d`；T07 原始来源提交为 `bf8367be03d96cdc112adefffe681984cfa1f54a`。历史缩略图实现的来源为 `baed947b6f16263cb6a2f8f37e10f1695d146fe0`，旧说明保留该提交的链接。

- 删除 `thumbnail.ts`、`thumbnail-read.ts` 和专属测试；采集不再捕获图片、补写 outcome 或等待渲染。SessionExecution 不再注入缩略图使用的宿主依赖，MessageHandler 的共享宿主及真实 MCP 路由保持。
- 删除设计 worker 的 `thumbnail` 操作、Electron `design.thumbnail` 与专用读回服务。旧候选 JSON 和草稿仍由 T07 的普通文件入口可达；不改 canonical 存储、素材、回执和原子保存。
- 全仓消费者检索确认 `maxEdge`、`scaleToLongestEdge`、8 秒缩略图预算与队列的调用方自定义 timeout 仅服务该链路。删除这些参数及孤立分支；共享宿主保留 60 秒预览预算、队列上限、轮询、错误反馈和报告重传。
- shared 不再暴露 `DesignTurnOutcomeThumbnail` 或其专用 sanitizer。`schema.Any` 仍保存旧字段；`sanitizeDesignTurnOutcome` 只生成当前可用的只读视图，不拒绝旧记录、不回写清理。结果卡 UI 已由 T07 删除，本次没有新的卡片、侧栏缩略图或替代存储。
- 通用附件的 `session-image` thumbnail 路由、图片气泡、普通文件资源、预览、复制/另存并不属于逐轮设计缩略图。它们仍有消费者，保持原样。`folio_render_preview`、PNG 校验、共享 Bento 渲染宿主及 PNG/JPEG 固定导出保持；新预览按画布实际尺寸输出。

## 验证和限制

定向 shared 测试 31 项、CLI 测试 64 项、Electron 渲染宿主 8 项通过。覆盖旧 outcome 带有效或损坏缩略图字段仍读到同一回执，Loro 快照重开保留原字段，正常采集及幂等重开不生产缩略图且旧 PNG 字节不变；预览工具注册/调用、PNG 读回与宿主生命周期继续通过。

`corepack pnpm check`、`corepack pnpm format` 与 `corepack pnpm e2e:build` 通过。格式化后排除无关的既有差异；检查子进程过滤继承的 `ANTHROPIC_*` / `CLAUDE_CODE_USE_*`，未改用户环境。真实 Electron 和模型证据仍在本票验证阶段；此处不提前宣告完成。没有修改总 Spec、Root AGENTS、历史会话文件或产品 Agent 配置；未发布 PR 或远程提交。
