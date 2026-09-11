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
not complete passes. The subsequent Pi extension authorization round below
exercised real permission interaction, also with failed cleanup. The actual Pi
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
| Installed runtime/tool discovery with isolated configuration | Observed; cleanup failed | Observed                                | Observed, cleanup failed                  | Passed (synthetic provider) | Observed; functional fixture failed |
| Actual reference bytes in native input           | Observed; cleanup failed | Passed                                  | Observed, cleanup failed                  | Passed | Path text only; bytes not established |
| Native skill read                               | Observed; cleanup failed | Passed                                  | Observed, cleanup failed                  | Passed | Not executed    |
| Native permission request and response            | Not executed    | Manual / Allow Once passed              | Extension No/Yes observed; cleanup failed | Default: Reject / Approve once passed | Not executed    |
| Manual edit → native read → write → commit        | Hook blocked    | Passed                                  | Observed, cleanup failed                  | Hook blocked    | Hook blocked    |
| Stale refusal / explicit same-byte attempt        | Hook blocked    | Passed                                  | Observed, cleanup failed                  | Hook blocked    | Hook blocked    |
| Cancel / fail / final CAS / explicit continuation | Cancel / continue observed; cleanup failed | Only fresh-read switch destination here | Observed, cleanup failed                  | Cancel / explicit continue passed; fail / CAS not executed | Not executed    |
| Configured image generate/edit and actual read    | Not executed    | Synthetic protocol passed               | MCP tools not exposed in observed catalog | Not executed    | Not executed    |
| Complete per-Agent installed matrix               | Incomplete      | Incomplete                              | Incomplete                                | Incomplete      | Incomplete      |

The original seven Issue criteria remain the acceptance target. Missing/error/
uncovered-hook evidence from adapter development is not promoted to an installed
native pass, nor is final CAS substituted for a missing generation fence. Windows,
Linux, real paid model/image quality, human visual judgment and remaining
per-combination interactions are still unexecuted. T28 remains **blocked and
incomplete**, including the three documented native runtime hook gaps and the
unresolved Pi and Codex teardown failures.

The replacement no-model discovery runner exited zero and recorded
`ready: false` for all three configurations, but subsequent inspection corrected
that aggregate interpretation. Codex and Kimi logs explicitly report
`Authentication required` at session creation. Grok's captured `GROK_HOME.txt`
has two `Ready` labels, making the fixture's singular exact-text locator
ambiguous. Its CLI log at 13:57:30.382Z explicitly records `ACP client ready`,
returned model/config capabilities and subsequent successful session close.
Thus Grok startup/config discovery was observed; its real model/tool operations
were not exercised by this runner. These records remain unchanged in
`folio-t28-discovery-2JMvhB/evidence`, with the Grok startup evidence at CLI log
lines 1271–1282. No real account authentication is inferred from synthetic
configuration, startup or the runner's exit status.


### Pi user-configured extension authorization follow-up

These two additional rounds used the unchanged installed `b86a1c92` app and
harness source `7409a417`; no installed bytes or product mechanisms changed.
The isolated `PI_CODING_AGENT_DIR/settings.json` loaded the pinned native Pi
0.85.1 distribution's existing `examples/extensions/permission-gate.ts` through
its `extensions` setting. That native `tool_call` handler waits for `ctx.ui.select`
before executing a matching Bash command and returns `block: true` on No.
The only operation was `rm -r --` against a disposable directory created by this
probe under its own temporary root, containing a synthetic ownership marker.

- `pi-permission-native.log` exited one before any provider/tool request because
  the fixture copied Claude's `Permission` / `Manual` selector. Captured landing
  content showed that Settings was already closed. Pi ACP 0.0.33 exposes model
  and thinking options, not a Manual permission mode; the missing selector was
  a fixture error, not a product defect. Its owned teardown finished normally.
  Evidence: `folio-t28-pi-permission-jgeP2j/evidence` under the same temporary
  parent as the package round.
