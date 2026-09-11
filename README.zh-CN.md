# Folio

[English](README.md)

Folio 是与 Agent 协作的本地桌面平面设计工作台，每件作品使用一张可编辑画布。
它复用 [Lody](https://github.com/LodyAI/Lody) 的界面与 Agent 执行能力，结合
PPTD 创作格式与 Bento 编辑器。

## 当前开发版本

- 创建设计、选择尺寸，在 Bento 中编辑文字、形状和图片，保存、重新打开并导出 PNG 或 JPEG。
- 请已配置的 Agent 使用 PPTD 创作或修改设计。BentoDoc 是可编辑画布，PPTD 是面向
  Agent 的创作格式。Agent 自主选择创作方法，并可使用可用的文件与图片工具审阅作品。
- 使用既有会话导航，继续对话、处理权限请求或取消执行。视觉质量由你判断。
- 未配置图像服务也可以编辑画布。图像生成是可选连接；在设置中填写你自己的端点、
  凭据和明确的 model 标识。Folio 不推荐产品默认型号。

这是开发版本，不代表已经满足发布标准。各 Agent 的图片输入、同步 hook、PPTD 实时
预览及剩余流程清理由 [Issues](https://github.com/LeonEthan/Folio/issues) 跟踪。
能够配置某个 Agent，不代表其全部设计操作都已验证。
[设计规范](specs/graphic-design-platform.zh.md) 描述草案目标，不是已交付功能清单。

## 试做一张设计

创建单画布后，可以尝试：

> 制作一张 800 × 600 的工作坊海报。使用深蓝背景，大标题为“动手创造”，
> 副标题为“周六 · 14:00”。保持文字可编辑。

然后继续：

> 缩小标题，并给副标题更多留白。保持画布尺寸。

你也可以直接在 Bento 中选中文字编辑、改色、插入图片或调整布局。保存设计后导出
PNG 或 JPEG。生成图片是可选步骤，文字和形状设计不需要图像服务。

## 本地运行

使用 Node.js 22.14 或更高版本，通过 Corepack 使用仓库锁定的 pnpm：

```sh
git clone --recurse-submodules https://github.com/LeonEthan/Folio.git
cd Folio
corepack pnpm install
corepack pnpm start:local
```

在设置中选择并配置 Agent。Agent 运行时安装可能需要公共下载及供应商自己的认证。
OSS 桌面使用本地产品存储，不登录 Lody 托管工作空间，也不提供其网页、手机、团队
共享或云端功能。

Folio 已有独立应用身份（`dev.folio.app`、`folio://`），本地服务数据位于 `~/.folio`。
Electron 使用当前操作系统的 Folio 用户数据位置。现有 `LODY_*` 环境选项及
`@lody/*` 包名、协议名仍是兼容接口，不会自动迁移或清除 Lody 数据。

当前 CLI 行为见 [CLI README](apps/cli/README.md)，继承的贡献条款和开发检查见
[CONTRIBUTING.md](CONTRIBUTING.md)。本 README 是 Folio 的公开帮助入口；`site-docs`
保留上游 Lody 网站材料，不是 Folio 的功能参考。

## Repository

- `apps/cli` — Agent 执行和本地设计存储
- `apps/electron` — Folio 桌面应用
- `packages/components` — 复用的工作台界面
- `packages/design-bento` — 固定版本的 Bento 编辑与渲染资源
- `packages/design-authoring` — PPTD 转换和 Agent skills
- `packages/platform` — 平台能力与端口
- `packages/shared` — 共享 schema 和协议
- `packages/cloud-api` — 可选云 DTO，不包含托管后端
- `packages/acp-extension-{core,kimi}` — ACP 扩展子模块

## 来源与许可证

Folio 基于 [Lody](https://github.com/LodyAI/Lody)，保留上游署名、
[Apache-2.0 许可证](LICENSE)和归属声明。现有应用图形资源复用自 Lody，并非新制作的
Folio 品牌图形。PPTD 和编辑器适配来自
`agentic-listing-design`；
[Bento 来源与许可证说明](packages/design-bento/README.md)及
[创作格式来源说明](packages/design-authoring/README.md)记录各自来源。
应用内“开源许可证”入口保留依赖声明。

Folio 问题和建议请提交到 [Folio Issues](https://github.com/LeonEthan/Folio/issues)。
