# Design service invariants

Root and CLI instructions apply. `CLAUDE.md` links to this file.

Target revision (2026-09-12): human saves publish PPTD independently; retain public
read-before-edit reminder hooks and native guards. No runtime patches or new
generation proofs. See the [transition](../../../../.agents/notes/proposed/simplification/2026-09-12-noninvasive-design-hooks.zh.md).
The read/generation/attempt rules below describe the existing implementation until
its coordinated replacement across writes, resubmission and collection. Do not
extend them to other runtimes. Preserve CAS, source/draft isolation, real error and
cancellation handling, and stale-producer rejection through that replacement.

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
- Explicit resubmission alone may replace an attempt, binding the generation-frozen
  complete read and exact draft digest. Retire earlier generated calls/results;
  rereading and same-byte writes never authorize unchanged inherited output.
- Final conflicts preserve draft and durable diagnostics for explicit continuation;
  never create candidates, restart the Agent or require a finalize tool. Keep
  historical candidate readback and the independent P1 manual save-copy escape.
- Controlled write success binds the exact artifact digest. Pi final collection
  requires live daemon evidence independently of writable manifests, then runs
  existing structural/assets/CAS checks. Missing evidence preserves drafts.
- Pi is a thin native event adapter, not a sandbox. Ordinary files remain outside
  design path guards; do not infer complete shell/custom tool coverage.

See [runtime and files](README.md) and the
[decision](../../../../.agents/notes/implemented/architecture/2026-09-11-pi-design-hooks.md).

- Element mentions carry artwork, saved revision and stable IDs in ordinary prompt
  text. Frozen-input creation and recovery validate them against canonical; stale
  references fail explicitly and never choose replacement targets.

Claude session hooks preserve existing settings. Use native UserPromptSubmit and
PostToolBatch to fence generations; individual tool completion cannot advance it.
Require successful final batch Read output. Select runtime policy from private
launch registration, and keep the native-version pin distinct from ACP/SDK pins.
MCP resubmission consumes the original native call identity; it never invents one.

Subagent events cannot change main-session read evidence or generation state.
Allow unrelated subagent tools; reject only native Write/Edit to shared controlled
design paths and design resubmission. This is not a shell/custom-tool sandbox.

Recovery and Agent switching bind native hooks and optional MCP resubmission to
Session's current spawn ID, client, source turn and canvas owner. Replacements
acquire fresh read evidence; delayed producers cannot update a replacement service.
Pi ACP end_turn loses native errors: require latest-generation native settlement
proof for collection, and route error/missing proof through existing turn failure.

- Design Agent selection changes only the next explicit turn. Freeze provider ID in
  Turn input, bind persisted ACP ID to its actual provider, and never resume an ID
  across providers. Replace the idle runtime under the existing turn guard; retiring
  callbacks cannot finalize or write into its replacement. Reuse history replay.

Reading a missing canonical artwork must not create its directory. Keep directory
creation in mutation operations and preserve their independent validation and CAS.