- The corrected immutable runner `/tmp/folio-t28-pi-permission-2.mjs`
  (SHA-256 `b765830a99928c0aea2a53028062603c43d0125cffa0252826c15f6e04072fc9`)
  removed that nonexistent setting and explicitly awaited the actual permission
  buttons. In `pi-permission-native-2.log`, No returned the native tool result
  `Blocked by user` and preserved the marker; Yes returned `(no output)` and the
  marker's read failed with `ENOENT` after native Bash executed. Each pending
  permission screenshot was preceded by an assertion that the marker still
  existed, proving execution had not occurred before the response. Evidence:
  `folio-t28-pi-permission-BREBo3/evidence`, including `native-NO.json`,
  `native-YES.json`, both pending screenshots and CLI logs. The actual daemon
  logged two `pi-ui-*` permission requests at 14:26:34.650Z and 14:26:36.580Z.

This establishes user-configured native extension authorization through actual
ACP `request_permission` and the existing desktop controls. Both options in
Pi ACP's `select` mapping have `kind: allow_once`; No is enforced by the native
extension after the response. It does **not** establish an ACP `reject_once`
option, a built-in Pi permission policy, or a configurable Manual mode. A generic
confirmation or questionnaire alone would not establish operation authorization.
The external provider remained synthetic and the private ACP cache was prepared.

The corrected round still exited one: after zero active provider requests and
provider drain, application close began at 14:26:37.818Z, endpoint release and
removal began at 14:26:38.015Z, and removal failed at 14:26:38.056Z with
`ENOTEMPTY` for `/tmp/lody-e2e-POGP26/lody-data`. Native permission checkpoints
are observations within a failed complete round. No identical cleanup retry was
performed. A `terminal.list` request reported a missing terminal socket during
application close; this alone does not identify the directory creator.

The T21 teardown comparison also needs a narrower interpretation: its earlier
clean recovery run switched Pi to Claude before quitting, so it is not a clean
Pi-at-quit control. Subsecond birth-time evidence on the retained root diagnostic
(`/tmp/folio-root-teardown-UkZ0KW`, paired with
`/tmp/folio-root-pi-teardown-trace.log`) places real directory recreation at `.514` seconds inside its `.480`–`.571`
removal interval, strengthening the recreation finding without identifying the
writer. `Session.getWorkdir()` can recreate an absent default workdir through
`ensureDefaultSessionWorkdir`, but source reachability is not evidence that this
caller performed the observed write. The lifecycle failure remains unresolved.


### Codex ordinary-capability follow-up preparation and initial failures

The empty isolated Codex home used in discovery had no custom-provider
configuration. The actual ACP handshake succeeded, but native session creation
required authentication. The existing T18 native probe supplies a different,
explicit configuration: `CODEX_HOME/config.toml` selects a synthetic localhost
provider using `wire_api="responses"` and `requires_openai_auth=false`. The
installed follow-up reuses that configuration with the same native 0.153.4,
packaged ACP 1.10.0 and immutable `b86a1c92` app. It does not authenticate a paid
account or enable a partial design adapter. Harness source is `d37ebf8`.

- `codex-input-native.log` / `folio-t28-codex-input-bsFGCh/evidence` reached
  actual main and isolated title ACP sessions and localhost Responses requests,
  but its fixture assumed a top-level `body.tools` array and conflated helper
  traffic with the main request. The original 120-second input-completion
  assertion failed; the process exited one and owned teardown completed at
  15:06:50.126Z. CLI lines 443, 449 and 906 distinguish main startup, title
  startup and title prompt dispatch. No skill/cancel completion was established.
- `codex-input-native-2.log` / `folio-t28-codex-input-UAYd5V/evidence` preserved
  each native request separately. It still failed because its main-request
  classifier searched only top-level tools. `request-1.json` instead contains
  the actual reference in a user `input_image` block and a native
  `additional_tools` input item with namespace `functions`, custom tool `exec`,
  and its declared `tools.exec_command` interface. `request-2.json` has a
  distinct native thread identity and the explicit outer title-generation
  prompt. Both lack top-level `body.tools`. The same original 120-second
  completion assertion failed; exit one, owned teardown completed at
  15:12:12.438Z. Absence of that JSON field is not absence of native tools.

