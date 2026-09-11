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

The following table preserves the preparation matrix before the first installed
round recorded below. That round includes sealed T17, T21 and T22 changes but
requires replacement after the attachment correction. T27's earlier installed DMG
predates those changes and is historical package evidence only.

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

Two additional initialize-only controls started two actual `npx pi-acp@0.0.33`
processes against a new private shared npm cache without a model request: one
used the same cwd and one used separate title/main directories. Both processes
initialized and exited zero with no stderr in both controls. These runs did not
reproduce the desktop failure and do not disprove a concurrency defect. No startup
policy is changed from that inference; final package cold-cache/readiness evidence
remains outstanding.

## First installed combination: 9ef3b504

A clean checkout of `9ef3b5048a9a3d5efb331b887914fe4c0bd90ebf` was built with
`pnpm e2e:build` and the existing Electron package command for macOS arm64 DMG.
The package embeds that exact `folioSourceCommit`, disables signing-identity
discovery and uses `--publish never`. The DMG was verified, mounted read-only,
copied into a private installation directory and detached. The copied app passed
`codesign --verify --deep --strict`; no Developer ID or notarization was used.

- DMG SHA256: `2d325a64b90a3b5bf5dca9d65b086f0062de943563b9d1a2fe75741cf5465711`.
- Installed ASAR SHA256: `19fa091a2e0283d4fc62a56ec277e075861393d765272c408e63154ec858d0c5`.
- Evidence round: `folio-t28-9ef3b504-7lbyjcg6` in the host temporary directory.
  Its `package-identity.json`, build/package/install logs and individual native
  logs are private acceptance artifacts, not captured conversations in Git.

The installed harness exposed two acceptance-tool defects: macOS canonicalized
`/tmp` to `/private/tmp`, and Playwright's Electron evaluation context rejected
dynamic imports. The tool now compares both user-data paths with `realpathSync`
and reads the running packaged manifest through `process.getBuiltinModule`.
Original boot-state paths remain in the evidence. Neither change relaxes package
or data-directory identity, and neither changes package bytes.

On this package, the extended Claude probe passed with native reference-image
bytes and native `Read` of the supplied graphic-design `SKILL.md`, manual edit,
native read, same-response stale-baseline Write refusal, valid Write/commit, and
same-byte explicit resubmission. Manual permission mode and actual `Allow Once`
interaction were recorded. The native Auto classifier requires its own model
protocol; generic synthetic model responses did not satisfy that classifier and
are not represented as successful Auto-mode permission evidence. The actual Send
button is used after attachment upload; an immediate Enter had left the staged
prompt unsent. Native tools include `Read`, `Write`, `Edit`, ordinary subagent
operations, `folio_render_preview` and `folio_resubmit_draft`.

A Pi installed round started with a new empty private npm cache and no prewarm.
It initialized, delivered reference-image bytes and the native skill read, and
completed the edit/read/Write/commit and explicit same-byte attempt checks. Its
actual model tool catalog was `read`, `bash`, `edit`, `write`,
`folio_resubmit_draft`; no image or render MCP tool was present. A separately
prepared-cache round completed cancellation, provider failure and independent
final CAS conflict preservation, reopen and explicit continuation, followed by a
real Pi-to-Claude switch with new native read evidence and commit. Both Pi rounds
then failed teardown with `ENOTEMPTY`; their functional checkpoints do not make
the complete runs pass. The prequit observed PIDs had exited and the endpoint was
released, but an empty session directory remained during recursive removal.
The responsible writer is not yet established; no retry or global process kill
is used to conceal the failure.

The installed built-in P0 and P1 probes exited zero, including source preview,
source import, watcher and multiple-consumer assertions in the existing P1
facility. The configured Claude image probe also exited zero with an explicit
required model, synthetic generation and edit service requests, reopened native
canonical rendering, native image reading, committed replacement, failed service preservation and
stale reference rejection. These prove protocol and packaged paths with synthetic
inputs, not the quality or availability of paid image services.

An initial reference attachment card also reported that its local attachment was
not present in the session, despite actual bytes reaching the native model. The
root task is investigating the history-gate ordering while retaining strict
attachment ownership validation. A relevant product correction requires a new
sealed package baseline; these results remain explicitly attached to `9ef3b504`.
The five-Agent Issue remains incomplete and retains every open/blocked matrix cell.

A follow-up Pi probe now stops synthetic HTTP admissions, tracks outstanding
handler promises and awaits their completion before harness teardown. A private
I/O trace control still reproduced the same `ENOTEMPTY`: no handler was active
at drain, the last probe-owned store operation preceded application close, and
no traced probe write occurred during removal. This rules out that particular
late-handler explanation for this control; it does not identify the actual writer
or establish a lifecycle repair. The failed exit remains a blocker for clean Pi
installed acceptance.

A no-model installed discovery pass selected the pinned Codex, Kimi and Grok
executables with private homes and synthetic credentials. Each actually started
its packaged ACP route, but none reached the UI Ready state with those credentials.
These are launch/authentication observations, not authenticated capability or
end-to-end design passes. Their known hook gaps remain independently blocking.

The replacement-package Claude probe additionally requires the initial sent
reference attachment to be visible, complete and have nonzero natural width.
That new assertion is pending the corrected package; it cannot be satisfied merely
by delivering image bytes to the model or by absence of an error string.

## Replacement package: b86a1c92

