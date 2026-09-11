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

### Targeted design-worker diagnostic

Two separately identified diagnostic packages retained the normal probe and
cleanup behavior. Neither diagnostic change belongs in the release source.
Source `18e5d63c85e6002d8201096f8ef0282e70f23b29` traced the Session helper's
mkdir. The installed CLI contained that instrumentation, but the probe exited
one with `ENOTEMPTY` and no trace events, including no initial coverage witness.
Evidence is `folio-t06-desktop-ZRwX2K/evidence` and
`/tmp/folio-workdir-site-evidence-xj2dRd`. This result cannot exclude that helper
or identify the writer. Inspection then found that initial design creation
already makes the directory through the store in the separate `design.js`
worker; Session preparation skips its helper for an existing fixed workdir.

Source `21c1a3d8fd8916bb7a71f8dc35b5e86a7b95ed57` restored the Session helper
and traced only the store's existing mkdir, adding the request operation to
the exact-root PID/PPID, path, time and stack records. The existing build and
private-install pipeline passed (handles 55574 and 60217). The copied package
manifest matched the source; the unpacked worker's imported store chunk
contained the instrumentation. Package root:
`folio-t21-diagnostic-21c1a3d8-c2214699`; DMG SHA-256
`aa1b4c6f26f0984994cf84ed367b0761368571ca525598dbbfca51e09c3754b0`,
ASAR SHA-256
`b4005f911c336fa6f216287b0493f2a12eb6d67afd677fa0308cf4d4987bdfed`.

The single `pi-cold-store-site-1.log` run (handle 52650) exited zero, but its
68 trace events establish a shutdown ownership gap:

- Initial `create` at 16:26:59.636Z/16:26:59.638Z recorded start/completion
  from PID 5826, parent Electron PID 5729. This is an actual site witness.
- The daemon also emitted read/save events at this site. The final two events
  came from a different design worker, PID 6330 with PPID 1: `read` called mkdir
  at 16:27:09.502Z and returned at 16:27:09.504Z for the same artwork directory.
  Its stack names the copied `render-preview-DKaqMbxA.js` store chunk and
  `design.js:55`.
- The harness's 16:27:09.271Z prequit process snapshot did not contain PID 6330.
  Application close began at 16:27:09.273Z; endpoint release was recorded at
  16:27:09.496Z and directory removal ran from 16:27:09.497Z to 16:27:09.539Z.
  Thus an orphaned worker executed this recursive mkdir inside the removal
  interval, although this particular cleanup succeeded.

The native evidence is `folio-t06-desktop-iKRCQW/evidence`; the external
records are `/tmp/folio-design-store-evidence-4HoJLH/workdir.jsonl` and
`launch.jsonl`. A completed mkdir does not establish whether it created a new
directory, and this observation does not identify every historical failure's
writer. The worker discards stderr, so absence of the trace-write sentinel in
retained console logs cannot exclude a trace-write error. No process kill,
cleanup retry, extra grace period or relaxed assertion was used. The zero exit
does not establish a repair: the next product change must prevent reads from
creating directories and close admission, drain requests and await design-worker
exit through the existing application quit flow.

### Codex ordinary permission and cancellation follow-up

These rounds used the normal `609b2fe2` installed package, not a diagnostic or
the subsequent design-worker repair. `codex-permission-native-2.log` (handle
27785, evidence `folio-t28-codex-input-CKVNtS/evidence`) selected the actual Agent
permission mode and reached a native command approval. The runtime offered
`Yes, proceed` and `No, and tell Codex what to do differently`; it did not offer
the fixture's expected decline-without-cancellation option. The original
60-second locator assertion failed. This was an incorrect fixture assumption,
not missing permission support; owned cleanup completed at 16:30:58.994Z.

The corrected third script retained the second failed round and required a
correlated native cancellation result after the actual cancel option, instead
of requiring a further model response in a cancelled turn. It retained the
private marker, successful command result, explicit next user input and true
transport-close assertions. Script SHA-256:
`ed53ecabb3c36ba0c658729fd5859d01c5179d59d9a5474c93b92c53e0f3cb03`.

`codex-permission-native-3.log` (handle 20561) exited zero. Evidence under
`folio-t28-codex-input-9T2Tp9/evidence` establishes:

- The actual cancel choice left the marker unchanged. The next explicit user
  turn contained the native `custom_tool_call_output` for
  `native_permission_NO`, recording that the user aborted execution.
