# Grok Build design-hook runtime gap

Status: proposed
Translation: pending

## Abstract

Grok Build 1.0.13 has working native file and client hooks, but the inspected
interfaces cannot freeze a design attempt before each model response generates
its tool arguments. Tool hooks expose an individual tool ID, without a model
response identity or an explicit last-tool boundary; the client post hook is also
an unacknowledged notification. Implementing the design adapter from those events
would require inventing a generation boundary, which could bless already-generated
writes with a later read. T20 remains blocked with its acceptance criteria intact;
this change records native evidence and a repeatable probe, and adds no runtime
adapter or support claim.

## Scope and ownership

This is the runtime audit for [Issue #22](https://github.com/LeonEthan/Folio/issues/22),
on the shared [Pi hooks](../../implemented/architecture/2026-09-11-pi-design-hooks.md)
and [explicit-attempt contract](../simplification/2026-09-11-design-workflow-convergence.zh.md).
The [Spec](../../../../specs/graphic-design-platform.zh.md) remains draft. The
[scope review](../../proposed/simplification/2026-09-11-design-result-feedback.zh.md)
continues to bound migration. No shared service, Session lifecycle, Bento editing,
projection, final collection or canonical storage code changes here.

The required facts remain: successful **delivered** complete text/ranges; an
attempt generation frozen before model arguments with exact draft digest/epoch;
same-response reads cannot bless writes from that response; an explicit no-argument
resubmission consumes only its frozen read and digest; old calls/results cannot
borrow a newer attempt. Final canonical compare-and-swap is independent of hooks.
A preview is neither a commit nor a read baseline.

## Exact inspected combination

- Official executable: `grok 1.0.13 (5e9a58528b76) [stable]`, macOS arm64. Native
  help identifies **Grok Build TUI**, not a Grok model in another harness.
- Executable SHA256:
  `8669e0fdadceec25b8c159c355f427ffbd82583525d774b6ab1522197ea83b80`.
- Compatibility adapter: `acp-extension-grok@0.1.0`, pinned public submodule
  `77a994f4e0a5acec8c52020c0a8e01b0e90aaef9`. Its unchanged
  `src/runtime-process.js` launches `GROK_PATH agent stdio` and disables the native
  updater. `runtime-manifest.json` pins official version/minimum 1.0.13; no runtime
  is built from that adapter repository.
- ACP initialization reports protocol version 1 and native version 1.0.13. Its
  `x.ai/hooks.blockingEvents` are `pre_tool_use`, `stop`, `subagent_stop`.
- The executable extracts its own `docs/user-guide/10-hooks.md` under the isolated
  `GROK_HOME`. That bundled document SHA256 is
  `3690762505faa65d6a82e6462abeaa20fe3a127de611021c171f9088f2c2e56f`.
  It lists session, user-turn, tool, stop, subagent and compaction events; none
  establishes an awaited before-model boundary.

The official [published source](https://github.com/xai-org/grok-build/tree/37949780c144e37df692e3d669051a21fec24f20)
was inspected at `37949780c144e37df692e3d669051a21fec24f20`. Relevant files are
`xai-grok-hooks/src/event.rs`, `xai-grok-shell/src/extensions/hooks.rs` and
`xai-grok-shell/src/session/acp_session/hooks.rs` under `crates/codegen/`.
That source is **not** claimed to reproduce this native binary: fetching the short
embedded build revision failed, and current source/docs contain newer post-hook
output behavior. Runtime observations and the binary's bundled docs take
precedence over current website descriptions.

## Native observations

The committed [manual probe](../../../../apps/cli/scripts/probe-grok-design-hooks.mjs)
launches the actual pinned compatibility adapter and official executable. Only
model responses are synthetic, served through a loopback Chat Completions endpoint
in a temporary custom-model config. It uses an explicit child environment without
inherited model credentials, disables telemetry and discovered unrelated plugins
inside its temporary Grok home, and leaves user global config untouched. Captured
native events and model requests stay outside Git.

Run after installing root dependencies and building `acp-extension-core`:

```sh
FOLIO_PROBE_GROK=/absolute/path/to/official/grok \
  node apps/cli/scripts/probe-grok-design-hooks.mjs
```

The successful round retained its evidence under
`/var/folders/dn/56hdvtt50g19brtctz0c9c7w0000gn/T/folio-grok-hooks-MS8IKs`.
`summary.json` records event ordering and native tool outcomes; the externally
observed model request number is a **probe oracle**, never an adapter protocol.

| Case                          | Actual observation                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session client-hook loading   | `_meta["x.ai/hooks"]` on actual `session/new` loads callbacks; pre hooks arrive as `_x.ai/hooks/run` requests and post hooks as `_x.ai/hooks/event` notifications.                                       |
| Normal file tools             | Native `read_file` returns `FileContent` with raw bytes and line-anchored rendered content; native `write` creates the expected file.                                                                    |
| One model response, two calls | A single scripted response emits Read and Write. Both pre-hook payloads already contain generated arguments; neither carries a model-response ID, batch size or last-tool flag.                          |
| Refusal                       | A pre-hook `deny` prevents its target file, then the model proceeds to another response.                                                                                                                 |
| Hook error                    | A pre-hook JSON-RPC internal error fails open; the target contains the requested bytes.                                                                                                                  |
| Hook timeout                  | A callback with actual `timeout: 1` and no response times out natively and permits the write. The probe uses the runtime timeout, not an arbitrary sleep.                                                |
| Large delivered read          | A 60,001-byte file is read, but its post-hook serialized result is replaced by a truncated string with `toolResultTruncated: true`. A fresh disk read cannot stand in for the missing delivered payload. |
| Missing file                  | Native `post_tool_use` still fires with `ReadFile.FileNotFound`; the event name alone is not evidence of successful delivery.                                                                            |
| Shell failure                 | Native `run_terminal_command` exiting 9 emits `post_tool_use`, with `Bash.exit_code: 9`; it must not establish a successful design read.                                                                 |
| Cancellation                  | Cancelling the session while the write pre hook is pending produces `cancelled`; the target is absent. No success fact is inferred.                                                                      |
| Unknown generation event      | Registering `BeforeModel` does not yield that event. The bundled event catalog and public source contain no equivalent generation or last-tool event.                                                    |

A separate local file-hook probe used an isolated `GROK_HOME/hooks/probe.json`
with native command handlers. It established real pre/post file hook loading and
an exact successful `FileContent` result. Holding the post-hook command response
blocked model advancement until the native hook timeout; increasing the timeout
kept the next request blocked until probe cancellation. **File post hooks must not
be described as fire-and-forget.** SDK post hooks are a different interface and
remain notifications with no acknowledgement. That exploratory file-hook probe
is local evidence, not a committed regression fixture.

Process `--plugin-dir` and session `_meta.pluginDirs` were also tried in that
exploratory probe. The native debug log discovered the plugin with `has_hooks=true`,
but `_x.ai/hooks/list` did not list its hooks; the isolated global hook file did
appear and execute. This is a bounded negative observation, not a claim that all
Grok plugin configurations fail. Project trust/config loading, actual MCP tools,
`search_replace`, platform variants and hook-absent native design commits remain
unverified.

## Why a thin adapter cannot yet satisfy T20

File hook envelopes provide `toolUseId`, input, result and truncation flags, plus
session/path/timestamp metadata. Tool envelopes observed here lack even the
turn-level `promptId`; they have no generation ID or batch-completion boundary.
Ordinary ACP ToolCall notifications include `promptId`, `streamStartMs` and
`turnStartMs`, but arrive after model argument generation. Timestamps and passive
arrival order do not freeze draft bytes before the response starts, and do not
provide an awaited last-tool boundary before the next response.

Awaiting a file post hook proves the handler can finish before continuation; it
does not prove it is the last call in that generated response. Incrementing a
counter on every pre hook would let a same-response read establish evidence for
an already-generated write. Advancing on every post hook has the same problem.
Parsing the transcript or inferring batches from timestamps/tool arrivals would
create a second, undocumented protocol. Freezing only at user dispatch prevents
legitimate read/retry within the turn, so it does not meet acceptance either.

No thin adapter is therefore enabled. Reopening implementation requires an actual,
distributed native seam that freezes generation before arguments, or an equivalent
awaited response boundary with unambiguous batch identity/completion. Complete
successful result delivery must also be established for every claimed read path,
with errors and truncation rejected or covered by exact native ranges. An
unpublished runtime fork, silent output repair, fresh filesystem hashes, a new
scheduler or weaker read-only/commit rules are not substitutes.

## Acceptance and verification limits

T20 remains **BLOCKED**, not done. Identity/version, native SDK registration and
the audited tool behaviors are proven only for the combination above. The full
normal design commit, stale-write rejection, conflict re-read/retry, same-byte
explicit resubmission and missing-hook final canonical protection are not proven
for Grok. The shared final CAS remains necessary and unchanged; existing generic
tests are not a substitute for those native acceptance journeys. No paid provider
was called and no GitHub mutation, publication, runtime pin or submodule gitlink
was changed.

Validation: root `corepack pnpm check` passed (typecheck, lint, full tests, i18n,
import and public/platform boundary guards); root `corepack pnpm format`,
`corepack pnpm run docs check`, `node --check` for the probe and `git diff --check`
also passed. Child checks filtered inherited `ANTHROPIC_*` and `CLAUDE_CODE_USE_*`
keys without printing values. The docs check required initializing the unchanged
pinned Kimi submodule to resolve an existing documentation link; it remains outside
root pnpm. Existing rule-file size warnings remain. No Spec approval is claimed;
translation remains pending.
