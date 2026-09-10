# Package rules

- The root `AGENTS.md` "Design platform: agent-naive environment" section binds
  this package: intake performs structural validation only; nothing here may
  repair, re-run, or gate agent behavior.
- `src/contracts.ts` is the only import path into `packages/design-bento/vendor`.
  Vendored code is never edited here; adaptations belong in this package.
- The frozen capability matrix reaches runtime only through
  `src/generated/capability-matrix-bytes.ts` (built by `scripts/build.mjs`) plus
  the `FROZEN_MATRIX_SHA256` re-check in `src/capability-matrix.ts`. Never read
  the vendored `v1.json` via filesystem paths at runtime — that breaks under
  bundling.
- Upstream-adapted files (`.prettierignore` lists them) stay close to the pinned
  upstream for reviewable diffs; `source-manifest.json` records every migration
  and is enforced by the build.
- Skill directories must be self-contained after materialization: scripts may
  import only `node:*` builtins or the bundled `scripts/lib/folio-pptd.mjs`.
- `src/generated/` and `skills/graphic-design/scripts/lib/` are build outputs;
  never edit them by hand.