- `codex-input-native-3.log` / `folio-t28-codex-input-z3YhSR/evidence`
  correctly used the declared native `functions.exec` custom tool and its
  `tools.exec_command` interface. The actual reference-image assertion and
  correlated `custom_tool_call_output` containing the skill text passed. The
  private native rollout records `CODEX_INPUT_FINISHED` and `task_complete`, but
  the UI completion assertion still timed out. The synthetic provider emitted
  completed message items without `response.output_text.delta`; the installed
  adapter's live path projects `item/agentMessage/delta`, while completed
  `agentMessage` items update phase only. The fixture therefore did not deliver
  live assistant text. Exit one; owned teardown completed at 15:15:43.540Z.
  Cancellation/continuation did not execute. These are partial native input/read
  observations in a failed round, not a complete capability pass.

- `codex-input-native-4.log` / `folio-t28-codex-input-5xNSWy/evidence`
  added those missing text-stream events and completed every planned functional
  assertion: exact reference bytes in the native user image block, actual
  `functions.exec` → `tools.exec_command` skill read, a held request on the
  pinned main native thread, desktop Stop and the observed cancelled turn,
  and a new explicit user turn with visible continuation completion. Separate
  auxiliary native threads remained outside the main-turn assertions.
  Runner `/tmp/folio-t28-codex-input-4.mjs` SHA-256:
  `aa4c0910a684a3d131795d3f407bc6ad8519a84960318a9f42221d879f9616ff`.
  This verifies ordinary native input/read/session behavior with the local
  synthetic provider; it does not prove commercial-account authentication.

The fourth round nevertheless exited one. After application/endpoint closure,
the harness observed owned agent-runtime PID 53113 (parent 52991) still present
at 15:17:53.982Z and correctly retained `/tmp/lody-e2e-5CFdvb` instead of removing
its data. A subsequent read-only `ps` found that PID absent; no process kill,
directory-removal retry or retroactive passing status was applied. This is a
distinct failed teardown observation from Pi's `ENOTEMPTY`. The complete Codex
matrix remains incomplete. These rounds did not exercise native permission
responses, design writes, formal commits, image generation/editing, or the
missing generation-hook boundary.

The fourth script actively destroys the held response after the Stop button
disappears, so its connection-close log alone cannot prove native transport
cancellation. The retained CLI trace separately records the actual ACP cancel
request and cancelled turn at 15:17:52.556Z–52.616Z; explicit continuation remains
observed. Later probes must observe transport cancellation before fixture cleanup.

The subsequent [T21 title-task repair](../../implemented/bug-fix/2026-09-11-drain-isolated-title-agents.md)
(source `a6980ff`) cancels and drains both isolated title callers. Its focused and
repository checks passed, but the b86 observations above predate that repair.
A rebuilt installed regression is still required; no earlier failure is cleared
by source inspection or by the repaired mock-based tests.

For the earlier teardown comparison, the retained session directory
`/tmp/lody-e2e-X0OyOz/lody-data/chats/534d0e5f-c712-4a1c-a613-18a1aa1b7a5c`
was observed with birth time `13:42:39.514153Z`; its `chats` parent was
`13:42:39.514031Z`, while `lody-data` retained `13:42:20.645409Z`. These were
Python floating-point `st_birthtime` values rendered to microseconds, not exact
nanosecond integers. The retained `folio-t06-desktop-0HZIU6/evidence/console.log`
brackets removal at `.480`–`.571` seconds. This supports recreation during
removal, without identifying its writer. T21's clean comparison ended after the
12:53:28.778Z launch of `claude-acp.js` and quit at 12:53:32.894Z, as preserved
in `folio-t05-desktop-IrQorC/evidence/cli-logs/2026-09-11.log`.


The root's subsequent external mkdir-observer controls did not identify a writer.
Observer v1 (retained evidence suffix `AlvXSp`) reproduced the original cleanup
failure but recorded zero observer loads; Playwright had removed `NODE_OPTIONS`.
Observer v2 (`qS7nc2`, process handle 89315) restored that environment setting at
the matched actual spawn, still recorded zero loads, and stopped at its guard
before any model request. Its original harness cleanup succeeded. Neither
control establishes Electron/fuse causation or coverage of every process, and
neither is a product lifecycle repair. No installed bytes were modified.


### Kimi and Grok ordinary-capability first rounds

Both rounds used the same immutable installed `b86a1c92` app, selected pinned
runtimes and isolated synthetic OpenAI-compatible configurations; no real account
or paid model was used. The tool-aware fixtures excluded explicit outer title
prompts and preserved each request separately. Neither round attempted design
writes or changed an adapter's hook support.

