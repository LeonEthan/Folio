# Editor-owned current PPTD and noninvasive reminders

Status: implemented
Translation: pending

## Abstract

Human canvas saves previously needed an Agent read hook to refresh the current
PPTD. Saves now publish that representation next to canonical storage, independently
of Agent execution, and reopen verifies actual file contents before reuse. Runtime
hooks give public reminders; generation/read-proof ledgers and tool interception
are removed together with their final-collection gates. Independent validation,
canonical version checks, draft isolation and genuine native terminal failures
remain. Canonical save and projection publication are separate operations, so a
partial failure is explicit and recoverable rather than reported as a complete save.

## Decision and responsibilities

This implements the approved continuation described by
[editor-owned save](../../proposed/simplification/2026-09-12-editor-owned-pptd-save.zh.md)
and [noninvasive hooks](../../proposed/simplification/2026-09-12-noninvasive-design-hooks.zh.md).
It replaces the generation/read mechanism in the historical
[Pi implementation](../architecture/2026-09-11-pi-design-hooks.md) and
[Claude implementation](../architecture/2026-09-11-claude-design-hooks.md), preserving
those decisions as source-version evidence rather than rewriting their history.
Their removed manual probe scripts are reproducible from the original source
commits named in those notes; they do not describe the new runtime contract.

The existing store owns the canonical self-contained document and assets and
already serves human save, import and Agent commit. Its create/save/idempotent retry
path now exports current PPTD under the same artwork lock. The fixed destination is
`<dataRoot>/chats/<artworkId>/design-current`, derived from trusted workspace facts;
no persistent projection registry or per-version directory is needed. Existing
project-local projections and Agent drafts remain untouched. Session cwd does not
change. Read-only draft previews still watch their exact draft sources.

Each publication writes and fsyncs staging files, moves the previous fixed directory
aside, and publishes staging. A marker records revision and hashes, but readiness
also compares every collected file against canonical export. A replaced/missing
file with an intact marker therefore fails verification. A failed second rename
leaves canonical durable and current files unavailable; retry/reopen re-exports the
same current canonical payload. Temporary leftovers are cleanup, not history.
Healthy reads remain lockless; repair acquires the artwork lock and re-reads latest
canonical. Dispatch verifies readiness after editor flush. Frozen input recovery
never changes a prior baseline merely because projection contents changed.

A persistent projection registry was unnecessary because the canonical artwork
already has stable storage. Publishing only on Agent reads was rejected by the
changed requirement: a human save must work with no runtime. Cross-file atomicity
is not claimed; an explicit persisted-canonical/publication-failed error and blocked
dispatch cover that boundary without rolling back user edits.

## Runtime and commit contract

Pi public `before_agent_start` and Claude `UserPromptSubmit` deliver the shared
read-before-edit reminder. No generation ledger, coverage accumulation or custom
Write/Edit gate remains. The bounded existing RPC version becomes 2 and accepts
native Pi start/settlement, explicit submission and capability requests; version 1
proof requests fail protocol validation rather than fabricating support.

Explicit submission supplies `expectedRevisionId` and `artifactDigest`; the shared
service checks both against actual current canonical and draft bytes. Final
collection requires a matching artwork/path/digest before using that revision.
Pi, Claude, Codex, Kimi and Grok share this existing launch-bound submission route;
non-Pi runtimes cannot supply Pi terminal events. Speculative processes created
before durable design identity are recreated through ordinary startup, ensuring
that their MCP context carries the correct launch/source registration.
Normal changed output uses the frozen turn baseline; unchanged inherited output
still requires explicit submission. Neither re-reading nor same-byte writes
silently choose a newer base. Structure, kernel replay, assets and CAS remain
independent of reminders or submission.

Pi ACP's lossy error translation still requires its real native settlement status.
The thin adapter uses an execution ID rather than model-generation identity;
unknown/error/cancelled results cannot become synthetic success. Existing current
client, launch, source-turn and canvas-owner fences reject delayed producers.
Native tool guards belong to the runtime; shell/custom tools are not sandboxed by
Folio. No paid retry or automatic turn restart was added.

## Verification and limits

Targeted deterministic tests cover no-Agent create/human save, draft preservation,
canonical-adjacent path resolution, actual file replacement/deletion, failure after
renaming the previous projection, exact retry recovery, frozen turn replay,
explicit revision/digest mismatch, ordinary changed output without read evidence,
unchanged submission, native failure/cancellation and stale runtime producers.
The initial full `corepack pnpm check` passed, including typecheck, lint, CI tests,
platform and public boundary guards. The final full check also passed after the five-runtime
registration correction: 2,664 CLI tests and 3,288 component tests passed, with the
existing explicit skips retained. Root format,
docs check and diff checks passed. The CLI dev bundle built; its Claude hook
subprocess accepted synthetic UserPromptSubmit input and emitted the reminder,
while retired PreToolUse input produced no tool interception output. The built Pi
extension registration smoke check exposes only public reminder/native terminal
events and exact submission, with no read/tool/generation interceptor.

Local evidence logs: `/tmp/folio-t05-revised-check.log`,
`/tmp/folio-t05-revised-final-check.log`, `/tmp/folio-t05-revised-assets.log`,
`/tmp/folio-t05-revised-runtime-submission.log`,
`/tmp/folio-t05-revised-built-claude-hook.log`,
`/tmp/folio-t05-revised-built-pi-extension.log` and
`/tmp/folio-t05-revised-docs-check.log`. These contain synthetic test/check output;
no captured user or model transcript is committed.

This revised change has not launched Electron or a paid model. Earlier native
runtime evidence proves the prior event surfaces only; it is not presented as
end-to-end verification of this new save/reminder path. Pi launch/MCP and Codex
reminder adaptations are coordinated owner changes and require integration checks.
The exported PPTD retains the existing lossless conversion and asset checks;
projection does not establish visual quality or change Bento's independent editor.