The replacement was built from clean
`b86a1c92aa529511c4390dc057649bbb00a53f50`, which includes the attachment history
gate correction. Its private installed copy again passed DMG verification and
read-only mount/copy/detach, signature verification, embedded CLI boot/native
bindings and packaged Bento checks. The existing `e2e:build` passed before
packaging; acceptance-only script changes below do not change these package bytes.

- DMG SHA256: `22fb673c62f4277386f15c5f47689a53fcc59e486d87ef3935884b9274a16a20`.
- Installed ASAR SHA256: `eef1beb7a270afb515db8c1d04e09da3f2c4c8c00f8250a766a0b3a10144d5bb`.
- Evidence round: `folio-t28-b86a1c92-24v1tix4` in the host temporary directory.
  `runtime-files.json` rechecks the six selected runtime/ACP files against the
  preparation hashes and records hashes/paths of the actual packaged adapters.
  All selected file hashes matched; this does not substitute for authentication.
- Harness used for these T28 runs: source `b86a1c92`. T29's subsequent optional
  restart facility has separate ownership and validation; it did not build this app.

The replacement Claude round exited zero after the sent attachment itself became
visible with a real `lody-resource://file/…` URL, `complete: true` and
`naturalWidth: 1`. Reference bytes, skill text, Manual/Allow Once permission,
read-baseline refusal, valid writes/commit and explicit same-byte resubmission
also passed. The initial replacement attempt used an exact original filename
locator; uploaded attachment names have a numeric prefix, so that tool-only
locator was corrected to match the known filename suffix. The pixel-load
assertion was retained. That initial locator failure is not an application failure
or a passing complete round. Successful Claude probes now preserve CLI logs as
well as the harness diagnostics for subsequent executions.

Replacement Pi cold-cache and prepared-cache recovery rounds again passed their
functional checkpoints and again exited one during directory removal. Cold input
and skill delivery, native read/write/commit, same-byte attempts, cancellation,
provider failure, independent CAS conflict, explicit continuation and the real
Pi-to-Claude switch are recorded as functional observations with failed cleanup,
not complete passes. No permission-prompt interaction was exercised for Pi;
its native extension UI permission route is not inferred absent. The actual Pi
catalog still lacks the Folio image/render MCP tools, which does not imply lack
of native image input or all other Agent capabilities.

The replacement P0 and P1 probes exited zero. The replacement configured-image
probe also exited zero for explicit model selection, generation/edit wire calls,
actual native image reads, no premature canonical commit, exact asset replacement,
reopened native canonical rendering, failed-service preservation and stale
reference refusal. Source-preview/import behavior is separately covered by P1;
these separate probes do not establish an unexecuted combined image-edit/source-
preview journey or paid-service visual quality.

The root's additional immutable-9ef teardown observation kept CLI log read file
descriptors open through the original recursive removal. It recorded graceful
supervisor shutdown, ACP termination and document unload before application exit,
then the same `ENOTEMPTY`. Neither synchronous nor asynchronous probe-owned I/O
was observed writing during deletion. Directory timestamps place the empty
`chats/<session>` directories in the shutdown/removal second, but the responsible
writer remains unidentified. Evidence is retained in
`/tmp/folio-root-teardown-UkZ0KW` and `/tmp/folio-root-pi-teardown-trace.log`.
Neither this observation nor the provider-drain control establishes a lifecycle
repair. No delay, retry, pre-termination of the daemon or global process kill is
used to make a failed round appear successful.

| Required behavior on the replacement              | Codex           | Claude                                  | Pi                                        | Kimi            | Grok            |
| ------------------------------------------------- | --------------- | --------------------------------------- | ----------------------------------------- | --------------- | --------------- |
| Authenticated installed runtime/tool discovery    | Not established | Observed                                | Observed, cleanup failed                  | Not established | Not established |
| Actual reference bytes / native skill read        | Not executed    | Passed                                  | Observed, cleanup failed                  | Not executed    | Not executed    |
| Native permission request and response            | Not executed    | Manual / Allow Once passed              | Not exercised                             | Not executed    | Not executed    |
| Manual edit → native read → write → commit        | Hook blocked    | Passed                                  | Observed, cleanup failed                  | Hook blocked    | Hook blocked    |
| Stale refusal / explicit same-byte attempt        | Hook blocked    | Passed                                  | Observed, cleanup failed                  | Hook blocked    | Hook blocked    |
| Cancel / fail / final CAS / explicit continuation | Not executed    | Only fresh-read switch destination here | Observed, cleanup failed                  | Not executed    | Not executed    |
| Configured image generate/edit and actual read    | Not executed    | Synthetic protocol passed               | MCP tools not exposed in observed catalog | Not executed    | Not executed    |
| Complete per-Agent installed matrix               | Incomplete      | Incomplete                              | Incomplete                                | Incomplete      | Incomplete      |

The original seven Issue criteria remain the acceptance target. Missing/error/
uncovered-hook evidence from adapter development is not promoted to an installed
native pass, nor is final CAS substituted for a missing generation fence. Windows,
Linux, real paid model/image quality, human visual judgment and remaining
per-combination interactions are still unexecuted. T28 remains **blocked and
incomplete**, including the three documented native runtime hook gaps and the
unresolved Pi teardown failure.

The replacement no-model discovery runner exited zero while recording
`ready: false` for each Codex, Kimi and Grok configuration. Its bounded UI
observation and actual ACP startup logs are in `folio-t28-discovery-2JMvhB`;
runner exit zero means the observations were collected, not that authentication
or those Agent capability cells passed. All homes, keys and configuration in
this runner were private synthetic inputs.