- `kimi-input-native-2.log`, evidence `folio-t28-kimi-input-PKflk5/evidence`:
  the configured runtime started and delivered the reference bytes in an actual
  user `image_url` block (`request-2.json`). Native Kimi then appended user-role
  `<system-reminder>` messages for date and Auto permission mode. The fixture
  classified the last user-role message instead of the actual preceding user
  request, so neither the initial skill call nor later permission/cancel stages
  ran. The native reminder and captured UI show Auto, despite the isolated
  startup file's manual default; a future permission probe must explicitly
  choose the exposed session mode. The original 120-second assertion failed,
  exit one, and owned cleanup completed at 15:23:30.878Z. This is not evidence
  that native skill reading, permission requests or cancellation are absent.
- `grok-input-native-2.log`, evidence `folio-t28-grok-input-qrpPaB/evidence`:
  actual main requests (`request-3.json` onward) expose `read_file`, `write`,
  native image tools and MCP discovery/use tools. Their user query contains
  `@<local attachment path>` text but no user `image_url` block, so the strict
  inline-image assertion failed. The fixture did not proceed to native skill
  reading, permission requests, cancellation or explicit continuation. The
  original 120-second assertion failed, exit one, and owned cleanup completed
  at 15:26:17.418Z. A path reference is not proof that image bytes reached the
  model, and this failure does not prove the native `read_file` tool cannot
  read that reference image. Direct inline transport and native file reading
  must retain distinct evidence.

The original logs and private scripts remain preserved. No retry was started
after the user's checkpoint instruction. These observations do not close either
Agent's complete installed matrix or any of the three upstream hook blockers.

### Kimi permission, cancellation and Grok file-image follow-up

These further rounds retained the immutable installed `b86a1c92` package and
native runtime pins above. They used only isolated synthetic providers and an
owned disposable non-design file; no missing design hook was enabled.

- `kimi-input-native-4.log`, evidence `folio-t28-kimi-input-WRNIAA/evidence`:
  actual image delivery, native skill Read and selection of the exposed Default
  permission mode succeeded. The native Write refused the owned existing file
  because this Agent had not read it, before any approval prompt. The original
  60-second permission assertion failed, exit one; owned cleanup finished at
  15:44:20.464Z. This was an unmet native read-before-write prerequisite, not a
  missing permission feature. Neither cancellation nor continuation ran.
- `grok-input-native-4.log`, evidence `folio-t28-grok-input-TluNMa/evidence`:
  the fixture followed the actual attachment path with native `read_file`.
  `native-reference-read-4.json` records the correlated native tool result
  `Cannot read binary file` and no model image blocks. The observed catalog
  advertises PNG/JPG reading, and the synthetic PNG's chunk checksums and
  decompression validate. The original image-byte assertion failed at its
  120-second bound, exit one; owned cleanup finished at 15:47:08.791Z. Skill,
  permission and cancellation stages did not run. This retains the failure of
  this configured combination without claiming that every Grok configuration
  lacks image reading.
- `kimi-input-native-5.log`, evidence `folio-t28-kimi-input-vFY8fM/evidence`:
  the fixture first performed native Read of the owned permission file and
  checked the returned original bytes. It then selected Default, clicked Reject
  on the actual Write approval and verified both the native rejected-tool result
  and unchanged bytes. Approve once on the next actual Write produced the exact
  expected 23 bytes. The initial reference bytes and native skill Read also
  passed. Desktop Stop closed held main request 9 with a recorded
  `response-close` signal before fixture cleanup; a new explicit user turn
  subsequently completed visibly. The script did not destroy that response in
  its success path. `native-cancel-transport.json`, both `permission-*-native.json`
  files and the pending/continued screenshots preserve the observations.
  Handle 54557 exited zero; provider work drained and the owned process,
  endpoint and directory cleanup finished at 15:49:09.373Z. Script
  `/tmp/folio-t28-kimi-input-5.mjs` SHA-256 is
  `3773be3c597f54af9825d6a363f17574dd308e2e4da46a5121106266b2e9b382`.