- `Yes, proceed` on the next approval produced native exit code zero and the
  exact expected 23 marker bytes. No persistent allow option was selected.
- Desktop Stop closed the single held main request 9 with a recorded
  `response-close` before fixture cleanup. The success path did not destroy
  that response; a subsequent explicit user turn completed visibly.
- Actual reference bytes and native skill reading also passed. Provider work
  drained, and owned process/endpoint/directory cleanup finished at
  16:37:07.249Z.

The native outcomes and transport signal are retained in
`permission-NO-native-from-next-turn.json`, `permission-YES-native.json` and
`native-cancel-transport.json`. This completes these ordinary-operation
observations on `609b2fe2`; it does not provide Codex's missing design hook,
design writes/CAS, image MCP acceptance or acceptance of a later package.

### Normal design-worker repair regression

The [worker shutdown repair](../../implemented/bug-fix/2026-09-12-design-worker-shutdown.md)
was integrated as `dcc3c975160af592105dce12d4b4bc6a38bacabf`. Root's combined
check, format and documentation checks passed (handle 65953; batch26 logs).
The normal package round `folio-t28-dcc3c975-mwjh4vt6` built and privately
installed successfully (handles 41917 and 14737), including DMG verification,
read-only mounting/copying, detachment and ad-hoc signature verification. Its
copied ASAR manifest identifies exactly that source. DMG SHA-256 is
`7c14d7060abc086e3b3084731c449a194580b7fddbe113110dd4b801e42aa2aa`;
ASAR SHA-256 is
`553daf1d0ad4b33d34bade474e551e5e57f9adfbdd20cebb4c63f9f91e3f03ed`.
Later main commit `8444ed1` changes only the preceding evidence record.

The original Pi probe, SHA-256
`15ecbe51cc42bd45b634746be3b03d0f4f738e6376b76d83ddbc75af4e0b3628`,
ran once with cold cache and resubmission enabled, recovery disabled, and the
normal installed runner. No diagnostic wrapper or instrumentation was used;
the provider, assertions, bounds and cleanup remained unchanged.
`pi-cold-native-design-worker-drain.log` (handle 8828) exited zero. Evidence is
`folio-t06-desktop-zARFWg/evidence`:

- The actual Pi round reported an unprepared empty ACP cache, received the
  reference and skill, exercised nine native edits and six explicit draft
  resubmissions, and reached formal revision
  `ed27aaeeceefb91d13583f5f330309229ce09f017f859a6314c3351478769ff0`.
- Provider requests drained. During quit, a late `design.attach` was rejected
  by `DesignWorker.request` with `Design service is shutting down` at
  16:50:04.449Z, directly exercising the installed admission gate.
- Endpoint release was recorded at 16:50:04.535Z, directory removal started
  at 16:50:04.536Z, and owned teardown finished at 16:50:04.578Z. The isolated
  data root was absent afterward; this round had no `ENOTEMPTY`.

This is a passing normal installed regression for the original cold/resubmit
scenario. The source and deterministic tests establish queue/exit ordering;
this non-instrumented round does not enumerate every historical writer or
prove every shutdown path. Earlier failures remain recorded. It does not
promote another Agent's old-package evidence or close the full T28 matrix.

One additional no-model round covers the formerly skipped no-open-canvas branch.
`zero-bento-native-worker-quit-1.log` (handle 58315) exited zero on the same
normal package. Its external script SHA-256 is
`4a0826b3c528d41c246605b8d955c89b6eb28e1ab38f538cb5461e6633a3c3ef`;
evidence is `folio-zero-bento-worker-weAQBm/evidence/zero-bento.json` and
`console.log`. The application stayed on the chat page without configuring or
sending to an Agent. Missing read returned ENOENT; create and subsequent read
returned the same revision. Worker PID 62098 had Electron PID 60626 as parent
and the exact installed `design.js` entry. It remained alive after
`design.close` with zero canonical views. The original harness then completed
application quit and owned cleanup at 16:56:08.371Z; a signal-zero existence
check returned ESRCH at 16:56:08.374Z. The fixture sent no termination signal.
The worker was already present in the initial snapshot, so this does not claim
the explicit missing read first spawned it. Full recovery replay was not repeated:
the original recovery mode reloads an open design and uses the same final quit;
it does not cover this separate zero-view branch.

### Grok image-description configuration contrast

