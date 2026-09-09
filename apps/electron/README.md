# Lody Electron

Lody desktop application built with Electron, React, and TypeScript.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Open-source desktop development

From the repository root, build the embedded CLI and OSS renderer, then launch
Electron with the bundled CLI:

```bash
pnpm start:local
```

This is the normal OSS development entrypoint. Fully quit an existing Lody
desktop process before running it because Electron enforces a single running
instance.

`pnpm --dir apps/electron preview:local` is a lower-level smoke/e2e command for
an OSS build that has already been prepared. It deliberately skips rebuilding
and should not be used as the normal development command.

### Build

Every build command below uses the local OSS renderer, embeds the local-only
CLI, and has no update publishing target or notarization identity.

```bash
# For Windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

### Folio P0 design sample

The File menu opens the fixed Folio sample and exports PNG/JPEG. Both development
and packaged builds include the pinned Bento resources; no adjacent checkout is
needed. See [Bento resources](../../packages/design-bento/README.md) for the source
closure and current scope. Folio local state uses `~/.folio`, independently of Lody.

Run the built app with `--folio-p0-verify=<output-directory>` and an isolated
`LODY_DATA_DIR` to check save/reopen, image dimensions, PNG transparency and JPEG
white compositing. The same probe works with the installed executable.
