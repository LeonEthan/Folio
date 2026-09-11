# Preserve Grok native image file reads

Status: proposed
Date: 2026-09-12
Translation: pending

## Abstract

Builtin Grok delegated image file reads to Folio's advertised standard text RPC,
which decoded PNG bytes as UTF-8 before Grok could attach them to model input.
Folio now declines host text-read capability for builtin Grok so its existing
native reader handles images and text. Host writes, permissions, other providers,
and the standard text handler remain unchanged. A paired installed diagnostic
establishes the routing cause; repaired normal-package acceptance remains pending.

## Evidence and decision

Paired independent-file probes used normal source
`5b21c6aacbab1de4798ccecab087d04b69e8e482`, Grok Build 1.0.13 / ACP 0.1.0,
and a synthetic 256×256 PNG (1330 bytes, SHA-256
`8bcb47e5864ff6103692b8c791304aa6a050943ac149d82d07afd5480ed30555`).
They sent no attachment and established zero initial image blocks across all
roles. The fixture placed a separate PNG in the actual owned authoring directory;
it was not Agent-generated.

With normal `fs.readTextFile: true`, native `read_file` issued
`fs/read_text_file`, received 2168 UTF-8 bytes, and failed. Independent decoding
of the original PNG reproduced the response SHA-256
`70eb8ca7365fdf28998835094e40cc1b90e5951aba3b9d2bad68ece3a82764da`.
The main model received a binary error and no image. With only the initialize
read capability changed to false, the correlated native read completed without
that RPC; subsequent main `probe` requests contained the exact PNG in a tool-role
`image_url`. Native SKILL text reading also succeeded. The first round exited 1
at its original image assertion deadline; the contrast exited 0. Both completed
owned process/endpoint/directory cleanup. Synthetic evidence remains outside Git
in the host temporary directories `folio-t28-grok-input-lPtZB6` and
`folio-t28-grok-input-FFuLi0`.

The change uses AgentClient's existing builtin-provider capability negotiation,
alongside its Grok terminal compatibility. It does not reinterpret standard text
responses as binary, invent an extension, alter the public adapter submodule, or
modify the managed runtime. Custom agents named Grok retain host reads; host
writes remain advertised.

## Verification and limits

The focused authentication/initialization suite passes all 12 tests, including
builtin Grok, other builtin providers, custom Grok isolation, and standard UTF-8
write/read with line slicing. CLI typechecking and the full repository check pass. The first full check
failed two Claude authentication tests with inherited provider environment; the
child-only environment-filtered check passed without product/test changes.
Formatting and documentation checks pass. A normal package without a diagnostic
wrapper still needs independent PNG delivery, native text reading, rejection
preserving a disposable file and one-time approval writing exact expected bytes.

This does not resolve Grok's known HTTP cancellation behavior or missing design
generation boundary. Direct attachment input already worked with normal
negotiation; this repair concerns reading a separate PNG through a native tool.
See the [installed matrix](../testing/2026-09-11-installed-five-agent-matrix.md)
and [hook boundary](../architecture/2026-09-11-grok-design-hook-runtime-gap.md).