The pinned Grok 1.0.13 user guide documents `models.image_description` as the
model used to transcribe supplied images and documents custom model IDs with
their own API endpoint. A separate probe added `image_description="probe"`
to the existing private configuration, using the same localhost synthetic
provider, and recorded image blocks from every actual request. It retained
the original native `read_file` call, correlated result, exact-byte assertion,
bounds and cleanup. Script SHA-256 is
`a11b7a83308964b4a905207e5b128df715d0f4395e7611fe11c247c529a59e6e`.

On the normal `dcc3c975` package, `grok-image-config-native-5.log` (handle 48915)
exited one at the original 120-second initial-completion assertion. Evidence
`folio-t28-grok-input-gQgTTW/evidence` retains ten actual request records: eight
main requests, one title request and one other non-main request. All contain
zero image blocks. `native-reference-read-4.json` and later correlated results
still contain `Cannot read binary file` for the owned PNG. Repeated records
follow the runtime's own retries after the provider's image assertion fails;
the probe was not restarted. Owned teardown finished at 16:53:23.210Z.

This documented configuration did not change the observed native file-read
result. There was no request carrying an image to establish a vision helper;
neither its absence here nor synthetic response text proves all Grok vision
paths unsupported. Skill, permission and cancellation stages were not reached.
Earlier failures remain intact, and these independent capabilities still need
their own execution evidence. No upstream code, product model default or
external service configuration was changed.

### Independent Grok ordinary-operation checks

Image failures do not establish failure of unrelated ordinary tools. Separate
no-image probes retained the native skill read, actual read of a private marker
before writing, ordinary permission mode, cancellation and explicit continuation
checks. They use the normal `dcc3c975` package and do not claim image acceptance.

`grok-ordinary-native-1.log` (handle 53917) exited one after successful native
skill and marker reads. Its menu locator expected the proxy source's phrase
`Request approval for protected actions`; the actual Folio menu used
`Request approval before protected actions`, as defined by
`grok-acp-selector-i18n.ts`. Evidence is
`folio-t28-grok-ordinary-GUk7WW/evidence`; cleanup finished at 16:57:39.922Z.

The second script changed only that description. It selected the actual
`Ask Every Time` mode and the native `write` requested permission for
`native_permission_NO`. The displayed choices were session-wide allow, `Yes`,
and `No, and tell Grok what to do differently`. The fixture's exact `No`
locator failed at its original 60-second bound before any choice was clicked.
`grok-ordinary-native-2.log` (handle 72252) exited one; evidence is
`folio-t28-grok-ordinary-hImvsv/evidence`, and cleanup finished at 17:00:35.767Z.
This establishes a real installed permission request, not its successful
resolution. The proxy's synthetic test labels did not establish native labels.
Both failed fixtures remain intact; cancellation and continuation were not reached.

The third script used the actual rejection label and accepted either a native
refusal result in the same turn or that correlated result in the next explicit
user turn. It required real refusal semantics and an unchanged marker, rather
than requiring another model response after a cancelled turn. Script SHA-256:
`4665157c88f4a0a603c6f7cccc6780b93e6e3dc9c86ec04f4a016a2e8d1d20a0`.
`grok-ordinary-native-3.log` (handle 39517) retained evidence under
`folio-t28-grok-ordinary-BCAW74/evidence`:

- Native skill and baseline reads passed. Actual rejection produced the
  correlated `native_permission_NO` refusal and preserved the marker. The
  next actual `Yes` choice produced the correlated successful write result
  and exactly 23 expected marker bytes; session-wide allow was not selected.
- Stop removed the active-turn control. CLI evidence records sending ACP
  cancel at 17:03:41.262Z and a cancelled application outcome at
  17:03:41.317Z. These establish the application-level cancellation path.
- The single held main HTTP request 12 did not close within the unchanged
  60-second transport assertion. Only fixture cleanup then produced
  `response-close`, explicitly labelled `fixture-cleanup`. The script exited
  one, and its subsequent explicit-continuation stage was not executed.
  Owned application cleanup finished at 17:04:41.626Z.

The marker, native refusal and native successful-write records establish ordinary
permission behavior despite the later failure. Application cancellation does
not establish cancellation of the model connection. This transport gap remains
open; no timeout extension, forced-close success claim or runtime patch was used.

