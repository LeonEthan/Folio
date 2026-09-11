# Packaged design verification and isolated identity

Status: implemented
Translation: pending

## Abstract

Folio needs evidence from installed application bytes, because development builds
and native CLI probes do not establish that the desktop can start or export.
The existing Bento resource and design journeys now inspect collected package
bytes, a non-sample canvas size, rejected writes and quit protection. Actual
macOS packaging exposed a package-manager mismatch that omitted `debug` and
prevented startup; the packaging runner now pins its collector to the same pnpm
entrypoint. Folio also disables the inherited Lody updater even when a legacy
force-enable environment variable is present. Platform runtime verification
remains separate from resource-only cross-host packaging.

## Decisions and discovered failures

The existing after-pack probe booted the CLI and native bindings successfully
while the desktop main process failed before reaching the design journey.
Electron Builder invoked a global pnpm 11.19.0 despite the outer packaging command
using the repository's pnpm 10.20.0. Its dependency collection omitted `debug`,
which `electron-updater` requires through `builder-util-runtime`. A private shim
inside the existing temporary configuration directory pins descendant `pnpm`
commands to the caller's explicit entrypoint. No global installation or manually
maintained runtime dependency list is introduced. The regression test executes
the shim with spaces and a quote in its path and verifies forwarded arguments.

The existing local updater policy allowed `LODY_ELECTRON_ENABLE_UPDATER=1` to
activate Lody release metadata in a Folio package. The local policy now always
disables updates; startup, checking and installing reject through the existing
service gate. Non-local policy behavior is retained. No Folio feed, release
publication or new update system is added.

The existing P1 conflict probe used Undo immediately after recreating an editor
whose undo history was empty. It therefore made no edit and could not establish
a save conflict. The probe now clicks the existing shape control to make a real
unsaved change, then verifies conflict preservation and the existing Keep editing
choice during quit. This corrects the probe, not product behavior.

## Verification approach

This extends the [resource CI evidence](2026-09-09-bento-resource-ci.md), rather
than treating that historical CI run as evidence for the current installer.
After-pack verifies hashes and licenses in `app.asar.unpacked/resources/design`
on every target. Existing native probes retain their platform/architecture gates.
P0 verifies the bundled font and image; P1 verifies 913×617 exports, save/reopen,
invalid-document and missing-font-asset rejection without replacing saved bytes,
and disabled update methods for both values of the legacy force-enable flag.
The quit probe simulates the explicit native dialog choice; it is not a human
visual-quality judgment.

Tests use private application copies and synthetic data outside the repository.
Packaged Electron ignores `LODY_ELECTRON_USER_DATA_DIR`, so launch also passes
`--user-data-dir` to Chromium. An isolated Electron entrypoint confirmed that
`app.getPath('userData')` already resolves to this directory before app readiness
or product-module imports. P1 repeats that assertion before creating a design.
`LODY_DATA_DIR` remains separately isolated. No user installation or data is
replaced or migrated.

## Execution record

Initial macOS arm64 DMG checks passed integrity, ad-hoc signature verification,
Bento bytes and real native CLI probes, but failed desktop startup due to missing
`debug`; this failed artifact is not an accepted package. Repackaging with the
pinned collector allowed the copied application to run P0 successfully on macOS
26.6.2 (25G83), Electron 39.5.1 and Chromium 142.0.7444.265. P0 reopened identical
800×600 bytes and verified transparent PNG and white JPEG corners. The updated
P1 journey and final artifact identity will be recorded after their execution.

Windows x64 cross-host packaging passed Bento resources, native artifact presence
and `en-US.pak`; native execution was explicitly skipped on the macOS arm64 host.
Linux cross-host packaging and the final platform record are still pending at
this implementation checkpoint. Neither cross-host build establishes runtime or
installer support. No Developer ID signing, notarization or publication was done.

## Checks and limits

The full repository check passed type, lint, tests, i18n and platform checks, then
its public-boundary scan rejected a generated test `.app` placed under `output`.
Moving that private artifact outside the repository made the same boundary check
pass; no source allowlist was weakened. The focused Electron suite and packaging
shim regression pass. Final formatting/documentation checks and package evidence
are recorded in the follow-up verification revision.
