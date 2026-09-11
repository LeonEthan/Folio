# Installed five-Agent capability matrix

Status: proposed
Translation: pending

## Abstract

[Issue #30](https://github.com/LeonEthan/Folio/issues/30) requires evidence from
the installed Folio application for each selected Agent. Source probes and a
working package alone do not establish that combination. This acceptance work
reuses the existing Electron harness with an explicit installed executable,
retaining its isolated profiles, endpoint, logs and teardown. The full matrix
remains blocked by the documented Codex, Kimi and Grok runtime hook gaps; passing
other cells cannot close those requirements. No Agent is selected on the user's
behalf and no paid service quality is inferred from synthetic protocol inputs.

## Ownership and requirements

This is the package-combination follow-up to
[T27 package verification](../../implemented/testing/2026-09-11-packaged-design-verification.md).
The [Spec](../../../../specs/graphic-design-platform.zh.md) and
[scope review](../simplification/2026-09-11-design-result-feedback.zh.md) retain
their existing target. Runtime-specific hook investigations remain owned by
[Codex](../architecture/2026-09-11-codex-design-hook-boundary.md),
[Kimi](../architecture/2026-09-11-kimi-design-hook-boundary.md), and
[Grok](../architecture/2026-09-11-grok-design-hook-runtime-gap.md).

The Issue was freshly read with its body, comments and state on 2026-09-11; it
was open with no comments. Its seven criteria are retained:

1. Record installed-package runtime/ACP versions, launch and tool paths and
   platform for Codex, Claude Code, Pi, Kimi Code and Grok Build.
2. Verify discovery, actual reference-image input, skill material, permission
   requests, cancellation/explicit continuation and manual edit → native read →
   write → formal commit for each combination.
3. Preserve evidence for successful reads, stale writes, same-byte explicit new
   attempts, missing/error/uncovered hooks and independent final version checks.
   Do not claim comprehensive Shell interception.
4. Verify configured image generate/edit, required model, live results and actual
   image reading subject to user authorization/configuration; record unexecuted
   calls explicitly.
5. Distinguish packaged configuration, resources and startup from adapter
   development evidence. Claim only the actual combinations passed; the user
   always chooses the Agent.
6. Reuse acceptance facilities and synthetic inputs. Keep captured user/Agent
   conversations outside Git; provide facts, reproducible steps and limits.
7. Update affected documentation and the owning decision record; run checks
   proportionate to the risk and disclose missing validation.

## Preparation inventory

These are inspected local runtime files and pinned source identities, **not yet
installed-package acceptance**. Platform: macOS 26.6.2 (25G83), arm64; Node
22.22.0, pnpm 10.20.0. All unchanged submodules were initialized for dependency
and documentation validation; Kimi remains outside root pnpm.

| Agent       | Runtime                                         | ACP                                   | Inspected executable / launch                                                                   |
| ----------- | ----------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Codex       | 0.153.4                                         | acp-extension-codex 1.10.0            | Managed `bin/codex`; adapter starts `app-server` using `CODEX_PATH`                             |
| Claude Code | native 2.1.258, SDK 0.3.258                     | acp-extension-claude 0.70.0           | Managed `claude`; built-in bundled `claude-acp.js` and explicit native path                     |
| Pi          | 0.85.1                                          | pi-acp 0.0.33                         | `/opt/homebrew/bin/pi`; registry adapter plus Folio executable shim using `PI_ACP_PI_COMMAND`   |
| Kimi Code   | 0.39.1-lody.f255222661c9; native reports 0.39.1 | bundled @moonshot-ai/acp-server 0.0.1 | Managed `package/dist/main.mjs acp` under Node; source f255222661c9cc2842901858fd28e554d7796a51 |
| Grok Build  | 1.0.13 (5e9a58528b76)                           | acp-extension-grok 0.1.0              | Managed `grok`; adapter starts `agent stdio` using `GROK_PATH`                                  |

The source pins above do not prove bundled adapter bytes. Each installed round
must separately record its embedded source commit, package hash, actual launch
paths and runtime versions. Machine-specific runtime file paths and hashes are
retained in the private acceptance evidence handed to the task owner.

| Runtime tool route | Existing adapter-development evidence, before installed acceptance                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex              | `exec_command` maps to native `Bash` hooks, `apply_patch` has native hooks; interactive `write_stdin` has no separate prehook. MCP forwarding is source-inspected only.                                                                             |
| Claude             | Native `Read` / `Edit` / `Write`, `UserPromptSubmit` / `PostToolBatch` fence, and namespaced `mcp__lody__folio_resubmit_draft`; ordinary child tools retain their scope. Bash is not comprehensive design interception.                             |
| Pi                 | Native `read` / `write` / `edit`, extension generation events and explicit `folio_resubmit_draft`. `bash` and custom tools are outside the guard. Pinned pi-acp does not forward MCP; this does not imply native image reading is absent.           |
| Kimi               | Native `Read` / `Write` / `Edit` hooks; `Bash` needs ACP terminal capability. Complete read delivery, reliable refusal and generation boundary are not available from the audited hooks.                                                            |
| Grok               | Native `read_file` / `write` / `run_terminal_command`; `search_replace` remains unverified. SDK prehooks are requests, SDK posthooks notifications, file posthooks awaited. None identifies an acknowledged model-generation or last-tool boundary. |

## Execution method and open matrix

The existing [harness](../../../../e2e/src/support/electron-harness.ts) accepts
`FOLIO_E2E_INSTALLED_EXECUTABLE`. A packaged executable locates its own packaged
entry; the harness never passes a source directory to it. Development runs retain
their existing directory launch. Both paths assert the actual isolated user-data
directory. Installed runs additionally assert `app.isPackaged`, and record
application/executable paths. This avoids a second test engine and accidentally
testing development code with an installed Electron binary. See the
[run instructions](../../../../e2e/README.md#installed-folio-acceptance).
Installed runs require `FOLIO_E2E_EXPECTED_SOURCE_COMMIT` and compare it to
`folioSourceCommit` read inside Electron from its own packaged manifest; an absent
or mismatched source identity fails the run.

Final package execution is pending a source baseline containing the sealed T17,
T21 and T22 changes. T27's earlier installed DMG predates those changes and is
historical package evidence only. No final acceptance run is represented here yet.

| Required cell                                                     | Codex   | Claude  | Pi      | Kimi    | Grok    |
| ----------------------------------------------------------------- | ------- | ------- | ------- | ------- | ------- |
| Installed discovery / exact launch and tool paths                 | Pending | Pending | Pending | Pending | Pending |
| Reference-image bytes actually delivered                          | Pending | Pending | Pending | Pending | Pending |
| Skill material delivered                                          | Pending | Pending | Pending | Pending | Pending |
| Permission request / response                                     | Pending | Pending | Pending | Pending | Pending |
| Cancel / explicit continue                                        | Pending | Pending | Pending | Pending | Pending |
| Manual edit → native read → write → commit                        | Blocked | Pending | Pending | Blocked | Blocked |
| Stale refusal / same-byte explicit attempt                        | Blocked | Pending | Pending | Blocked | Blocked |
| Missing/error/uncovered hook / independent final CAS              | Pending | Pending | Pending | Pending | Pending |
| Generate/edit + required model + live preview + actual image read | Pending | Pending | Pending | Pending | Pending |

Blocked means the required native seam is absent in the audited distribution;
pending means no installed round has established the claim. Neither means passed.
Codex has no awaited pre-generation seam; Kimi's truncated asynchronous posthook
and fail-open prehooks cannot satisfy the contract; Grok lacks generation/batch
identity. Grok's file posthooks do await, whereas SDK posthooks are notifications.
No partial adapter, generation inferred from tool arrival, runtime fork or relaxed
commit check is substituted. Final CAS cannot supply a missing same-turn hook.

Windows/Linux native execution and human visual-quality judgment remain separate
unexecuted cells. The historical cross-host package/resource checks do not cover
them. No paid image/model service call, user configuration change, Developer ID signing,
notarization, upstream publication or GitHub mutation is authorized by this work.
Existing local ad-hoc macOS packaging is allowed, with signing-identity discovery
disabled and publishing explicitly set to never.

## Preparation checks

Frozen-lockfile dependency installation, `pnpm e2e:check`, the full `pnpm check`,
documentation checks and `git diff --check` passed on preparation source
`37dba83` plus these acceptance changes. These checks establish tooling and source
consistency only; no installed cell is promoted by them. An earlier check overlapped
a prerequisite fast-forward and mixed cached old Claude code with its new tests;
it was discarded, the nine focused hook tests passed, then the complete frozen
check was rerun successfully. Later prerequisites require a fresh final check.

Two predecessor native rounds reported incomplete teardown: T21 saw `ENOTEMPTY`
while removing its isolated data, and T22 reached its UI checkpoint but hung in
shutdown. The existing harness now persists close-phase diagnostics, bounds trace
stop and performance-session detach with its existing deadline helper, and records
its own prequit process tree using the existing resource probe. It refuses data
removal when an observed owned process still exists or an earlier shutdown stage
failed. This is not yet a reproduced lifecycle repair; final native execution
must establish which phase or process is responsible. No sleep/retry loop or
global process termination is added. Windows lacks this POSIX process-tree probe;
its existing endpoint and owned Electron process contract remains separate.

The preparation `e2e:build` and `e2e:smoke` passed on macOS arm64: three scenarios,
18 steps, with clean trace/detach/application-close/endpoint/directory completion
and no surviving observed owned processes in all three rounds. This is development
desktop regression, not final installed-package or native Pi/Claude acceptance.
The original T21/T22 teardown failures are not declared repaired by this result.

A separate cold Pi startup failure in T21 is retained for installed discovery
investigation. Its title Agent and main Session launched the same pinned npx
package nearly together; extraction ENOENT and the main process exit preceded
the title startup's recorded purge/retry. That ordering does not prove the later
purge caused the earlier failure. Prewarming may isolate functional hook testing,
but cannot establish that first-use installation/discovery works. No runtime or
cache-policy change is included in this preparation checkpoint.