A separate continuation-only probe then avoided repeating the passed skill and
permission stages or treating the known transport failure as a prerequisite for
observing another capability. It used a fresh private Session, one held native
main request, actual Stop and one explicit new user turn. It never closed the
held response before fixture cleanup. Script SHA-256 is
`61db2dae930fb013dadb435f601feb3f18d3a0737cfb9e5f161af14e637f1b42`.
`grok-explicit-continue-native-1.log` (handle 38708) exited zero **for this
continuation-only scope**, with evidence in
`folio-t28-grok-continue-KdI2bZ/evidence`. Main request 6 followed the explicit
new input and visibly completed. Old request 3 had no native close signal,
`destroyed=false` and `writableEnded=false` before continuation, afterward and
immediately before cleanup. Its only close signal was labelled fixture cleanup;
owned teardown finished at 17:08:50.992Z. The result explicitly retains
`knownCancellationFailure=true`. This proves explicit continuation is available
while leaving the HTTP cancellation failure, image-input gap and design-hook
requirements unresolved.

### Grok auxiliary-request scope correction and cancellation routing

A bounded read-only audit of the six retained Grok rounds below found a separate
isolated title session attempting the external default `grok-4.5` Responses
endpoint (`cli-chat-proxy.grok.com`) and receiving HTTP 401 with no authentication
context in every inspected round. The title-ready ACP session ID matches the
native inference-failure session ID. Thus the earlier local synthetic-provider
statements apply to the tested main requests, not to every auxiliary request.
These logs do not establish successful authentication, paid execution or model
quality. No new runtime or network request was made for this audit.

The paths below are relative to each previously named evidence root. CLI lines
refer to `evidence/cli-logs/2026-09-12.log`, except TluNMa uses `2026-09-11.log`;
native lines refer to `grok-home/logs/unified.jsonl`.

| Round suffix | Title-ready CLI line | Matching 401 CLI / native line | Observed title ACP session |
| --- | --- | --- | --- |
| TluNMa | 615 | 862 / 190 | 01a09124-e4f0-7370-8468-d729889b4a27 |
| gQgTTW | 612 | 831 / 184 | 01a09161-898c-7603-9dfc-5092590e436c |
| GUk7WW | 485 | 565 / 129 | 01a09167-1e86-75f2-bf9d-21e8c9491d06 |
| hImvsv | 522 | 562 / 127 | 01a09168-f5b4-7b20-8761-27530f36b584 |
| BCAW74 | 522 | 562 / 127 | 01a0916c-a34d-7dc1-a979-73d389133da3 |
| KdI2bZ | 522 | 728 / 137 | 01a09171-6938-7211-bfdf-c24d812e8d7c |

Cancellation routing has additional native evidence in KdI2bZ. Its main Grok
PID 72971, ACP session `01a09171-708a-7681-b19d-ea9a68a5578e`, recorded
`shell.cancel.received` with the session found and cancellation processing of
prompt `ef31128e-602f-4714-935a-f7f972f0ea84` at 17:08:48.532Z (native lines
144–145). The same session then started the explicit new prompt
`e5cfa6d1-e45c-46c5-b4fa-18d061368392` and completed it successfully at
17:08:49.795Z (lines 153–161). This supports delivery of the cancel to the correct
runtime session and actual new-turn completion; it does not contradict the
separately observed old HTTP request remaining open until fixture cleanup.

For image reading, gQgTTW native line 178 records `read_file` / `native_reference`
ending in an error. The retained records do not establish an actual reverse
`fs/read_text_file` or `_x.ai/fs` call or an associated Folio handler error.
Consequently neither Folio's UTF-8 text-file handler nor its unsupported extension
handling is a proven cause of this PNG failure. Previous failures and the
unresolved image/HTTP-cancellation boundaries remain unchanged.

### Normal title-model default regression

The normal private macOS arm64 package at `folio-t28-5b21c6aa-m3qsowke`
contains source `5b21c6aacbab1de4798ccecab087d04b69e8e482`, including the
[title-model default fix](../../implemented/bug-fix/2026-09-12-title-runtime-model-default.md).
Build/package 23257 and installation 69563 exited zero. DMG verification,
read-only mounting, copying, detaching and ad-hoc signature verification passed.
Independent hashes of the installed artifacts matched:

- DMG: `d3184d9729e8b7a22c3fcd678021c526c0aa92fe38dd5cee09ceee7890713865`.
- ASAR: `925cb6c1b29695b49e615dba077927fb36235d261125e0e1b28756ab0812b3b3`.

Directly reading the installed ASAR manifest confirmed Folio 0.76.0, its normal
desktop entry and that exact source commit. This package has no diagnostic
instrumentation and was not publicly published or notarized.