The pinned Grok runtime's extracted `docs/user-guide/26-config-reference.md:403`
declares `models.image_description` as a vision model for transcribing supplied
images. This round's isolated config set only `models.default = "probe"` and
`model.probe`; its custom-model guide does not document an image-support flag in
that model table. No retained request or log yet connects the separate
image-description setting to this `read_file` refusal. A configuration cause is
therefore unproven; no speculative field or paid auxiliary service was enabled.
The extracted docs and config remain under the `TluNMa/grok-home` evidence root.

The successful Kimi ordinary-operation round does not establish design writes,
formal commit/CAS, failure recovery, image generation/editing, model quality or
commercial authentication. All three upstream hook blockers and the complete
T28 acceptance gap remain. Earlier failed rounds retain their original status;
the forthcoming T21-repaired package requires its own installed exit regression.

### Installed title-task repair comparison

A new private macOS arm64 package was built from clean source
`609b2fe2ee1a1a2d58a9c1535a8ee7c59075bae1`, including the T21 isolated title-task
drain repair. The existing full `e2e:build` and DMG packaging process exited zero
(handle 45750), with `--publish never` and external signing discovery disabled.
DMG verification, read-only mount/copy/detach and strict deep code-signature
verification also exited zero (handle 73372). Direct ASAR manifest inspection
confirmed Folio 0.76.0 and that exact `folioSourceCommit`.

- Private package root: `folio-t28-609b2fe2-n_a_wia1` under the same temporary
  parent as the preceding package evidence; installed executable is
  `installed/Folio.app/Contents/MacOS/Folio`.
- DMG SHA-256:
  `cfa0845f2dac4e0bfd2deefbce24dbcbaac88794e842b6df5690631e668908d4`.
- Installed ASAR SHA-256:
  `1d79d9ad363e2690699be2f26ddc8591e0d4f521fc05da8b9ed9efd61c08d104`.
- Identity records: `package-identity.json` and `installed-manifest-identity.json`.

The two controlled native comparisons retained their original scripts, runtime
pins, synthetic providers, assertion bounds and owned cleanup. No new hooks or
product mechanisms were enabled.

- `codex-input-native-4-title-drain.log`, evidence
  `folio-t28-codex-input-GP9A1i/evidence`: the unchanged Codex4 script, SHA-256
  `aa4c0910a684a3d131795d3f407bc6ad8519a84960318a9f42221d879f9616ff`,
  again passed actual image delivery, native skill reading, desktop Stop and
  explicit new-turn continuation. This time handle 5418 exited zero; provider
  work drained and owned process/endpoint/directory cleanup finished at
  2026-09-11T16:03:02.898Z. The old script's active response destruction remains,
  so its connection-close message alone still cannot prove native transport
  cancellation. The earlier failed Codex teardown is not rewritten.
- `pi-cold-native-title-drain.log`, evidence
  `folio-t06-desktop-4bCEyr/evidence`: the unchanged
  `apps/cli/scripts/probe-pi-design-desktop.mjs`, SHA-256
  `15ecbe51cc42bd45b634746be3b03d0f4f738e6376b76d83ddbc75af4e0b3628`,
  ran with cold-cache and resubmit flags enabled and recovery removed from the
  child environment. The initial private cache was empty and unprepared. All
  original functional assertions passed, including actual reference/skill
  delivery and native guarded editing/resubmission. Provider work drained.
  Nevertheless handle 27793 exited one: after application closure at
  16:04:26.915Z and owned process/endpoint checks, directory cleanup started at
  16:04:27.109Z and reported `ENOTEMPTY` at 16:04:27.153Z for
  `/tmp/lody-e2e-zqcACR/lody-data`. The original failure and retained directory
  were preserved without retry or a diagnostic patch.
  A subsequent read-only stat of that retained root found only empty
  `chats/<session>` directories, born at 16:04:27.146012Z and 16:04:27.146073Z
  respectively, within the removal interval. `residual-directory-stat.json`
  retains the observation; birth times came from floating seconds and do not
  identify the writer or establish nanosecond precision.

Thus this installed comparison verifies a passing Codex exit but does not resolve
Pi's cleanup failure or identify its writer. The complete T28 matrix, the three
upstream hook blockers and other unexecuted acceptance cells remain open. These
comparisons do not promote older evidence for other Agents to the new package.
