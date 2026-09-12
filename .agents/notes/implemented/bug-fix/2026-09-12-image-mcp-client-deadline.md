# Image MCP client deadlines

Status: implemented
Translation: pending

## Abstract

The image service allows 180 seconds per request, but the MCP SDK defaults to 60 seconds. A real Kimi image call returned a client timeout while its already-approved image request continued and saved an image later. Pi's Folio extension used the same SDK default. The bounded correction gives Pi generation/edit calls 210 seconds through existing request options, retaining cancellation and the render default; Kimi design launches use its public environment default while preserving explicit user environment/file settings. Installed validation remains pending.

## Evidence and scope

The normal 50ddd41 installation's synthetic-language/real-image recovery round `CmIQPg` approved `image_3` at 05:07:42 on 2026-09-12. Its correlated native result reported MCP -32001 at 05:08:42; the same owned session saved the recovered PNG at 05:08:56. The probe also had an independent duplicate-permission-handler failure, which must not be attributed to product code. The earlier requests and failed exits remain historical evidence; no generation is repeated for diagnosis.

`image-generation.ts` bounds HTTP work at 180 seconds. SDK 1.29 `shared/protocol.js` defaults requests to 60000 ms when no timeout is supplied. Both Pi extension transport branches supplied only the original abort signal. Generation and edit now supply 210000 ms, allowing 30 seconds for MCP delivery, without extending the upstream HTTP deadline or adding retries. Render retains its default.

Pinned Kimi exposes `KIMI_MCP_TOOL_TIMEOUT_MS` and `[mcp].tool_timeout_ms`; its per-server setting takes precedence. A private acceptance profile can use the public environment setting without modifying the managed artifact. The builtin design launch reads only the timeout field with public smol-toml 1.6.1, the same parser version used by the pinned runtime. The child HOME or explicit KIMI_CODE_HOME locates config.toml; a relative home is resolved against the child workdir. Explicit environment or file settings win, including invalid values left for native validation. Read/parse failures leave the environment unchanged and never log parser text. The pinned ACP host exposes a programmatic configPath, but Folio’s managed CLI launch does not expose a config-file argument; no new path convention is introduced.

## Verification

The Kimi setting is the native global MCP default for the design session, so it also affects non-image tools without a per-server override. Only Pi limits this correction to generation/edit and retains the render default. This broader Kimi scope avoids introducing another transport adapter or patching the runtime.

Deterministic SDK transport tests advance an injected fake clock through 180 seconds and accept actual generation/edit results; cancellation continues through the original AbortSignal. No real image requests are part of these tests. Normal installed Pi image verification remains pending. Nine configuration tests cover missing, explicit, relocated, invalid and unreadable settings; five actual Session spawn-boundary tests verify the constructed environment and non-design/provider isolation. No runtime patches, paid retries, or publication are included.

The combined 19 focused tests, CLI type check, full repository check (including public boundary), formatting and documentation checks passed. The full check used child-only filtering of inherited Claude routing/auth environment, without changing global settings. No installed-package timeout regression is claimed by these source checks.