The first title regression, handle 67450, **failed**. Its retained evidence is
`folio-t21-grok-title-default-5ZmGTB/evidence`; normal-package log
`grok-title-default-native-1.log`. Grok 1.0.13 made two distinct kinds of request
to the private local provider: requests 1/4 had the sole `session_title` tool and
a system instruction for Grok's own session naming, with model `grok-4.6`;
requests 2/3 carried Folio's isolated title task through the normal native tool
catalog, with model `probe`. The fixture incorrectly required every request to
use `probe` and interrupted the native auxiliary requests. These observations
must not be reported as a clean successful round or as an automatic retry fix.

The helper's initial model was `probe`; its ACP session
`01a09187-84f1-7b10-86e8-41191d189ff4` returned successfully (CLI lines 489–544).
However, the subsequent saved-config inspection used the virtual ASAR CLI path
instead of the product's unpacked CLI path and failed module resolution. It did
not verify the stored title configuration. Owned cleanup completed at
17:32:58.388Z. The first failure remains evidence; package success and these
partial observations do not complete the title regression or T28.

The second round, handle 53806, also **failed**, with evidence at
`folio-t21-grok-title-default-2-2YXrIR/evidence` and normal-package log
`grok-title-default-native-2.log`. The corrected fixture classified the observed
native `session_title` tool/system instruction separately and responded using its
actual schema. All six requests reached the local provider without assertion
errors: native auxiliary requests 1/4 used `grok-4.6`, Folio isolated-helper
requests 2/3 and main-session requests 5/6 used `probe`. The helper completed
successfully. This supports the model/endpoint correction while keeping the
native runtime's separate naming behavior visible.

Saved-config inspection still failed: the correctly unpacked `agent-config list`
command required `LODY_AUTH_URL`. Its existing `command-runtime.ts` auth and
workspace-manager path is cloud-specific, so that command does not establish
local desktop catalog contents. No authentication URL, credentials or cloud
access were supplied to make the fixture pass. Owned cleanup completed at
17:36:43.274Z. The saved-config assertion remains unverified in this round;
the previous source/UI regression tests and native model observations retain
their separate scopes.

The independent UI-only saved-config case, handle 82620, **passed** on the same
normal package. `folio-t21-grok-title-storage-b4CzRx/evidence/saved-title-config.json`
records a read-only SQLite transaction over the actual local Machine Flock
snapshot and ordered updates, decoded with the existing Flock/shared readers.
The uniquely matched provider row `bb7d6629-0e6e-4cb6-a917-5a85a043750f` contains
only `interaction_mode=plan` and `reasoning_effort=low` in its title options,
with no model key. The case created the provider through the UI, sent no Agent
turn, asserted zero model requests and completed owned cleanup at 17:43:31.431Z.
Together with the second round's actual helper/model/endpoint evidence, this
verifies the two installed paths affected by the source fix. It does not
reclassify either earlier failed script as passed, erase legacy explicit
overrides or establish full T28 acceptance.

### Grok PNG file-RPC observation

The external transparent stdio recorder in round
`folio-t28-grok-input-N76Xyl` left the normal `5b21c6a` package and native Grok
1.0.13 bytes unchanged. It is a diagnostic wrapper launch, not an unwrapped
release acceptance run. Handle 97521 exited one after the original 120-second
image assertion; owned cleanup finished at 17:40:37.050Z. The retained
`evidence/grok-fs-wire.jsonl` provides a direct process/session/request chain:

- Recorder 79086 launched native PID 79087. In ACP session
  `01a0918c-c4d7-7410-9d87-53f9ddbbda02`, `native_reference` targeted the owned
  reference PNG at 17:38:39.193Z.
- Native `fs/read_text_file` request ID 0 named that same file at .204Z. Folio
  returned a string `content` at .207Z; the tool reported failure at .215Z.
- Independently decoding the exact 68-byte fixture PNG as UTF-8 reproduces the
  response's 82 bytes and SHA-256
  `c22f7d7a1419dcc393fde2c846c05068413aa26db38acf927b8c3b402d6f441f`.
  Its PNG chunk checksums and compressed payload are valid.

The resulting native tool response says the file is binary, with no image blocks
delivered to the main model. This replaces the previous unproven routing
inference with observed text-RPC delivery; it does not authorize returning binary
data through ACP's text-file contract. No `_x.ai/fs` request was recorded. The
pinned documentation does not establish a native-file fallback when client
`readTextFile` is unavailable; that behavior and any permission/write/hook
consequences require separate evidence before changing the product adapter.

