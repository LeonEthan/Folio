# Folio

[简体中文](README.zh-CN.md)

Folio is a local desktop workspace for graphic design with an Agent and an editable
single canvas. It reuses [Lody](https://github.com/LodyAI/Lody)'s interface and Agent
execution, with PPTD authoring and the Bento editor.

## Current development build

- Create a design, choose its dimensions, edit text, shapes and images in Bento,
  save it, reopen it, and export PNG or JPEG.
- Manual edits save automatically. Use Save version to retain a version in
  the artwork's local history, inspect earlier versions and continue editing from one.
- Ask your configured Agent to create or revise a PPTD design. BentoDoc is the
  editable canvas; PPTD is the Agent-facing authoring format. The Agent chooses its
  creative approach and can use available file and image tools to review its work.
- Continue the conversation, grant permissions, cancel work, and use the existing
  session navigation. Visual quality remains your judgment.
- Edit the canvas without configuring an image service. Image generation is an
  optional connection; supply your own endpoint, credentials and explicit model
  identifier in Settings. Folio does not recommend a product-default model.

This is a development build, not a claim of release readiness. Agent-specific
image input, public read-first reminders, live PPTD preview, and the remaining workflow
cleanup are tracked in [Issues](https://github.com/LeonEthan/Folio/issues). An Agent
being configurable does not prove every design operation works with that Agent.
The [design specification](specs/graphic-design-platform.zh.md) describes the draft
target, not a list of shipped features.

## Try a design

Create a single canvas and try a prompt such as:

> Create an 800 × 600 workshop poster. Use a dark blue background, a large “Make
> something” heading, and the subtitle “Saturday · 14:00”. Keep the text editable.

Then try:

> Make the heading smaller and give the subtitle more space. Keep the canvas size.

You can also select and edit text, change colors, insert an image and adjust the
layout directly in Bento. Save the design before exporting PNG or JPEG. Generated
images are optional; text and shape design does not require an image service.

## Continue, preview and recover

Manual edits automatically update the saved canvas and its PPTD files. Folio waits
for open-canvas saves before dispatch and keeps the artwork read-only while the Agent executes
and its files are processed. A file preview shows the working source; it is not a
saved canvas or proof that the Agent has finished. After a formal commit, edit the
current canvas again. When explicitly importing a preview, Folio binds the import
to the displayed snapshot.

If a file or final-save conflict occurs, the current saved canvas and Agent draft
are preserved. Use a new message to continue and resolve the conflict; Folio does
not automatically restart the finished turn. Existing draft files and historical
content remain available through the file interface. A save failure must be
resolved before treating your latest edits as saved or quitting.

## Release status and support limits

Release acceptance is pending. The installed macOS package has completed scripted
poster, infographic and long-image journeys with a native Claude runtime and a
synthetic provider. Human visual and editing judgments are still pending. Nine
controlled canvas-operation samples were recorded on an Apple M4 Mac with 16 GiB
RAM; these do not establish a maximum canvas size, universal performance budget,
application cold-start time or physical input latency. Windows and Linux resource
packaging is not native execution evidence. See the
[acceptance evidence](.agents/notes/proposed/testing/2026-09-11-complete-design-acceptance.md)
and [review procedure](e2e/DESIGN-ACCEPTANCE.md).

The current approach combines automatic PPTD saves with public read-first reminders,
without patching Agent runtimes or requiring generation-by-generation read proofs.
Pi, Claude, Codex and Grok reminders have scoped native evidence; Kimi's public
plugin is prepared but its user-level installation remains pending. Pi now exposes
Folio image and rendering tools through its public extension, with installed
generation/editing and native image-reading evidence. The
[installed Agent matrix](.agents/notes/proposed/testing/2026-09-11-installed-five-agent-matrix.md)
records each combination and its limits; Settings availability alone does not
establish a complete design workflow.

Real image generation/editing has produced four test assets, with original failed
receipts retained separately from successful later image reads. Complete real-image
design and human quality acceptance remain pending. Grok Stop and cancellation of
in-flight image requests still require correction and verification. Image generation
requires your own supported connection and explicit model; there is no product
default or automatic paid retry.

No public release, Developer ID signing, notarization or automatic update channel
is established by the local ad-hoc package checks.

## Run locally

Use Node.js 22.14 or later and the repository-pinned pnpm through Corepack:

```sh
git clone --recurse-submodules https://github.com/LeonEthan/Folio.git
cd Folio
corepack pnpm install
corepack pnpm start:local
```

Choose and configure your Agent in Settings. Agent runtime setup may require a
public download and the provider's own authentication. The OSS desktop uses local
product storage; it does not sign in to Lody's hosted workspace or provide its web,
mobile, team-sharing or cloud features.

Folio already has a separate application identity (`dev.folio.app`, `folio://`) and
uses `~/.folio` for its local service data. Electron uses the Folio user-data
location for the current operating system. Existing `LODY_*` environment options
and `@lody/*` package/protocol names remain compatibility interfaces. No automatic
migration or deletion of Lody data is performed.

See the [CLI README](apps/cli/README.md) for current CLI behavior and
[CONTRIBUTING.md](CONTRIBUTING.md) for inherited contribution terms and development
checks. This repository README is Folio's public help entry; `site-docs` retains
upstream Lody website material and is not the Folio feature reference.

## Repository

- `apps/cli` — Agent execution and local design persistence
- `apps/electron` — Folio desktop application
- `packages/components` — Reused workspace interface
- `packages/design-bento` — Pinned Bento editor and rendering resources
- `packages/design-authoring` — PPTD conversion and Agent skills
- `packages/platform` — Platform capabilities and ports
- `packages/shared` — Shared schemas and protocols
- `packages/cloud-api` — Optional-cloud DTOs; no hosted backend is included
- `packages/acp-extension-{core,kimi}` — ACP extension submodules

## Source and licenses

Folio builds on [Lody](https://github.com/LodyAI/Lody). Its upstream authorship,
[Apache-2.0 license](LICENSE) and attribution notices remain intact. Existing
application artwork is reused from Lody; it is not newly commissioned Folio art.
PPTD and editor adapters come from
`agentic-listing-design`;
[Bento provenance and license details](packages/design-bento/README.md) and
[authoring provenance](packages/design-authoring/README.md) identify their sources.
The app's Open Source Licenses entry retains dependency notices.

For Folio problems or proposals, use
[Folio Issues](https://github.com/LeonEthan/Folio/issues).
