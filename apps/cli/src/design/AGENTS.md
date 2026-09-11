# Design service invariants

Root and CLI instructions apply. `CLAUDE.md` links to this file.

- Canonical BentoDoc and assets are read as one store payload. Publish only the
  fixed resolved projection directory; temporary publication directories are not
  history. Never synchronize over drafts or frozen turn input.
- Successful complete returned ranges, artwork, draft, revision and assistant
  generation establish read evidence. Tool-call arrival or a fresh filesystem
  hash is not a successful read. Duplicate ranges and partial subsets cannot attest a whole file; failed results
  contribute no coverage.
- A generation captures eligible reads before its tools execute. Never authorize
  old Write/Edit arguments from a same-generation read or mutate an existing
  attempt when later reads succeed.
- Controlled write success binds the exact artifact digest. Pi final collection
  requires live daemon evidence independently of writable manifests, then runs
  existing structural/assets/CAS checks. Missing evidence preserves drafts.
- Pi is a thin native event adapter, not a sandbox. Ordinary files remain outside
  design path guards; do not infer complete shell/custom tool coverage.

See [runtime and files](README.md) and the
[decision](../../../../.agents/notes/implemented/architecture/2026-09-11-pi-design-hooks.md).