The single-variable capability contrast at `folio-t28-grok-input-pkha0p`
changed only the native initialize frame's `fs.readTextFile` from true to false;
`writeTextFile` remained true. This is explicitly a non-transparent diagnostic,
not a production change. Handle 74961 exited one and cleanup completed at
17:46:37.551Z. The native tool now completed without a reverse text-file request,
but its result explicitly said the 1×1 image was too small to attach for vision.
No actual image blocks reached the model, so the original image assertion still
failed. The observation separates text-RPC routing from a second fixture-size
constraint; neither tool completion nor a textual image description counts as
successful image input. A same-size image comparison remains necessary before
claiming that the alternative file route solves the input problem.

The subsequent same-size pair used a deterministic 256×256 RGBA PNG made with
the existing `pngjs` dependency, verified by chunk CRCs and pixel roundtrip:
1,330 bytes, SHA-256
`8bcb47e5864ff6103692b8c791304aa6a050943ac149d82d07afd5480ed30555`.
Both scripts **failed** their original completion assertion and completed owned
cleanup: true/transparent handle 85182 at 17:50:54.651Z
(`folio-t28-grok-input-yEr7Wi`), false/contrast handle 54812 at 17:53:55.234Z
(`folio-t28-grok-input-ya11tr`).

Crucially, the larger reference was already attached to the actual main-model
request under the existing true capability: yEr7Wi requests 5/6 contained a user
`image_url` with the exact PNG bytes/hash. The false-capability requests 4/6 also
contained that image. The user content was now a text/image array, but the old
fixture selected only string-valued user queries and never requested
`native_reference`. Consequently these rounds prove actual direct reference
input, not tool-based file reading or a need to disable the capability in the
product. Neither recorded a file request or a `native_reference` update.

**Scope correction:** the 1×1 failures do not show that Grok cannot receive
ordinary reference images. Direct 256×256 input is observed with unchanged
protocol forwarding. Independently reading another PNG must start without an
attached image and correlate the new image delivery to that file's actual native
tool result; otherwise an existing attachment can falsely satisfy a file-read
assertion. Full T28 and the previously observed HTTP-cancellation failure remain
unresolved.

### Independent PNG read-path comparison

The next pair starts without a composer attachment and verifies zero image blocks
across every role in the first main-model request. A deterministic 256×256 PNG
with the same 1,330 bytes/hash above is created exclusively by the synthetic
fixture in the actual session authoring directory. The provider then requests
native `read_file` for that file; only new image blocks accompanying its
`native_reference` tool result count as success. The normal `5b21c6a` package,
native Grok 1.0.13, image bytes, provider behavior and 120-second assertion are
identical; only the external initialize-frame contrast changes the read capability.

| Capability and evidence | Observed result |
| --- | --- |
| Existing `readTextFile=true`, transparent wrapper; handle 69857, `folio-t28-grok-input-lPtZB6/evidence` | Failed with exit 1. Native session `01a091a4-13f6-7ac1-ad0f-df5f91797d9e` requests `fs/read_text_file`, ID 0, for the independent PNG. The host returns a 2,168-byte UTF-8 string, then the native tool reports a binary-file error; subsequent model requests have no image blocks. Owned cleanup finishes at 18:06:01.876Z. |
| External `readTextFile=false`, `writeTextFile=true`; handle 1521, `folio-t28-grok-input-FFuLi0/evidence` | Passed with exit 0. The initial main request 5 has no images. Native session `01a091a6-72fa-7640-a33d-414b8deff39b` completes `native_reference` without a reverse file RPC. Requests 6–8 contain its tool-role PNG image with exact original bytes; the following skill read and visible completion also succeed. Owned cleanup finishes at 18:06:43.242Z; an independent process check finds all 13 recorded owned processes absent. |

Root independently reproduced the first response by UTF-8 decoding and re-encoding
the PNG: SHA-256
`70eb8ca7365fdf28998835094e40cc1b90e5951aba3b9d2bad68ece3a82764da`.
The successful contrast's images are in the **tool** role; counting user-role
images alone would incorrectly report zero. This comparison establishes the
specific reading-path incompatibility and a working native path. It is not a
product fix, a normal unwrapped release pass, a permission/write regression or
proof of Grok design-hook support. Standard ACP text responses must remain text;
any product adaptation requires the unchanged native path and existing permission
behavior to be verified together. The HTTP-cancellation failure remains separate.


### Normal Grok native-read repair acceptance

The [native-read repair](../../implemented/bug-fix/2026-09-12-grok-native-file-read.md)
uses builtin Grok's native reader while retaining host text writes and all other
providers' negotiation. Exact product source
`81d54b6194017ba91aaec78509f9364ef743aa5f` passed the full repository check after
removing inherited Claude provider environment only in the check child process;
the first environment-contaminated check remains a failed record. Source, text
RPC contracts and tests were not changed to hide that failure. Root reviewed and
fast-forwarded the exact checked code.

Build/package handle 44930 and installation 2232 exited zero. The normal private
round is `folio-t28-81d54b61-njxrk821`; root independently hashed the DMG and
installed ASAR and directly extracted the ASAR manifest to verify Folio 0.76.0,
its normal entry and that source commit:

- DMG: `aac7aa4c81056acae144b8e0521535dca1d031c86b484ea7074b4362afbe50d2`.
- ASAR: `93609f470b607c88e41452dfdd80bf1a28e34dbffc957c9832ba0d91ef503aef`.

Both following rounds directly launch the unchanged pinned Grok 1.0.13 executable,
without either diagnostic wrapper. Only provider responses are synthetic/local.

| Round | Executed result |
| --- | --- |
| `grok-native-image-fixed-1.log`, handle 47383, `folio-t28-grok-input-tvSRo6/evidence` | Exit 0. Main request 5 has no image in any role; the independent native read's tool result carries the exact 1,330-byte PNG in requests 6–8. Native SKILL reading and visible completion pass. Owned cleanup finishes at 18:22:54.579Z. |
| `grok-native-permission-fixed-1.log`, handle 56905, `folio-t28-grok-ordinary-94z2bY/evidence` | Exit 0. Native SKILL and marker reads succeed. Actual No returns a correlated write refusal and preserves the original file; Yes returns native success and writes exactly the expected 23 bytes. Root independently reads those retained bytes. Owned cleanup finishes at 18:23:42.336Z. A no-tool request 13 remains unclassified and is not counted as main execution evidence. |

These results close this local image-file routing defect and establish its tested
text/permission compatibility. They do not complete T28, repeat all five-Agent
cases, establish paid image-service quality or fix the known HTTP cancellation
and native generation-hook gaps. Earlier failures and other package identities
remain unchanged.

### Codex deferred image tool catalog

On the normal `81d54b6` package, native Codex 0.153.4 exposes Folio image tools
through its deferred `functions.exec` catalog. Handle 17588 exited 0; evidence is
`folio-t28-codex-input-UVhzbI/evidence`, with package log
`codex-image-catalog-native-1.log`. The correlated `native_image_catalog` result
lists `mcp__lody__folio_generate_image`, `mcp__lody__folio_edit_image`,
`mcp__lody__folio_render_preview` and native `view_image`, including their actual
argument declarations. Their absence from the earlier unexpanded tool listing
therefore does not establish unavailable capability.

The isolated settings UI starts with an empty required image model and disabled
Save; explicitly setting `synthetic-image` permits saving the local synthetic
connection. The actual native catalog result and visible completion are observed;
owned cleanup finishes at 18:41:10.921Z. Root inspected the correlated output.
This proves configuration and discovery only: generate/edit execution, native
reading of their outputs and the full combined design journey remain unverified
for Codex at this point. No paid request or runtime change was made.

The first subsequent generate/edit attempt, handle 88287, exited 1 with evidence
in `folio-t28-codex-input-2IbPst/evidence` and package log
`codex-image-mcp-native-1.log`. Native `folio_generate_image` was rejected before
image-service execution because automatic approval reported `guardian assessment
was not valid JSON`. The synthetic provider had answered all non-main requests
with plain text, but actual requests 5–7 use Codex's structured approval schema;
request 3 independently uses a structured native-title schema. Root inspected
the actual planned action, schema and correlated rejection. This is a fixture
response-format failure, not evidence of a broken Folio image endpoint. The
failed result is preserved; owned cleanup finishes at 18:48:03.343Z. The next
fixture must honor these actual schemas without disabling approval or relaxing
image-delivery assertions.

### Codex native generate/edit and image reading

The corrected synthetic provider retains native automatic approval and the same
permission mode. It validates the actual approval schema, reviewed main-session
identity, exact generate/edit arguments and owned workspace paths before returning
the structured decision. The edit additionally verifies the generated file's
bytes. Unrecognized actions are refused. A proposed v2 parser was corrected
offline against the first round's actual multipart request before any execution;
v2 was never run. Runtime code and image assertions were unchanged.

Handle 56219 exited 0 on the normal `81d54b6` package; evidence is
`folio-t28-codex-input-YqNhB7/evidence`, package log
`codex-image-mcp-native-3.log`. Actual native MCP calls generate one asset and
upload its exact 1,330 bytes for editing through the local configured service.
Both requests carry the explicit `synthetic-image` model and match the fixture
credential. Editing returns a distinct 1,393-byte PNG, SHA-256
`f69751b74bbc7f1d97c1a101a326a30a516c1ac979c66a71973e70ca77e98628`,
and preserves the original generated file. Both assets remain in that Session's
`media/` directory.

Native `view_image` reads each result with original detail. The correlated
`native_view_generated` and `native_view_edited` outputs each contain the exact
respective PNG in actual subsequent model input; root independently decoded and
hashed both. Approval requests 5 and 8 match the same main-session identity and
the exact allowed fixture actions. Owned cleanup finishes at 18:51:20.544Z.
This establishes Codex generate/edit transport and actual image reading with
synthetic local services. It does not test paid service quality, error retries,
render/live-preview behavior, native design hooks, formal commits or human
visual judgment. Full T28 remains incomplete.

### Kimi native generate/edit and image reading

Handle 93922 exited 0 on the normal `81d54b6` package with the unchanged pinned
Kimi `0.39.1-lody.f255222661c9` artifact. Evidence is
`folio-t28-kimi-input-j8pbJo/evidence`, package log
`kimi-image-mcp-native-1.log`. The actual first request's tool catalog supplies
generate/edit and `ReadMediaFile` schemas; all roles initially contain no images.
The explicit image model configuration and actual Default/Manual mode are used,
with single-use permission responses recorded for generation and editing.

The real MCP generation returns the same 1,330-byte PNG used above. Editing
uploads those exact bytes and returns the distinct 1,393-byte PNG, leaving the
original unchanged. Both provider requests use `synthetic-image` and the fixture
credential. Six model requests include two `ReadMediaFile` calls with
`full_resolution: true`; each correlated tool result is followed by its own
single, exact image in the native provider's user-media message. Neither image
is counted before its corresponding read. Root independently decoded and hashed
both media blocks and inspected the request/permission records.

That media placement is present in the actual tested `dist/main.mjs`; inspecting
the newer working-tree Kimi submodule alone would not prove the pinned artifact's
behavior. Owned cleanup finishes at 18:57:29.414Z. These results establish Kimi
generate/edit transport and native image reading with local synthetic services.
Native hooks, final commits, live previews, error retries and visual-quality
judgment are not exercised by this round. Full T28 remains incomplete.

### Grok discovers the configured Folio image tools

Handle 27845 exited 0 on the normal `81d54b6` package with unchanged native Grok
1.0.13; evidence is `folio-t28-grok-input-FepPf1/evidence`, package log
`grok-image-search-native-1.log`. After explicit image-connection configuration,
native `search_tool` returns `status: ready`, no pending note, and the qualified
`lody__folio_generate_image` and `lody__folio_edit_image` names with their actual
input schemas. Root inspected the full correlated `native_image_search` result.
The native `use_tool` contract requires these discovered qualified names; Grok's
separately listed `image_gen` and `image_edit` tools are not Folio MCP execution.
Owned cleanup finishes at 19:02:32.759Z. This round establishes configuration and
discovery only; generation, editing and reading their output are not yet verified
for Grok.

The first complete-call attempt, handle 84937, exited 1 at the original UI
completion deadline; evidence is `folio-t28-grok-input-UeP2DB/evidence`, package
log `grok-image-mcp-native-2.log`. The native `use_tool` call reached an actual
permission request for `lody__folio_generate_image`. Its UI offers `allow once`,
whereas the fixture incorrectly awaited the native file-write button `Yes`.
The panel also shows the qualified tool name rather than the fixture prompt.
Root inspected the saved body and correlated CLI permission request. No image
service call or asset result had occurred, so this failure does not establish a
missing MCP tool or an invalid result wrapper. Owned cleanup finishes at
19:09:25.886Z. The preceding v1 script was never executed; its wrapper-depth
bound was corrected offline before this round. The next fixture must select the
actual single-use permission action for the currently pending image tool while
preserving mode, byte checks and the failed record.
